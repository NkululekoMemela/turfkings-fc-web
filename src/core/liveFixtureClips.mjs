const text = value => typeof value === "string" ? value.trim() : "";
const id = value => /^[\w.-]+$/.test(text(value)) && ![".", ".."].includes(value);
const values = (...items) => items.map(text).filter(Boolean);
const accepts = (expected, ...items) => values(...items).every(item => item === expected);
const time = value => typeof value?.toMillis === "function" ? value.toMillis()
  : typeof value === "number" ? value : Date.parse(value || "");

export function fieldHighlightMatchId(venueId, seasonId, fixtureId) {
  return [venueId, seasonId, fixtureId].every(id)
    ? `venue__${venueId}__${seasonId}__${fixtureId}` : "";
}

export function clubFixtureHighlightMatchId(match, seasonId) {
  const saved = text(match?.videoHighlightsMatchId);
  if (id(saved) && /^(friendly|league)__/.test(saved)) return saved;
  if (!match) return "";
  const format = text(match.gameFormat || match.matchMode).toLowerCase().replace(/_/g, "");
  const start = time(match.startedAtISO || match.createdAt);
  if (text(match.matchType).toLowerCase() !== "league" && format && Number.isFinite(start) && /^(friendly|5v5|11v11)$/.test(format)) {
    return `friendly__${format === "friendly" ? "5v5" : format}__${new Date(start).toISOString().slice(0, 10)}`;
  }
  const season = match.seasonId || seasonId;
  const matchNo = Number(match.matchNumber);
  const [a, b] = [match.teamAId, match.teamBId].map(value => text(value).replace(/[^\w-]/g, ""));
  return id(season) && a && b && Number.isSafeInteger(matchNo) && matchNo > 0
    ? `league__${season}__match_${matchNo}__${a}_vs_${b}` : "";
}

export function clipBelongsToLiveFixture(clip, { matchId, fixtureId, venueId, seasonId, match, now = Date.now() }) {
  if (!matchId || !clip || ["rejected", "deleted"].includes(text(clip.status).toLowerCase())) return false;
  const ctx = clip.matchContext || {};
  if (!accepts(matchId, clip.matchId, ctx.matchId)) return false;
  if (venueId) {
    return accepts(fixtureId, ...values(clip.fixtureId, ctx.fixtureId).filter(value => value !== matchId))
      && accepts(venueId, clip.venueId, ctx.venueId)
      && accepts(seasonId, clip.seasonId, ctx.seasonId);
  }
  const no = Number(match?.matchNumber || match?.matchNo);
  const numbers = [clip.matchNo, ctx.matchNo, clip.event?.matchNo].filter(value => Number(value) > 0);
  if (no > 0 && numbers.some(value => Number(value) !== no)) return false;
  const teams = [match?.teamAId, match?.teamBId].filter(Boolean);
  if (teams.length && values(clip.teamId, ctx.teamId).some(team => !teams.includes(team))) return false;
  if (matchId.startsWith("league__")) return true;
  if (!matchId.startsWith("friendly__")) return false;
  const events = Array.isArray(match?.events) ? match.events : [];
  const requests = new Set(events.flatMap(event => values(event.captureRequestId, event.cameraCaptureRequestId)));
  if (values(clip.captureRequestId, clip.requestId, clip.event?.captureRequestId, clip.event?.eventId, clip.event?.id, clip.eventId, clip.clipId, clip.id)
    .some(key => requests.has(key))) return true;
  if (!numbers.length || !(no > 0)) return false;
  const started = time(match.startedAtISO || match.createdAt);
  const ended = match.isFinished ? time(match.completedAtISO || match.finishedAt || match.lastUpdated) : now;
  const captured = time(clip.capturedAtMs || clip.capturedAtMillis || clip.capturedAtISO ||
    clip.capturedAt || clip.requestedAtMillis || clip.requestedAt || ctx.capturedAtISO);
  return Number.isFinite(captured) && captured >= started && captured <= ended;
}
