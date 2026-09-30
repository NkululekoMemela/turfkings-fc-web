import { auth, db } from "../firebaseConfig.js";
import {
  collection, doc, onSnapshot, query, where,
  runTransaction, serverTimestamp,
} from "firebase/firestore";

export function canManageClubField(club, user) {
  if (!club || !user?.uid) return false;
  return club.ownerUid === user.uid ||
    club.createdByUid === user.uid ||
    (club.adminUids || []).includes(user.uid) ||
    (user.emailVerified === true &&
      (club.adminEmails || []).includes(user.email));
}

export function watchClubFieldMembership(clubId, onMembership, onError) {
  return onSnapshot(doc(db, "clubFieldMemberships", clubId),
    snapshot => onMembership(snapshot.exists() ? snapshot.data() : null),
    onError);
}

export function watchFieldMemberClubs(venueId, onClubs, onError) {
  return onSnapshot(
    query(collection(db, "clubFieldMemberships"), where("venueId", "==", venueId)),
    snapshot => onClubs(snapshot.docs.map(item => ({
      ...item.data(), clubId: item.id,
    }))),
    onError,
  );
}

export async function joinClubToField({ clubId, venueId }) {
  const user = auth.currentUser;
  if (!user?.uid || !clubId || !venueId) {
    throw new Error("Sign in as a Club admin and choose a Field.");
  }
  const membershipRef = doc(db, "clubFieldMemberships", clubId);
  return runTransaction(db, async transaction => {
    const club = await transaction.get(doc(db, "clubs", clubId));
    const field = await transaction.get(doc(db, "leagueVenues", venueId));
    const previous = await transaction.get(membershipRef);
    if (!club.exists() || !field.exists()) {
      throw new Error("The Club or Field no longer exists.");
    }
    if (!canManageClubField(club.data(), user)) {
      throw new Error("Only this Club's admin can choose its Field.");
    }
    const old = previous.exists() ? previous.data() : null;
    if (old?.venueId === venueId && old.status === "active") return;
    transaction.set(membershipRef, {
      clubId,
      venueId,
      status: "active",
      previousVenueId: old?.venueId || "",
      joinedAt: old?.joinedAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
      changedByUid: user.uid,
    });
  });
}
