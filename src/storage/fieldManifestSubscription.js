import {collection, onSnapshot} from "firebase/firestore";
import {db} from "../firebaseConfig.js";
import {venueLeagueRootPath} from "../core/venueLeaguePaths.js";

// Public teamsheet data only; never stores permissions or payment records.
const recent = new Map();

export function subscribeFieldManifest({
  venueId, season, matchDayId, scope = null, onData, onError,
}) {
  const root = scope
    ? venueLeagueRootPath(scope)
    : `leagueVenues/${venueId}`;
  if (scope && scope.venueId !== venueId) {
    throw new Error("Field manifest scope mismatch.");
  }
  const day = (season.matchDays || []).find(item => item.id === matchDayId);
  const fixtures = (season.fixtures || []).filter(
    item => item.matchDayId === matchDayId
  );
  const key = JSON.stringify([
    root, season.id, matchDayId, day?.dateLocal,
    fixtures.map(f => [f.id, f.clubAId, f.clubBId, f.scheduledLocal]),
    season.clubIds,
  ]);
  const cached = recent.get(key);
  if (cached && Date.now() - cached.at < 120000) onData(cached.value);

  return onSnapshot(collection(
    db, `${root}/seasons/${season.id}/fieldMatchDayManifests/${matchDayId}/clubs`
  ), snapshot => {
    const manifests = new Map(snapshot.docs.map(doc => [doc.id, doc.data()]));
    const clubIds = [...new Set([
      ...(season.clubIds || []),
      ...fixtures.flatMap(f => [f.clubAId, f.clubBId]).filter(Boolean),
    ])];
    const clubs = clubIds.map(clubId => {
      const manifest = manifests.get(clubId);
      const fixture = fixtures.find(
        f => f.clubAId === clubId || f.clubBId === clubId
      );
      const players = manifest?.players || [];
      const valid = Boolean(
        fixture && manifest?.version === 1 &&
        manifest.venueId === venueId && manifest.seasonId === season.id &&
        manifest.clubId === clubId && manifest.matchDayId === matchDayId &&
        manifest.fixtureId === fixture.id &&
        manifest.dateLocal === day?.dateLocal &&
        manifest.scheduledLocal === (fixture.scheduledLocal || "") &&
        manifest.confirmed === true &&
        players.length >= 5 && players.length <= 6 &&
        players.every(p => p.memberId && p.sourcePlayerId && p.fullName) &&
        new Set(players.map(p => p.memberId)).size === players.length
      );
      return {
        clubId, name: manifest?.name || clubId,
        logoUrl: manifest?.logoUrl || "",
        matchDayId, dateLocal: day?.dateLocal || "",
        fixtureId: fixture?.id || "",
        confirmed: valid,
        status: !fixture ? "bye" : valid ? "confirmed" : "awaiting_confirmation",
        players: valid ? players : [],
        selectedMemberIds: valid ? manifest.selectedMemberIds : [],
        fingerprint: valid ? manifest.fingerprint : "",
        submittedAtMs: valid ? manifest.submittedAtMs : null,
      };
    });
    const value = {matchDayId, dateLocal: day?.dateLocal || "", clubs};
    recent.set(key, {at: Date.now(), value});
    if (recent.size > 20) recent.delete(recent.keys().next().value);
    onData(value);
  }, onError);
}
