const {FieldPath, FieldValue} = require("firebase-admin/firestore");
const service = require("./fieldSeasonSquadService");
const squads = require("./fieldMatchDaySquad");
const normalize = value => String(value || "").trim()
  .replace(/\s+/g, " ").toLowerCase();

async function save({db, user, body, now = Date.now()}) {
  if (!user?.uid) throw new Error("Sign in first.");
  const {
    venueId, seasonId, clubId, matchDayId, lineup, expectedFingerprint,
  } = body || {};
  const scope = {venueId, seasonId, clubId};
  service.squadId(scope);
  if (!/^[A-Za-z0-9_-]{1,150}$/.test(matchDayId || "") ||
      !lineup || typeof lineup.formationId !== "string" ||
      !lineup.positions || typeof lineup.positions !== "object" ||
      Array.isArray(lineup.positions)) {
    throw new Error("Choose a valid match day and formation.");
  }

  return db.runTransaction(async tx => {
    const venueRef = db.doc(`leagueVenues/${venueId}`);
    const [venueSnap, staffSnap, clubSnap] = await tx.getAll(
      venueRef,
      db.doc(`leagueVenues/${venueId}/staff/${user.uid}`),
      db.doc(`clubs/${clubId}`)
    );
    const venue = venueSnap.data();
    const staff = staffSnap.data();
    const captain = service.canManageSquad(clubSnap.data(), user);
    const administrator = venue?.ownerUid === user.uid || (
      staff?.status === "active" && staff.isAdministrator === true &&
      ["field_manager", "assistant_manager", "field_assistant",
        "other_staff"].includes(staff.role)
    );
    if (!captain && !administrator) {
      throw new Error("Only this Club's captain/admin or a Field administrator can save.");
    }

    const day = await squads.loadDay({tx, db, scope, matchDayId});
    const {fieldFormat} = await import("./fieldBoothShared/fieldFormat.mjs");
    const {minimum, maximum, lineupKey, formations} = fieldFormat(day.season.gameFormat);
    const formation = Object.hasOwn(formations, lineup.formationId) && formations[lineup.formationId];
    if (!formation) throw new Error("Choose a formation for this match format.");
    if (!day.submission.ready || day.submission.players.length < minimum ||
        day.submission.players.length > maximum) {
      throw new Error("Resolve this Club's roster or kit warnings before saving its formation.");
    }

    if (expectedFingerprint !== day.submission.fingerprint) {
      throw new Error("The squad changed. Reload Formations before saving.");
    }
    const players = day.submission.players;
    const names = new Map();
    for (const player of players) {
      const key = normalize(player.fullName);
      if (!key || names.has(key)) {
        throw new Error("Squad names must be distinct before saving a formation.");
      }
      names.set(key, player.fullName);
    }

    const slots = formation.positions.map(position => position.id);
    if (Object.keys(lineup.positions).some(key => !slots.includes(key))) {
      throw new Error("This formation contains an invalid position.");
    }
    const used = new Set();
    const positions = {};
    for (const slot of slots) {
      const value = lineup.positions[slot];
      if (value === null || value === undefined || value === "") {
        positions[slot] = null;
        continue;
      }
      const key = normalize(value);
      if (!names.has(key) || used.has(key)) {
        throw new Error("Use each confirmed squad player only once.");
      }
      used.add(key);
      positions[slot] = names.get(key);
    }

    const role = captain ? "captain" : "admin";
    const savedLineup = {
      formationId: lineup.formationId,
      positions,
      benchSnapshot: players.filter(player =>
        !used.has(normalize(player.fullName))).map(player => player.fullName),
      guestPlayers: [],
      matchDayId,
      squadFingerprint: day.submission.fingerprint,
      meta: {
        savedByRole: role,
        savedByUid: user.uid,
        savedByName: captain
          ? String(clubSnap.data()?.name || clubId)
          : String(staff?.name || venue?.name || "Field administrator"),
        savedAt: new Date(now).toISOString(),
      },
    };

    // Patch only this Club's role variant; preserve every other Club.
    tx.update(venueRef,
      new FieldPath("league", "activeSeason", "savedLineups",
        clubId, lineupKey, "variants", role),
      savedLineup,
      "updatedAt", FieldValue.serverTimestamp()
    );
    return {clubId, role, lineup: savedLineup};
  });
}

module.exports = {save};
