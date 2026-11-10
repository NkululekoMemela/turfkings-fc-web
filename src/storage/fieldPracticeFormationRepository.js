import {fieldFormat} from "../../functions/fieldBoothShared/fieldFormat.mjs";
import {
  doc, runTransaction, FieldPath, serverTimestamp,
} from "firebase/firestore";
import {db} from "../firebaseConfig.js";
import {venueLeagueRootPath} from "../core/venueLeaguePaths.js";

export async function saveFieldPracticeFormation({
  scope, seasonId, matchDayId, clubId, expectedFingerprint, lineup,
}) {
  if (scope?.environment !== "practice" || scope.seasonId !== seasonId) {
    throw new Error("An explicit Field Practice scope is required.");
  }
  for (const value of [matchDayId, clubId]) {
    if (typeof value !== "string" || !value || value.includes("/")) {
      throw new Error("Choose a valid Practice squad.");
    }
  }
  const root = venueLeagueRootPath(scope);
  const rootRef = doc(db, root);
  const manifestRef = doc(db,
    `${root}/seasons/${seasonId}/fieldMatchDayManifests/${matchDayId}/clubs/${clubId}`
  );

  return runTransaction(db, async tx => {
    const [rootSnap, manifestSnap] = await Promise.all([
      tx.get(rootRef), tx.get(manifestRef),
    ]);
    const season = rootSnap.data()?.league?.activeSeason;
    const manifest = manifestSnap.data();
    if (season?.id !== seasonId || !manifest?.confirmed ||
        manifest.fingerprint !== expectedFingerprint) {
      throw new Error("The Practice squad changed. Reload Formations.");
    }
    const players = manifest.players || [];
    const {minimum, maximum, lineupKey, formations} = fieldFormat(season.gameFormat);
    const formation = Object.hasOwn(formations, lineup?.formationId) && formations[lineup.formationId];
    if (!formation) throw Error("Choose a formation for this Practice match format.");
    const names = formation.positions.map(({id}) => lineup.positions?.[id]);
    const allowed = new Set(players.map(p => p.fullName));
    if (players.length < minimum || players.length > maximum ||
        names.some(name => !name || !allowed.has(name)) ||
        new Set(names).size !== minimum) {
      throw new Error(`Use ${minimum} distinct players from this Practice squad.`);
    }
    const saved = {
      ...lineup, matchDayId, squadFingerprint: expectedFingerprint,
      meta: {...lineup.meta, savedByRole: "admin"},
    };
    tx.update(rootRef,
      new FieldPath("league", "activeSeason", "savedLineups", clubId, lineupKey),
      {variants: {admin: saved}},
      "updatedAt", serverTimestamp()
    );
    return {lineup: saved, role: "admin"};
  });
}
