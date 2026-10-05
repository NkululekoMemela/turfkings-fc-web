import {
  doc, onSnapshot, runTransaction, serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "../firebaseConfig.js";
import { getPlayerDoc } from "../core/clubFirestorePaths.js";
import {
  leagueBookingScope, leaguePlayerLimit, reserveLeaguePlayer,
} from "../core/leagueBookingPolicy.js";
import { canManageClubField } from "./clubFieldMembershipRepository.js";

export const leagueBookingRef = scope =>
  doc(db, "leagueClubBookings", leagueBookingScope(scope));

export function watchLeagueBooking(scope, onValue, onError) {
  return onSnapshot(leagueBookingRef(scope), snapshot =>
    onValue(snapshot.exists() ? snapshot.data() : null), onError);
}

export async function changeLeagueBooking({
  scope, action, player = null, limit = null, actorMemberId = "",
}) {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error("Sign in to book league games.");
  if (!["configure", "reserve", "cancel", "paid", "unpaid"].includes(action)) {
    throw new Error("Choose a valid league booking action.");
  }
  const ref = leagueBookingRef(scope);
  return runTransaction(db, async transaction => {
    const clubSnap = await transaction.get(doc(db, "clubs", scope.clubId));
    const venueSnap = await transaction.get(doc(db, "leagueVenues", scope.venueId));
    const membershipSnap = await transaction.get(
      doc(db, "clubFieldMemberships", scope.clubId));
    const bookingSnap = await transaction.get(ref);
    const memberSnap = actorMemberId ? await transaction.get(
      doc(db, "clubs", scope.clubId, "members", actorMemberId)) : null;
    const profileSnap = player?.sourcePlayerId ? await transaction.get(
      getPlayerDoc(db, player.sourcePlayerId, scope.clubId)) : null;

    if (!clubSnap.exists() || !venueSnap.exists()) {
      throw new Error("The Club or Field is unavailable.");
    }
    const administrator = canManageClubField(clubSnap.data(), user);
    const member = memberSnap?.data();
    const ownMembership = member?.status === "active" && (
      member.uid === user.uid ||
      (user.emailVerified && member.email === user.email)
    );
    if (!administrator && !ownMembership) {
      throw new Error("An active Club membership is required.");
    }
    const membership = membershipSnap.data();
    if (membership?.status !== "active" || membership.venueId !== scope.venueId) {
      throw new Error("This Club is no longer a member of this Field.");
    }
    const season = venueSnap.data().league?.activeSeason;
    const day = (season?.matchDays || []).find(item => item.id === scope.matchDayId);
    if (season?.id !== scope.seasonId || season.status !== "active" ||
        !(season.clubIds || []).includes(scope.clubId) || !day ||
        day.status !== "scheduled" || !season.schedulePublishedAtMs) {
      throw new Error("This league match day is unavailable for booking.");
    }
    const fixture = (season.fixtures || []).find(item =>
      item.matchDayId === day.id &&
      [item.clubAId, item.clubBId].includes(scope.clubId));
    if (!fixture) throw new Error("Your Club has no game on this match day.");
    if (fixture.status !== "scheduled" || season.liveMatches?.[fixture.id]) {
      throw new Error("This Club’s match has already started.");
    }
    const sideSize = { "5_V_5": 5, "6_V_6": 6, "7_V_7": 7, "11_V_11": 11 }[
      season.gameFormat
    ] || 5;
    const fieldMaximum = Number(season.maxPlayersPerClubPerDay) || 30;
    const old = bookingSnap.data();
    let capacity = old?.limit;
    const entries = { ...(old?.entries || {}) };

    if (action === "configure") {
      if (!administrator) throw new Error("Only a Club administrator can set the limit.");
      capacity = leaguePlayerLimit(limit, sideSize, fieldMaximum);
      if (Object.keys(entries).length > capacity) {
        throw new Error("The limit cannot be lower than existing bookings.");
      }
    } else {
      if (!old) throw new Error("Ask your Club administrator to set the player limit first.");
      if (!player?.playerId || !profileSnap?.exists()) {
        throw new Error("Choose a registered Club player.");
      }
      const profile = profileSnap.data();
      if (String(profile.status || "active").toLowerCase() !== "active") {
        throw new Error("This player is inactive.");
      }
      const fullName = String(
        profile.fullName || profile.displayName || profile.name || profile.playerName || ""
      ).trim();
      if (!fullName) throw new Error("This player needs a registered name.");
      const current = entries[player.playerId];
      if (action === "reserve" && current) return;
      if (action === "reserve") {
        const next = reserveLeaguePlayer({
          entries,
          player: { ...player, fullName },
          limit: capacity,
        });
        if (next !== entries) {
          entries[player.playerId] = {
            ...next[player.playerId],
            bookedByUid: user.uid,
            actorMemberId,
            bookedAt: serverTimestamp(),
          };
        }
      } else if (action === "cancel") {
        if (!current) return;
        if (current.paymentStatus === "paid") {
          throw new Error("Ask the Club administrator to reverse payment before cancelling.");
        }
        if (!administrator && current.bookedByUid !== user.uid) {
          throw new Error("Only the booking owner or Club administrator can cancel.");
        }
        delete entries[player.playerId];
      } else {
        if (!administrator) throw new Error("Only a Club administrator can confirm payment.");
        if (!current) throw new Error("Book this player before confirming payment.");
        entries[player.playerId] = {
          ...current,
          paymentStatus: action === "paid" ? "paid" : "pending",
          paymentConfirmedByUid: user.uid,
          paymentUpdatedAt: serverTimestamp(),
        };
      }
    }

    transaction.set(ref, {
      ...scope,
      matchDayIndex: season.matchDays.findIndex(item => item.id === day.id),
      fixtureId: fixture.id,
      fixtureIndex: season.fixtures.findIndex(item => item.id === fixture.id),
      limit: capacity,
      entries,
      changedPlayerId: player?.playerId || "",
      updatedByUid: user.uid,
      updatedAt: serverTimestamp(),
    });
  });
}
