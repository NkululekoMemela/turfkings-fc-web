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
    const names = ["p1", "p2", "p3", "p4", "p5"]
      .map(slot => lineup.positions?.[slot]);
    const allowed = new Set(players.map(p => p.fullName));
    if (players.length < 5 || players.length > 6 ||
        names.some(name => !name || !allowed.has(name)) ||
        new Set(names).size !== 5) {
      throw new Error("Use five distinct players from this Practice squad.");
    }
    const saved = {
      ...lineup, matchDayId, squadFingerprint: expectedFingerprint,
      meta: {...lineup.meta, savedByRole: "admin"},
    };
    tx.update(rootRef,
      new FieldPath("league", "activeSeason", "savedLineups", clubId, "5"),
      {variants: {admin: saved}},
      "updatedAt", serverTimestamp()
    );
    return {lineup: saved, role: "admin"};
  });
}
