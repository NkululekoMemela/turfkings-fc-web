export function assertTestSeasonDeletion({
  venue, actorUid, seasonId, confirmation, confirmedTest,
  liveMatch = null, bookings = [],
}) {
  if (!actorUid || venue?.ownerUid !== actorUid) {
    throw new Error("Only the Field creator can delete a test season.");
  }
  const season = venue.league?.activeSeason;
  if (!seasonId || season?.id !== seasonId) {
    throw new Error("The active season has changed. Reload before continuing.");
  }
  const expected = String(season.name || season.id);
  if (confirmedTest !== true || confirmation !== expected) {
    throw new Error("Confirm this is a test season and type its exact name.");
  }
  if (liveMatch?.status === "live" ||
      Object.values(season.liveMatches || {}).some(
        match => match?.status === "live"
      )) {
    throw new Error("Cancel or finish the live game before deleting this test season.");
  }
  for (const booking of bookings) {
    if (booking.venueId !== venue.id || booking.seasonId !== seasonId) {
      throw new Error("A booking belongs to a different Field or season.");
    }
    if (Object.values(booking.entries || {}).some(
      entry => entry?.paymentStatus === "paid"
    )) {
      throw new Error(
        "This season has confirmed payments. Resolve those payment records before deletion."
      );
    }
  }
  return season;
}
