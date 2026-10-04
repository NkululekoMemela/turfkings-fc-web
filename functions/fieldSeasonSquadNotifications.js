const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const {FieldValue} = require("firebase-admin/firestore");
const {getAuth} = require("firebase-admin/auth");
const {randomUUID} = require("node:crypto");

const validId = value => typeof value === "string" &&
  /^[A-Za-z0-9_-]{1,150}$/.test(value);
const normalizedEmail = value => String(value || "").trim().toLowerCase();

function buildHandlers({
  db, region, sendBatch, authService = getAuth(), testOnly = false,
}) {
  async function loadInvitation(tx, squadRef, memberId) {
    const snapshot = await tx.get(squadRef);
    const squad = snapshot.data();
    const entry = squad?.entries?.[memberId];
    if (!squad || squad.version !== 1 || squad.status !== "active" ||
        !entry || entry.invitationStatus !== "pending" ||
        entry.memberId !== memberId ||
        ![squad.clubId, squad.venueId, squad.seasonId,
          entry.sourcePlayerId, memberId].every(validId)) return null;

    const clubRef = db.doc(`clubs/${squad.clubId}`);
    const memberRef = clubRef.collection("members").doc(memberId);
    const memberSnap = await tx.get(memberRef);
    const playerSnap = await tx.get(
      clubRef.collection("players").doc(entry.sourcePlayerId)
    );
    const clubSnap = await tx.get(clubRef);
    const venueSnap = await tx.get(db.doc(`leagueVenues/${squad.venueId}`));
    const membershipSnap = await tx.get(
      db.doc(`clubFieldMemberships/${squad.clubId}`)
    );
    const member = memberSnap.data();
    const player = playerSnap.data();
    const club = clubSnap.data();
    const venue = venueSnap.data();
    const membership = membershipSnap.data();
    const season = venue?.league?.activeSeason;
    if (member?.status !== "active" ||
        member.playerId !== entry.sourcePlayerId ||
        !player || String(player.status || "active").toLowerCase() !== "active" ||
        !club || club.status === "deleted" ||
        membership?.status !== "active" ||
        membership.venueId !== squad.venueId ||
        season?.id !== squad.seasonId || season.status !== "active" ||
        !season.clubIds?.includes(squad.clubId)) return null;

    return {squad, entry, member, club, venue, season};
  }

  async function recipient(member) {
    try {
      if (member.uid) return (await authService.getUser(member.uid)).uid;
      const address = normalizedEmail(member.email);
      if (!address) return null;
      const user = await authService.getUserByEmail(address);
      return user.emailVerified && normalizedEmail(user.email) === address
        ? user.uid : null;
    } catch (error) {
      if (error.code === "auth/user-not-found") return null;
      throw error;
    }
  }

  async function notifyPlayer(squadId, memberId) {
    const squadRef = db.collection("leagueSeasonSquads").doc(squadId);
    const deliveryRef = squadRef.collection("invitationDeliveries").doc(memberId);
    const claimId = randomUUID();
    const claimed = await db.runTransaction(async tx => {
      const invitation = await loadInvitation(tx, squadRef, memberId);
      const deliverySnap = await tx.get(deliveryRef);
      const delivery = deliverySnap.data();
      if (!invitation || delivery?.status === "sent") return null;
      if ((delivery?.leaseUntilMs || 0) > Date.now()) {
        throw new Error("Invitation delivery is already in progress.");
      }
      tx.set(deliveryRef, {
        status: "sending", claimId, leaseUntilMs: Date.now() + 300000,
        attemptedAt: FieldValue.serverTimestamp(),
      });
      return invitation;
    });
    if (!claimed) return {status: "skipped"};

    async function finish(status, details = {}) {
      await db.runTransaction(async tx => {
        const snapshot = await tx.get(deliveryRef);
        if (snapshot.data()?.claimId !== claimId) return;
        tx.set(deliveryRef, {
          status, claimId, leaseUntilMs: 0,
          completedAt: FieldValue.serverTimestamp(), ...details,
        });
      });
      return {status};
    }

    try {
      const uid = await recipient(claimed.member);
      if (!uid) return await finish("no_account");
      const devices = await db.collectionGroup("notificationDevices")
        .where("firebaseUid", "==", uid).get();
      const seen = new Set();
      const tokenRecords = [];
      for (const device of devices.docs) {
        const data = device.data();
        if (data.enabled !== true || data.firebaseUid !== uid ||
            typeof data.token !== "string" || !data.token ||
            seen.has(data.token)) continue;
        seen.add(data.token);
        tokenRecords.push({token: data.token, ref: device.ref});
      }
      if (!tokenRecords.length) return await finish("no_devices");

      const current = await db.runTransaction(async tx => {
        const invitation = await loadInvitation(tx, squadRef, memberId);
        const delivery = await tx.get(deliveryRef);
        return delivery.data()?.claimId === claimId ? invitation : null;
      });
      if (!current ||
          (await recipient(current.member)) !== uid ||
          current.entry.contributionCents !== claimed.entry.contributionCents) {
        return await finish("skipped");
      }

      const logo = String(current.club.transparentLogoUrl ||
        current.club.logoUrl || "");
      const result = await sendBatch({
        tokenRecords,
        title: "You’re invited to the league squad",
        body: `${current.club.name || "Your Club"}: ` +
          `your captain has selected you for ${current.season.name || "the league"}. ` +
          "Open to review your whole-season contribution.",
        imageUrl: logo,
        data: {
          type: "field_season_squad_invitation", route: "club-league",
          clubId: String(current.squad.clubId),
          venueId: String(current.squad.venueId),
          seasonId: String(current.squad.seasonId),
          memberId: String(memberId),
        },
      });
      if (!result.successCount) {
        throw new Error("No squad invitation notifications were delivered.");
      }
      return await finish("sent", {
        deviceCount: tokenRecords.length,
        successCount: result.successCount,
        failureCount: result.failureCount || 0,
      });
    } catch (error) {
      await finish("failed", {
        error: String(error.message || error).slice(0, 300),
      });
      throw error;
    }
  }

  async function notifySquad(squadId) {
    const snapshot = await db.collection("leagueSeasonSquads").doc(squadId).get();
    const entries = Object.values(snapshot.data()?.entries || {});
    if (entries.length > 30) throw new Error("Invalid season squad size.");
    for (const entry of entries) {
      if (validId(entry.memberId)) await notifyPlayer(squadId, entry.memberId);
    }
  }

  if (testOnly) return {notifyPlayer, notifySquad};
  return {
    fieldSeasonSquadCreated: onDocumentCreated({
      document: "leagueSeasonSquads/{squadId}",
      region, retry: true, timeoutSeconds: 540,
    }, event => notifySquad(event.params.squadId)),
  };
}
exports.buildHandlers = buildHandlers;
