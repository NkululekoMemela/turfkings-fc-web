export function reconcileFieldSeasonFixtures({
  season, clubs, actorUid, now = Date.now(),
}) {
  const fixtures = Array.isArray(season.fixtures) ? season.fixtures : [];
  const ids = [...clubs.keys()];
  const hasPlay = Boolean(
    season.firstPlayAtMs ||
    (season.results || []).length ||
    (season.matchDayHistory || []).length ||
    fixtures.some(f => f.status !== "scheduled") ||
    Object.keys(season.liveMatches || {}).length
  );
  if (hasPlay) return fixtures;

  const prefix = `fixture-${season.id}-`;
  const automatic = fixtures.every(f => {
    if (f.source === "automatic_round_robin") return true;
    if (f.scheduledLocal || !String(f.id || "").startsWith(prefix)) return false;
    return /^\d+-\d+$/.test(String(f.id).slice(prefix.length));
  });

  if (!automatic) {
    const represented = new Set(fixtures.flatMap(f => [f.clubAId, f.clubBId]));
    if (ids.some(id => !represented.has(id))) {
      throw new Error(
        "A registered Club is missing from the manually arranged schedule. " +
        "Add its fixtures before starting the match."
      );
    }
    return fixtures;
  }

  const pairKey = (a, b) => JSON.stringify([a, b].sort());
  const pairs = new Set(fixtures.map(f => pairKey(f.clubAId, f.clubBId)));
  const usedIds = new Set(fixtures.map(f => f.id));
  const additions = [];

  ids.forEach((clubAId, index) => {
    ids.slice(index + 1).forEach(clubBId => {
      const pair = pairKey(clubAId, clubBId);
      if (pairs.has(pair)) return;
      let id = `${prefix}${index}-${ids.indexOf(clubBId)}`;
      while (usedIds.has(id)) id += "-new";
      usedIds.add(id);
      pairs.add(pair);
      additions.push({
        id, clubAId, clubBId,
        clubAName: clubs.get(clubAId),
        clubBName: clubs.get(clubBId),
        status: "scheduled",
        source: "automatic_round_robin",
        createdByUid: actorUid,
        createdAtMs: now,
      });
    });
  });

  return additions.length ? [...fixtures, ...additions] : fixtures;
}
