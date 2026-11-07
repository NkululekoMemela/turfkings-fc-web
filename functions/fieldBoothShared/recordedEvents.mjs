import {randomUUID} from "node:crypto";
import {fieldMatchStatEvents} from "./fieldDefensiveStats.mjs";

const types = new Set(["goal", "yellow_card", "red_card", "injury_knock", "injury_sitting_out", "injury_recovered"]);
const list = value => Array.isArray(value) ? value : [];
const name = value => typeof value === "string" ? value.trim().slice(0, 150) : "";

export function canCorrectRecordedMatch({venue, staff, uid, result}) {
  return Boolean(uid && (venue.ownerUid === uid || (staff?.status === "active" &&
    (staff.isAdministrator === true || (staff.role === "referee" && result?.completedByUid === uid)))));
}

export function correctRecordedMatchEvent({season, result, action, eventId, draft = {}, uid, now}) {
  if (!["add", "edit", "delete"].includes(action)) throw Error("Choose a valid correction.");
  const fixtureId = result.fixtureId || result.id;
  const matchNo = Number(result.matchNo);
  const belongs = event => event.fixtureId ? event.fixtureId === fixtureId : Number(event.matchNo) === matchNo;
  const isResult = saved => (saved.fixtureId || saved.id) === fixtureId;
  const allEvents = list(season.allEvents);
  const byId = new Map();
  for (const event of [...allEvents.filter(belongs), ...list(result.events)]) {
    byId.set(event.id == null ? JSON.stringify(event) : String(event.id), event);
  }
  let events = [...byId.values()];
  const target = action === "add" || !eventId ? null : byId.get(String(eventId));
  if (action !== "add" && (!target || !types.has(target.type))) throw Error("Recorded event no longer exists.");

  const type = target?.type || draft.type || "goal";
  const teamId = target && type !== "goal" ? target.teamId : draft.teamId || target?.teamId;
  const playerName = name(draft.playerName);
  const assist = name(draft.assist);
  const timeSeconds = Number(draft.timeSeconds ?? target?.timeSeconds ?? 0);
  if (!types.has(type) || (action !== "delete" &&
    (!playerName || ![result.teamAId, result.teamBId].includes(teamId) || !Number.isFinite(timeSeconds) || timeSeconds < 0))) {
    throw Error("Choose a participating club and player.");
  }
  if (target) events = events.filter(event => event !== target);
  if (action !== "delete") events.push({
    ...target, id: target?.id || randomUUID(), fixtureId, matchNo, type, teamId, timeSeconds,
    ...(type === "goal" ? {scorer: playerName, assist: assist && assist !== playerName ? assist : null}
      : {playerName}),
  });
  events.sort((a,b) => (Number(a.timeSeconds) || 0) - (Number(b.timeSeconds) || 0));

  let score = {};
  if (type === "goal") {
    const delta = id => Number(action !== "delete" && teamId === id) - Number(target?.teamId === id);
    const goalsA = Number(result.goalsA) + delta(result.teamAId);
    const goalsB = Number(result.goalsB) + delta(result.teamBId);
    if (![goalsA, goalsB].every(n => Number.isInteger(n) && n >= 0)) throw Error("The saved score could not be reconciled.");
    score = {goalsA, goalsB, scoreA: goalsA, scoreB: goalsB,
      winnerId: goalsA === goalsB ? null : goalsA > goalsB ? result.teamAId : result.teamBId,
      isDraw: goalsA === goalsB};
    events = fieldMatchStatEvents({...result, ...score, gameFormat: result.gameFormat || season.gameFormat || "5_V_5"}, events);
  }
  const corrected = {...result, ...score, events, correctedAtMs: now, correctedByUid: uid};
  const next = {
    ...season,
    allEvents: [...allEvents.filter(event => !belongs(event)), ...events],
    results: season.results.map(saved => isResult(saved) ? corrected : saved),
    matchDayHistory: list(season.matchDayHistory).map(day => list(day.results).some(isResult) ? {
      ...day,
      results: day.results.map(saved => isResult(saved) ? corrected : saved),
      allEvents: [...list(day.allEvents).filter(event => !belongs(event)), ...events],
    } : day),
  };
  if (type === "goal") {
    next.fixtures = list(season.fixtures).map(fixture => fixture.id === fixtureId ? {...fixture, ...score} : fixture);
  }
  const savedLive = season.liveMatches?.[fixtureId];
  if (savedLive?.status === "completed") {
    next.liveMatches = {...season.liveMatches, [fixtureId]: {...savedLive, ...score,
      ...(Array.isArray(savedLive.events) ? {events} : {}),
      ...(Array.isArray(savedLive.currentEvents) ? {currentEvents: events} : {}),
    }};
  }
  return {next, type};
}
