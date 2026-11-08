// Older live fixtures used the season's singleton document. Keep that route
// until they finish; all new fixtures use their own document.
function fieldMatchDocumentId(season, fixtureId) {
  return fixtureId && season?.liveMatches?.[fixtureId]?.liveDocumentId === fixtureId
    ? fixtureId : "current";
}
function activeFieldMatches(season) {
  return Object.values(season?.liveMatches || {}).filter(m => m?.status === "live");
}
function clubsAlreadyPlaying(season, fixture) {
  const clubs = new Set([fixture.clubAId, fixture.clubBId]);
  return activeFieldMatches(season).some(m => clubs.has(m.clubAId) || clubs.has(m.clubBId));
}
module.exports = {fieldMatchDocumentId, activeFieldMatches, clubsAlreadyPlaying};
