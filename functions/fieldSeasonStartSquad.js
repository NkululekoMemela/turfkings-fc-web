async function loadSeasonStartSquad({transaction, db, scope}) {
  const {venueId, seasonId, clubId} = scope;
  const {seasonPaidManifest} = await import("./fieldSeasonManifest.mjs");
  const squadRef = db.doc(
    `leagueSeasonSquads/${venueId}~${seasonId}~${clubId}`
  );
  const snapshot = await transaction.get(squadRef);
  if (!snapshot.exists) return null;
  const squad = snapshot.data();
  const manifest = seasonPaidManifest({scope, squad});
  if (!squad.updatedAt) throw new Error("The season squad needs a valid revision.");

  const clubRef = db.doc(`clubs/${clubId}`);
  const clubSnap = await transaction.get(clubRef);
  const membershipSnap = await transaction.get(
    db.doc(`clubFieldMemberships/${clubId}`)
  );
  const club = clubSnap.data();
  const membership = membershipSnap.data();
  if (!club || club.deleted === true || club.status === "deleted" ||
      membership?.status !== "active" || membership.venueId !== venueId) {
    throw new Error("This Club is no longer an active member of the Field.");
  }

  const eligible = [];
  for (const player of manifest) {
    const memberSnap = await transaction.get(
      clubRef.collection("members").doc(player.memberId)
    );
    const profileSnap = await transaction.get(
      clubRef.collection("players").doc(player.sourcePlayerId)
    );
    const receiptSnap = await transaction.get(
      squadRef.collection("paymentConfirmations").doc(player.memberId)
    );
    const member = memberSnap.data();
    const profile = profileSnap.data();
    if (member?.status !== "active" ||
        member.playerId !== player.sourcePlayerId ||
        !profile || String(profile.status || "active").toLowerCase() !== "active") {
      continue;
    }
    const receipt = receiptSnap.data();
    const entry = squad.entries[player.memberId];
    if (!entry || !receipt ||
        ["venueId", "seasonId", "clubId"].some(key => receipt[key] !== scope[key]) ||
        receipt.memberId !== player.memberId ||
        receipt.sourcePlayerId !== player.sourcePlayerId ||
        receipt.currency !== "ZAR" ||
        receipt.amountCents !== player.contributionCents ||
        receipt.confirmedByUid !== entry.paymentConfirmedByUid) {
      throw new Error("A season payment receipt does not match its player.");
    }
    const fullName = String(
      profile.fullName || profile.displayName ||
      profile.name || profile.playerName || ""
    ).trim();
    if (!fullName) throw new Error("A season player needs a registered name.");
    eligible.push({
      memberId: player.memberId,
      sourcePlayerId: player.sourcePlayerId,
      fullName, clubId,
    });
  }
  return {squadId: squadRef.id, updatedAt: squad.updatedAt, eligible};
}
exports.loadSeasonStartSquad = loadSeasonStartSquad;
