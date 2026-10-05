export function validLeagueDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
}

export function buildFieldLeagueSchedule({
  seasonId, clubs, startsOn, startTime = "18:00",
  matchMinutes = 40, halftimeMinutes = 5, turnaroundMinutes = 5,
  intervalDays = 7,
}) {
  if (!seasonId || !validLeagueDate(startsOn)) {
    throw new Error("Choose a valid season and first match date.");
  }
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
    throw new Error("Choose a valid start time.");
  }
  for (const [value, minimum, maximum] of [
    [matchMinutes, 2, 180], [halftimeMinutes, 0, 30],
    [turnaroundMinutes, 0, 30], [intervalDays, 1, 365],
  ]) {
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      throw new Error("Choose valid scheduling intervals and durations.");
    }
  }
  const entries = clubs instanceof Map ? [...clubs.entries()] : [];
  if (entries.length < 2 ||
      entries.some(([id]) => typeof id !== "string" || !id.trim()) ||
      new Set(entries.map(([id]) => id)).size !== entries.length) {
    throw new Error("Choose at least two different Clubs.");
  }
  const names = new Map(entries);
  const rotation = entries.map(([id]) => id);
  if (rotation.length % 2) rotation.push(null);
  const [hour, minute] = startTime.split(":").map(Number);
  const firstMinute = hour * 60 + minute;
  const slotMinutes = matchMinutes + halftimeMinutes + turnaroundMinutes;
  const matchDays = [];
  const fixtures = [];

  for (let round = 0; round < rotation.length - 1; round++) {
    const date = new Date(`${startsOn}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + round * intervalDays);
    const dateLocal = date.toISOString().slice(0, 10);
    const dayId = `${seasonId}-day-${round + 1}`;
    const fixtureIds = [];
    const byeClubIds = [];
    let slot = 0;

    for (let index = 0; index < rotation.length / 2; index++) {
      const clubAId = rotation[index];
      const clubBId = rotation[rotation.length - 1 - index];
      if (!clubAId || !clubBId) {
        byeClubIds.push(clubAId || clubBId);
        continue;
      }
      const kickoff = firstMinute + slot * slotMinutes;
      if (kickoff + matchMinutes + halftimeMinutes >= 1440) {
        throw new Error("These matches do not fit before midnight. Start earlier.");
      }
      const time = `${String(Math.floor(kickoff / 60)).padStart(2, "0")}:` +
        String(kickoff % 60).padStart(2, "0");
      const id = `${dayId}-match-${slot + 1}`;
      fixtures.push({
        id, matchDayId: dayId, roundNo: round + 1,
        clubAId, clubBId,
        clubAName: names.get(clubAId), clubBName: names.get(clubBId),
        scheduledLocal: `${dateLocal}T${time}`,
        timezone: "Africa/Johannesburg",
        matchSeconds: matchMinutes * 60,
        halftimeSeconds: halftimeMinutes * 60,
        status: "scheduled", source: "dated_round_robin",
      });
      fixtureIds.push(id);
      slot++;
    }
    matchDays.push({
      id: dayId, roundNo: round + 1, dateLocal,
      opensAtMs: Date.parse(`${dateLocal}T00:00:00+02:00`),
      timezone: "Africa/Johannesburg",
      fixtureIds, byeClubIds, status: "scheduled",
    });
    rotation.splice(1, 0, rotation.pop());
  }
  return { matchDays, fixtures };
}
