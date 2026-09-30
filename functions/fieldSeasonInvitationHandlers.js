const {onDocumentWritten, onDocumentUpdated} =
  require("firebase-functions/v2/firestore");
const {FieldValue, FieldPath} = require("firebase-admin/firestore");
const crypto = require("node:crypto");

function registrationOpen(season, now = Date.now(), current = null) {
  return Boolean(
    season?.id && season.announcedAtMs &&
    season.status === "active" && season.registrationOpen === true &&
    !season.firstPlayAtMs &&
    !(season.results || []).length &&
    !(season.matchDayHistory || []).length &&
    !current?.confirmedLineupSnapshot &&
    (season.signupDeadlineAtMs == null ||
      (Number.isFinite(season.signupDeadlineAtMs) &&
       now <= season.signupDeadlineAtMs))
  );
}

function adminKeys(club) {
  return new Set([
    club.ownerUid, club.createdByUid,
    ...(club.adminUids || []), ...(club.adminEmails || []),
  ].filter(Boolean).map(value => String(value).trim().toLowerCase()));
}

function buildHandlers({db, sendBatch, region}) {
  async function inviteCurrentSeason(venueId, clubId) {
    const venueRef = db.collection("leagueVenues").doc(venueId);
    const memberRef = db.collection("clubFieldMemberships").doc(clubId);
    const clubRef = db.collection("clubs").doc(clubId);

    const eligible = await db.runTransaction(async tx => {
      const venueSnap = await tx.get(venueRef);
      const memberSnap = await tx.get(memberRef);
      const clubSnap = await tx.get(clubRef);
      const season = venueSnap.data()?.league?.activeSeason;
      if (!season?.id) return null;
      const currentSnap = await tx.get(
        venueRef.collection("seasons").doc(season.id)
          .collection("matches").doc("current")
      );
      const membership = memberSnap.data();
      if (!clubSnap.exists || membership?.status !== "active" ||
          membership.venueId !== venueId ||
          !registrationOpen(season, Date.now(), currentSnap.data())) return null;

      const existing = season.invitations?.[clubId];
      if (existing && existing.status !== "pending") return null;
      if (!existing) {
        tx.update(venueRef,
          new FieldPath("league", "activeSeason", "invitations", clubId), {
            clubId, clubName: clubSnap.data().name || clubId,
            status: "pending",
            invitedByUid: season.announcedByUid || venueSnap.data().ownerUid,
            invitedAt: FieldValue.serverTimestamp(),
          },
          "updatedAt", FieldValue.serverTimestamp()
        );
      }
      return {season, venue: venueSnap.data(), club: clubSnap.data()};
    });
    if (!eligible) return;

    const {season, venue, club} = eligible;
    const id = crypto.createHash("sha256")
      .update(JSON.stringify(["field-season", venueId, season.id, clubId]))
      .digest("hex");
    const deliveryRef = db.collection("notificationDeliveries").doc(id);
    const devices = await clubRef.collection("notificationDevices").get();
    const keys = adminKeys(club);
    const seen = new Set();
    const tokenRecords = [];
    for (const deviceSnap of devices.docs) {
      const device = deviceSnap.data();
      const matches = [device.firebaseUid, device.email]
        .filter(Boolean).some(value =>
          keys.has(String(value).trim().toLowerCase()));
      if (!device.enabled || !device.token || !matches || seen.has(device.token)) continue;
      seen.add(device.token);
      tokenRecords.push({token: device.token, ref: deviceSnap.ref});
    }
    if (!tokenRecords.length) return;

    const claimId = crypto.randomUUID();
    const claimed = await db.runTransaction(async tx => {
      const delivery = await tx.get(deliveryRef);
      const freshVenue = await tx.get(venueRef);
      const freshMembership = await tx.get(memberRef);
      const current = await tx.get(
        venueRef.collection("seasons").doc(season.id)
          .collection("matches").doc("current"));
      const active = freshVenue.data()?.league?.activeSeason;
      const prior = delivery.data();
      if (active?.id !== season.id ||
          !registrationOpen(active, Date.now(), current.data()) ||
          active.invitations?.[clubId]?.status !== "pending" ||
          freshMembership.data()?.venueId !== venueId ||
          freshMembership.data()?.status !== "active" ||
          prior?.status === "completed" ||
          (prior?.status === "processing" &&
           prior.leaseUntilMs > Date.now())) return false;
      tx.set(deliveryRef, {
        type: "field_season_invitation", venueId, clubId, seasonId: season.id,
        status: "processing", claimId, leaseUntilMs: Date.now() + 120000,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      return true;
    });
    if (!claimed) return;
    try {
      const result = await sendBatch({
        tokenRecords,
        title: `${venue.name || "Your Field"} · season signup`,
        body: `${season.name}. Starts ${season.startsOn}. ` +
          `Sign up by ${season.signupClosesOn || "the start of play"}. ` +
          `Entry: R${Number(season.entryFee || 0).toFixed(2)} per Club.`,
        data: {
          type: "field_season_invitation", route: "admin-entry",
          clubId, venueId, seasonId: season.id,
          signupClosesOn: String(season.signupClosesOn || ""),
        },
      });
      await deliveryRef.set({
        status: result.successCount > 0 ? "completed" : "failed",
        successCount: result.successCount,
        failureCount: result.failureCount,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      if (!result.successCount) throw new Error("No invitation notification was delivered.");
    } catch (error) {
      await deliveryRef.set({
        status: "failed", error: String(error.message || error).slice(0, 500),
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      throw error;
    }
  }

  return {
    onFieldMembershipSeasonInvitation: onDocumentWritten({
      document: "clubFieldMemberships/{clubId}", region, retry: true,
    }, async event => {
      const member = event.data?.after?.data();
      if (member?.status === "active" && member.venueId) {
        await inviteCurrentSeason(member.venueId, event.params.clubId);
      }
    }),

    onFieldSeasonAnnouncementInvitations: onDocumentUpdated({
      document: "leagueVenues/{venueId}", region, retry: true,
    }, async event => {
      const before = event.data?.before?.data()?.league?.activeSeason;
      const after = event.data?.after?.data()?.league?.activeSeason;
      if (!registrationOpen(after) ||
          (before?.id === after.id &&
           before?.announcedAtMs === after.announcedAtMs)) return;
      const members = await db.collection("clubFieldMemberships")
        .where("venueId", "==", event.params.venueId).get();
      for (const member of members.docs) {
        if (member.data().status === "active") {
          await inviteCurrentSeason(event.params.venueId, member.id);
        }
      }
    }),

    onFieldSeasonPlayClosesRegistration: onDocumentWritten({
      document: "leagueVenues/{venueId}/seasons/{seasonId}/matches/current",
      region, retry: true,
    }, async event => {
      const match = event.data?.after?.data();
      if (!match?.confirmedLineupSnapshot) return;
      const venueRef = db.collection("leagueVenues").doc(event.params.venueId);
      await db.runTransaction(async tx => {
        const snap = await tx.get(venueRef);
        const season = snap.data()?.league?.activeSeason;
        if (season?.id !== event.params.seasonId || season.firstPlayAtMs) return;
        tx.update(venueRef, {
          "league.activeSeason.registrationOpen": false,
          "league.activeSeason.firstPlayAtMs": Date.now(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
    }),
  };
}

module.exports = {buildHandlers, registrationOpen};
