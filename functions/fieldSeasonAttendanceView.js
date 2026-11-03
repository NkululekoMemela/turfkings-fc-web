exports.attendanceView = function attendanceView(squad, entries) {
  return entries.map(entry => ({
    memberId: entry.memberId,
    sourcePlayerId: entry.sourcePlayerId,
    fullName: String(entry.fullName || ""),
    availability: Object.fromEntries(
      Object.entries(squad.matchDayAvailability || {}).map(([dayId, rows]) => [
        dayId, rows[entry.memberId]?.status === "unavailable"
          ? "unavailable" : "available",
      ])
    ),
    coverDays: Object.entries(squad.matchDayReplacements || {})
      .filter(([, rows]) => ["pending", "accepted"].includes(
        rows[entry.memberId]?.invitationStatus
      )).map(([dayId]) => dayId),
  }));
};
