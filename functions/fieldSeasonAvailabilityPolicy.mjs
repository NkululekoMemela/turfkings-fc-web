export function assertClubMatchDayEditable({
  season, clubId, matchDayId, liveMatch = null,
}) {
  if (season?.status !== "active" || season.scheduleVersion !== 1 ||
      !season.clubIds?.includes(clubId)) {
    throw new Error("An active dated league and registered Club are required.");
  }
  const day = season.matchDays?.find(item => item.id === matchDayId);
  if (!day || day.status !== "scheduled" ||
      (season.matchDayHistory || []).some(item =>
        (item.scheduledMatchDayId || item.id) === matchDayId)) {
    throw new Error("This match day is no longer available for changes.");
  }
  const fixtures = (season.fixtures || []).filter(item =>
    item.matchDayId === matchDayId &&
    [item.clubAId, item.clubBId].includes(clubId));
  if (fixtures.length !== 1 || fixtures[0].status !== "scheduled" ||
      !day.fixtureIds?.includes(fixtures[0].id)) {
    throw new Error("Choose a match day with one scheduled game for your Club.");
  }
  const fixture = fixtures[0];
  if (season.liveMatches?.[fixture.id] ||
      (liveMatch?.fixtureId === fixture.id &&
       ["live", "completed"].includes(liveMatch.status))) {
    throw new Error("Availability cannot change after this game has started.");
  }
  return {day, fixture};
}

export function nextPlayerAvailability({entry, available, actorMemberId}) {
  if (!entry || entry.memberId !== actorMemberId ||
      entry.invitationStatus !== "accepted") {
    throw new Error("Only the accepted squad member can change their availability.");
  }
  if (typeof available !== "boolean") {
    throw new Error("Choose available or unavailable.");
  }
  return available ? "available" : "unavailable";
}

export function createMatchDayReplacement({
  original, originalAvailability, replacement, actorUid,
}) {
  if (!actorUid || !original ||
      original.invitationStatus !== "accepted" ||
      original.paymentStatus !== "paid") {
    throw new Error("A captain-approved paid season place is required.");
  }
  if (originalAvailability !== "unavailable") {
    throw new Error("Mark the original player unavailable before inviting cover.");
  }
  if (!replacement?.memberId || !replacement.sourcePlayerId ||
      !replacement.fullName ||
      replacement.memberId === original.memberId ||
      replacement.sourcePlayerId === original.sourcePlayerId) {
    throw new Error("Choose a different registered Club player.");
  }
  return {
    originalMemberId: original.memberId,
    memberId: replacement.memberId,
    sourcePlayerId: replacement.sourcePlayerId,
    fullName: replacement.fullName,
    invitationStatus: "pending",
    invitedByUid: actorUid,
  };
}
