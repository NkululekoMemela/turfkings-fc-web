import {
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import { db } from "../firebaseConfig.js";
import {
  getPlayerPhotosCollection,
  getPlayersCollection,
} from "../core/clubFirestorePaths.js";
import {
  getVenueLeagueSeasonCollection,
  getVenueLeagueSeasonItemDoc,
} from "../core/venueLeagueFirestorePaths.js";
import {
  normalizeVenueLeagueScope,
} from "../core/venueLeaguePaths.js";

function normalizePlayerNames(playerNames = []) {
  const seen = new Set();
  const normalized = [];

  (Array.isArray(playerNames) ? playerNames : [])
    .forEach((value) => {
      const name = String(value || "").trim();
      const key = name.toLocaleLowerCase();

      if (!name || seen.has(key)) return;

      seen.add(key);
      normalized.push(name);
    });

  return normalized;
}

function requireSafeId(value, label) {
  const safe = String(value || "").trim();

  if (!safe || safe.includes("/")) {
    throw new Error(
      `${label} must be a non-empty Firestore-safe ID.`
    );
  }

  return safe;
}

export function getVenueLiveMatchDoc(
  firestore,
  scope,
  documentId = "current"
) {
  const normalized = normalizeVenueLeagueScope(
    scope,
    { requireSeason: true }
  );

  return getVenueLeagueSeasonItemDoc(
    firestore,
    "matches",
    requireSafeId(documentId, "match document ID"),
    normalized
  );
}

function getVenueGoalkeeperRestrictionsCollection(scope) {
  const normalized = normalizeVenueLeagueScope(
    scope,
    { requireSeason: true }
  );

  return getVenueLeagueSeasonCollection(
    db,
    "goalkeeperRestrictions",
    normalized
  );
}

function getVenueGoalkeeperRestrictionsDoc(
  scope,
  clubId
) {
  const normalized = normalizeVenueLeagueScope(
    scope,
    { requireSeason: true }
  );

  return getVenueLeagueSeasonItemDoc(
    db,
    "goalkeeperRestrictions",
    requireSafeId(clubId, "clubId"),
    normalized
  );
}

export function subscribeVenueGoalkeeperRestrictions({
  scope,
  onData,
  onError,
}) {
  return onSnapshot(
    getVenueGoalkeeperRestrictionsCollection(scope),
    (snapshot) => {
      const byClubId = {};

      snapshot.docs.forEach((entry) => {
        const data = entry.data() || {};

        byClubId[entry.id] = normalizePlayerNames(
          data.goalkeeperRestrictedPlayerKeys || []
        );
      });

      onData?.(byClubId);
    },
    (error) => {
      console.error(
        "[VenueGoalkeeperRestrictions] Subscription failed:",
        error
      );
      onError?.(error);
    }
  );
}

export async function saveVenueClubGoalkeeperRestrictions({
  scope,
  clubId,
  goalkeeperRestrictedPlayerKeys = [],
  updatedByName = "",
  updatedByRole = "",
}) {
  const safeClubId = requireSafeId(clubId, "clubId");
  const normalized = normalizePlayerNames(
    goalkeeperRestrictedPlayerKeys
  );

  await setDoc(
    getVenueGoalkeeperRestrictionsDoc(
      scope,
      safeClubId
    ),
    {
      clubId: safeClubId,
      goalkeeperRestrictedPlayerKeys: normalized,
      updatedAt: serverTimestamp(),
      updatedAtMs: Date.now(),
      updatedByName:
        String(updatedByName || "").trim(),
      updatedByRole:
        String(updatedByRole || "").trim(),
    },
    { merge: true }
  );

  return normalized;
}


function participatingClubIds(teams = []) {
  return Array.from(
    new Set(
      (Array.isArray(teams) ? teams : [])
        .map((team) =>
          String(team?.id || "").trim()
        )
        .filter(
          (clubId) =>
            clubId &&
            !clubId.startsWith("awaiting-club-")
        )
    )
  );
}

function combineClubSnapshots(entries = []) {
  const documents = [];

  entries.forEach(({ clubId, snapshot }) => {
    snapshot.docs.forEach((document) => {
      const sourcePlayerId = document.id;

      documents.push({
        id: `${clubId}::${sourcePlayerId}`,
        data() {
          return {
            ...(document.data() || {}),
            clubId,
            sourcePlayerId,
          };
        },
      });
    });
  });

  return {
    docs: documents,
    forEach(callback) {
      documents.forEach(callback);
    },
  };
}

async function loadClubSnapshots({
  firestore,
  teams,
  collectionForClub,
}) {
  const clubIds = participatingClubIds(teams);

  const entries = await Promise.all(
    clubIds.map(async (clubId) => ({
      clubId,
      snapshot: await getDocs(
        collectionForClub(firestore, clubId)
      ),
    }))
  );

  return combineClubSnapshots(entries);
}

export function loadVenueLeaguePlayers({
  firestore,
  teams,
}) {
  return loadClubSnapshots({
    firestore,
    teams,
    collectionForClub: getPlayersCollection,
  });
}

export function loadVenueLeaguePlayerPhotos({
  firestore,
  teams,
}) {
  return loadClubSnapshots({
    firestore,
    teams,
    collectionForClub: getPlayerPhotosCollection,
  });
}

export { normalizePlayerNames };


export function subscribeVenueLiveMatch({
  scope,
  onData,
  onError,
}) {
  return onSnapshot(
    getVenueLiveMatchDoc(db, scope, "current"),
    (snapshot) => {
      onData?.(
        snapshot.exists()
          ? {
              id: snapshot.id,
              ...snapshot.data(),
            }
          : null
      );
    },
    (error) => {
      console.error(
        "[VenueLiveMatch] Subscription failed:",
        error
      );
      onError?.(error);
    }
  );
}

export async function saveVenueLiveMatchState({
  scope,
  patch = {},
}) {
  if (!patch || typeof patch !== "object") {
    throw new Error(
      "A valid Field live-match update is required."
    );
  }

  await updateDoc(
    getVenueLiveMatchDoc(db, scope, "current"),
    {
      ...patch,
      ...(Object.prototype.hasOwnProperty.call(patch, "currentEvents")
        ? { events: patch.currentEvents }
        : {}),
      venueId: scope?.venueId || "",
      seasonId: scope?.seasonId || "",
      updatedAt: serverTimestamp(),
      updatedAtMs: Date.now(),
    }
  );
}

export function buildVenueLiveMatchDocument({
  scope,
  match,
  teams = [],
  matchSeconds = 3600,
  currentMatchNo = 1,
  startedByUid = "",
  controller = null,
}) {
  const startedAtMs = Date.now();
  const startedAtISO = new Date(startedAtMs).toISOString();
  const safeMatchSeconds =
    Number(matchSeconds) > 0
      ? Number(matchSeconds)
      : 3600;

  const teamAId = String(
    match?.clubAId ||
    match?.teamAId ||
    ""
  ).trim();

  const teamBId = String(
    match?.clubBId ||
    match?.teamBId ||
    ""
  ).trim();

  const standbyId = String(match?.standbyId || "").trim();

  if (!teamAId || !teamBId || !standbyId ||
      new Set([teamAId, teamBId, standbyId]).size !== 3) {
    throw new Error(
      "The Field match requires three distinct clubs."
    );
  }

  const currentMatch = {
    fixtureId:
      String(match?.fixtureId || "").trim(),
    teamAId,
    teamBId,
    standbyId,
    matchType: "LEAGUE",
    matchMode: "fixtured",
    gameFormat: "5_V_5",
  };

  const teamA = teams.find((team) => team?.id === teamAId);
  const teamB = teams.find((team) => team?.id === teamBId);
  const standbyTeam = teams.find((team) => team?.id === standbyId);

  return {
    currentMatch,
    data: {
      venueId: scope?.venueId || "",
      seasonId: scope?.seasonId || "",
      fixtureId: currentMatch.fixtureId,
      status: "live",
      running: true,
      timeUp: false,
      matchSeconds: safeMatchSeconds,
      secondsLeft: safeMatchSeconds,
      currentMatchNo:
        Number(currentMatchNo) || 1,
      currentMatch,
      matchType: "LEAGUE",
      matchNumber: Number(currentMatchNo) || 1,
      teamAId,
      teamBId,
      standbyId,
      standbyLabel: standbyTeam?.label || standbyId,
      standbySnapshot: standbyTeam || null,
      teamALabel: teamA?.label || match?.clubAName || teamAId,
      teamBLabel: teamB?.label || match?.clubBName || teamBId,
      teamASnapshot: teamA || null,
      teamBSnapshot: teamB || null,
      events: [],
      goalsA: 0,
      goalsB: 0,
      finalSummary: null,
      isFinished: false,
      teams: Array.isArray(teams)
        ? teams
        : [],
      currentEvents: [],
      liveMatchController: controller,
      liveMatchTakeoverRequest: null,
      startedAtISO,
      expectedEndAtISO: new Date(
        startedAtMs + safeMatchSeconds * 1000
      ).toISOString(),
      lastKnownSecondsLeft: safeMatchSeconds,
      lastSavedAtISO: startedAtISO,
      confirmedLineupSnapshot: null,
      confirmedLineupsByMatchNo: {},
      matchTeamColorOverrides: {},
      startedByUid:
        String(startedByUid || "").trim(),
      startedAt: serverTimestamp(),
      startedAtMs,
      updatedAt: serverTimestamp(),
      updatedAtMs: Date.now(),
    },
  };
}

export async function initialiseVenueLiveMatch(args) {
  const { currentMatch, data } = buildVenueLiveMatchDocument(args);
  await setDoc(
    getVenueLiveMatchDoc(db, args.scope, "current"),
    data,
    { merge: false }
  );
  return currentMatch;
}

export async function markVenueLiveMatchCompleted({
  scope,
  summary = {},
  currentEvents = [],
}) {
  await setDoc(
    getVenueLiveMatchDoc(db, scope, "current"),
    {
      status: "completed",
      running: false,
      timeUp: true,
      isFinished: true,
      finalSummary: {
        teamAId:
          String(summary?.teamAId || "").trim(),
        teamBId:
          String(summary?.teamBId || "").trim(),
        standbyId: null,
        goalsA:
          Math.max(0, Number(summary?.goalsA) || 0),
        goalsB:
          Math.max(0, Number(summary?.goalsB) || 0),
      },
      currentEvents: Array.isArray(currentEvents)
        ? currentEvents
        : [],
      events: Array.isArray(currentEvents)
        ? currentEvents
        : [],
      completedAt: serverTimestamp(),
      completedAtMs: Date.now(),
      updatedAt: serverTimestamp(),
      updatedAtMs: Date.now(),
    },
    { merge: true }
  );
}
