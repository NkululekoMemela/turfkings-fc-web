export function leagueBookingScope({
  venueId, seasonId, matchDayId, clubId,
}) {
  const values = [venueId, seasonId, matchDayId, clubId];
  if (values.some(value =>
    typeof value !== "string" || !/^[A-Za-z0-9_-]{1,150}$/.test(value))) {
    throw new Error("A complete league booking reference is required.");
  }
  return values.join("~");
}

export function leaguePlayerLimit(value, minimum = 5, maximum = 30) {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < minimum || limit > maximum) {
    throw new Error(`Choose a player limit between ${minimum} and ${maximum}.`);
  }
  return limit;
}

export function reserveLeaguePlayer({ entries = {}, player, limit }) {
  const capacity = leaguePlayerLimit(limit);
  if (!player?.playerId || !player?.sourcePlayerId || !player?.fullName) {
    throw new Error("Choose a registered Club player.");
  }
  if (entries[player.playerId]) return entries;
  if (Object.keys(entries).length >= capacity) {
    throw new Error("This league match day is full.");
  }
  return {
    ...entries,
    [player.playerId]: {
      playerId: player.playerId,
      sourcePlayerId: player.sourcePlayerId,
      fullName: player.fullName,
      paymentStatus: "pending",
    },
  };
}

export function paidLeagueManifest({ booking, scope }) {
  if (!booking || !scope ||
      ["venueId", "seasonId", "matchDayId", "clubId"].some(key =>
        !scope[key] || booking[key] !== scope[key])) {
    return [];
  }
  const seen = new Set();
  return Object.values(booking.entries || {}).filter(entry => {
    if (entry?.paymentStatus !== "paid" ||
        !entry.sourcePlayerId || !entry.playerId || !entry.fullName ||
        seen.has(entry.sourcePlayerId)) return false;
    seen.add(entry.sourcePlayerId);
    return true;
  }).map(entry => ({
    playerId: entry.playerId,
    sourcePlayerId: entry.sourcePlayerId,
    fullName: entry.fullName,
    clubId: scope.clubId,
  }));
}
