import {buildDatedMatchDayArchive} from "./fieldMatchDayArchive.mjs";

export function matchDayReviewTiming(readyAtMs) {
  if (!Number.isFinite(readyAtMs) || readyAtMs <= 0) {
    throw new Error("A valid completion time is required.");
  }
  const localDate = new Date(readyAtMs + 2 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
  return {
    reminderAtMs: readyAtMs + 2 * 60 * 60 * 1000,
    autoCloseAtMs: Date.parse(`${localDate}T23:59:00+02:00`),
  };
}

export function evaluateMatchDayReview({
  season, matchDayId, review = null, now = Date.now(),
}) {
  let archive;
  try {
    archive = buildDatedMatchDayArchive({
      season, matchDayId, actorUid: "system", now,
    });
  } catch {
    return {ready: false, notify: false, remind: false, close: false};
  }
  const readyAtMs = review?.readyAtMs || now;
  const timing = matchDayReviewTiming(readyAtMs);
  const close = now >= timing.autoCloseAtMs;
  return {
    ready: true, archive, readyAtMs, ...timing,
    notify: !close && !review?.initialSentAtMs,
    remind: !close && Boolean(review?.initialSentAtMs) &&
      !review?.reminderSentAtMs && now >= timing.reminderAtMs,
    close,
  };
}
