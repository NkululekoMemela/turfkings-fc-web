const {loadSeasonStartSquad} = require("./fieldSeasonStartSquad.js");

async function loadFieldMatchRoster({
  transaction, db, venueId, season, fixture, requireMinimum = true,
}) {
  const minimum = {
    "5_V_5": 5, "6_V_6": 6, "7_V_7": 7, "11_V_11": 11,
  }[season.gameFormat];
  if (!minimum) throw new Error("Unsupported game format.");
  const squads = {};
  const bookingVersions = {};
  const squadVersions = {};
  for (const clubId of [fixture.clubAId, fixture.clubBId]) {
    if (!(season.clubIds || []).includes(clubId)) {
      throw new Error("Both Clubs must be registered for this season.");
    }
    const scope = {venueId, seasonId: season.id, clubId};
    const seasonSquad = await loadSeasonStartSquad({transaction, db, scope});
    let eligible = [];
    if (seasonSquad) {
      eligible = seasonSquad.eligible.map(player => ({
        ...player, playerId: `${clubId}::${player.sourcePlayerId}`,
      }));
      squadVersions[clubId] = seasonSquad.updatedAt;
    } else {
      const bookingScope = {...scope, matchDayId: fixture.matchDayId};
      const id = [venueId, season.id, fixture.matchDayId, clubId].join("~");
      const snapshot = await transaction.get(db.doc(`leagueClubBookings/${id}`));
      const booking = snapshot.data();
      if (!booking ||
          Object.keys(bookingScope).some(key => booking[key] !== bookingScope[key]) ||
          !booking.updatedAt) {
        if (requireMinimum) {
          throw new Error("Create and confirm each Club's season squad first.");
        }
        squads[clubId] = [];
        continue;
      }
      const entries = Object.values(booking.entries || {});
      if (entries.length > 30) throw new Error("Invalid squad capacity.");
      const seen = new Set();
      for (const entry of entries) {
        if (entry?.paymentStatus !== "paid" ||
            typeof entry.sourcePlayerId !== "string" ||
            !entry.sourcePlayerId || entry.sourcePlayerId.includes("/") ||
            !entry.playerId || !entry.fullName ||
            seen.has(entry.sourcePlayerId)) continue;
        seen.add(entry.sourcePlayerId);
        const profile = await transaction.get(
          db.doc(`clubs/${clubId}/players/${entry.sourcePlayerId}`)
        );
        if (profile.exists &&
            String(profile.data().status || "active").toLowerCase() === "active") {
          eligible.push({
            playerId: entry.playerId, sourcePlayerId: entry.sourcePlayerId,
            fullName: entry.fullName, clubId,
          });
        }
      }
      bookingVersions[clubId] = booking.updatedAt;
    }
    if (requireMinimum && eligible.length < minimum) {
      throw new Error(
        `${clubId} needs ${minimum} active paid players; ${eligible.length} are eligible.`
      );
    }
    squads[clubId] = eligible;
  }
  return {squads, bookingVersions, squadVersions};
}
exports.loadFieldMatchRoster = loadFieldMatchRoster;
