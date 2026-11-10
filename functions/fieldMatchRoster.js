async function loadFieldMatchRoster({
  transaction, db, venueId, season, fixture, requireMinimum = true,
}) {
  const {assertLeagueBibs} = await import("./leagueBibPolicy.mjs");
  const minimum = {
    "5_V_5": 5, "6_V_6": 6, "7_V_7": 7, "11_V_11": 11,
  }[season.gameFormat];
  if (!minimum) throw new Error("Unsupported game format.");
  transaction=require("./fieldReadCache.cjs").cacheFieldReads(transaction);
  const squads = {};
  const bookingVersions = {};
  const squadVersions = {};
  const squadFingerprints = {};
  await Promise.all([fixture.clubAId, fixture.clubBId].map(async clubId=>{
    if (!(season.clubIds || []).includes(clubId)) {
      throw new Error("Both Clubs must be registered for this season.");
    }
    const scope = {venueId, seasonId: season.id, clubId};
    const {loadDay} = require("./fieldMatchDaySquad");
    const data = await loadDay({
      tx: transaction, db, scope, matchDayId: fixture.matchDayId,
    });
    if (requireMinimum && !data.submission.ready) {
      if (data.submission.players.length >= minimum) {
        throw new Error("Confirm enough Field bibs in two colours before starting.");
      }
      throw new Error(`${data.club?.name || "This club"} needs at least ${minimum} available players.`);
    }
    squadFingerprints[clubId] = data.submission.fingerprint;
    const seasonSquad = {
      eligible: data.submission.players,
      updatedAt: data.squad?.updatedAt,
    };
    const eligible = seasonSquad.eligible.map(player => ({
      ...player, playerId: `${clubId}::${player.sourcePlayerId}`,
    }));
    squadVersions[clubId] = seasonSquad.updatedAt;
    if (requireMinimum && eligible.length < minimum) {
      throw new Error(
        `${clubId} needs ${minimum} active paid players; ${eligible.length} are eligible.`
      );
    }
    if(requireMinimum)assertLeagueBibs(eligible);
    squads[clubId] = eligible;
  }));
  if(requireMinimum){const {assertOpponentColours}=await import("./opponentKitColours.mjs");assertOpponentColours(squads);}
  return {squads, bookingVersions, squadVersions, squadFingerprints};
}
exports.loadFieldMatchRoster = loadFieldMatchRoster;
