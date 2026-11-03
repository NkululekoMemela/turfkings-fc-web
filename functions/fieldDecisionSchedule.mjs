import {normalizeFieldDecision} from "./fieldDecisionPolicy.mjs";
import {rescheduleRemainingKickoffs} from "./fieldRemainingKickoffs.mjs";

export function applyFieldScheduleDecision({
  season, decision, actorUid, liveMatch = null, now = Date.now(),
}) {
  const approved = normalizeFieldDecision(decision);
  if (!actorUid || season?.scheduleVersion !== 1 || season.status !== "active") {
    throw new Error("An active dated season and manager approval are required.");
  }
  const {matchDayId, dateLocal, startTime} = approved.parameters;
  if (approved.action === "delay_remaining") {
    return rescheduleRemainingKickoffs({
      season, matchDayId, startTime, actorUid, liveMatch, now,
    });
  }
  if (approved.action !== "reschedule_day") {
    throw new Error("This is not a schedule decision.");
  }
  const days = season.matchDays || [];
  const index = days.findIndex(day => day.id === matchDayId);
  const day = days[index];
  if (!day || day.status !== "scheduled" ||
      (season.matchDayHistory || []).some(item =>
        (item.scheduledMatchDayId || item.id) === matchDayId)) {
    throw new Error("This match day is no longer available.");
  }
  const fixtures = season.fixtures || [];
  const selected = fixtures.filter(item => item.matchDayId === matchDayId)
    .sort((a, b) => String(a.scheduledLocal).localeCompare(String(b.scheduledLocal)));
  const ids = new Set(selected.map(item => item.id));
  if (!selected.length || ids.size !== selected.length ||
      ids.size !== (day.fixtureIds || []).length ||
      (day.fixtureIds || []).some(id => !ids.has(id))) {
    throw new Error("Correct this match day's fixture references first.");
  }
  if (selected.some(item =>
      item.status !== "scheduled" || season.liveMatches?.[item.id]) ||
      (liveMatch?.status === "live" && ids.has(liveMatch.fixtureId))) {
    throw new Error("This day has started. Move remaining kickoff times instead.");
  }
  if ((index > 0 && dateLocal <= days[index - 1].dateLocal) ||
      (index + 1 < days.length && dateLocal >= days[index + 1].dateLocal)) {
    throw new Error("Keep match-day dates in order. Move neighbouring days first if needed.");
  }
  const settings = season.scheduleSettings || {};
  const play = Number(settings.matchMinutes ?? 40);
  const half = Number(settings.halftimeMinutes ?? 5);
  const gap = Number(settings.turnaroundMinutes ?? 5);
  if (![play, half, gap].every(Number.isInteger) ||
      play < 2 || play > 180 || half < 0 || half > 30 || gap < 0 || gap > 30) {
    throw new Error("Correct the season duration settings first.");
  }
  const [hour, minute] = startTime.split(":").map(Number);
  const first = hour * 60 + minute;
  const replacements = new Map();
  selected.forEach((fixture, slot) => {
    const kickoff = first + slot * (play + half + gap);
    if (kickoff + play + half >= 1440) {
      throw new Error("These games will not fit before midnight.");
    }
    const time = String(Math.floor(kickoff / 60)).padStart(2, "0") + ":" +
      String(kickoff % 60).padStart(2, "0");
    replacements.set(fixture.id, {
      ...fixture, scheduledLocal: `${dateLocal}T${time}`,
      rescheduledByUid: actorUid, rescheduledAtMs: now,
    });
  });
  return {
    fixtures: fixtures.map(item => replacements.get(item.id) || item),
    matchDays: days.map(item => item.id === matchDayId ? {
      ...item, dateLocal, startTime,
      opensAtMs: Date.parse(`${dateLocal}T00:00:00+02:00`),
      rescheduledByUid: actorUid, rescheduledAtMs: now,
    } : item),
  };
}
