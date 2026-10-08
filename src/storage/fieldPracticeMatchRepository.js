import {doc, getDoc, runTransaction} from "firebase/firestore";
import {auth, db} from "../firebaseConfig.js";
import {venueLeagueRootPath} from "../core/venueLeaguePaths.js";
import {build as buildStartingFormation} from "../core/fieldStartingFormation.js";
import {
  buildVenueLiveMatchDocument, getVenueLiveMatchDoc,
} from "./venueLiveMatchRepository.js";

function practiceRoot(scope) {
  const root = venueLeagueRootPath(scope);
  if (scope.environment !== "practice" || !scope.seasonId) {
    throw new Error("An explicit Field Practice season is required.");
  }
  return root;
}

function checkSession(session, scope) {
  if (!auth.currentUser?.uid ||
      session?.kind !== "venueLeague" ||
      session.environment !== "practice" ||
      session.sessionId !== scope.practiceSessionId ||
      session.venueId !== scope.venueId ||
      session.userId !== auth.currentUser.uid ||
      session.status !== "active" ||
      typeof session.expiresAt?.toMillis !== "function" ||
      session.expiresAt.toMillis() <= Date.now()) {
    throw new Error("This Field Practice session is unavailable or expired.");
  }
}

export async function loadPracticeMatchPlayers({firestore = db, scope, fixtureId}) {
  practiceRoot(scope);
  const snapshot = await getDoc(getVenueLiveMatchDoc(firestore, scope, "current"));
  const match = snapshot.data();
  if (!match || match.fixtureId !== fixtureId ||
      match.environment !== "practice" ||
      match.practiceSessionId !== scope.practiceSessionId) {
    throw new Error("The sandbox match roster is unavailable.");
  }
  const entries = Object.entries(match.paidSquads || {}).flatMap(
    ([clubId, players]) => players.map(player => ({
      id: `${clubId}::${player.sourcePlayerId}`,
      data: () => ({...player, clubId}),
    }))
  );
  return {docs: entries, forEach: callback => entries.forEach(callback)};
}

export async function startPracticeFixture({scope, fixtureId = "", teams, controller}) {
  const root = practiceRoot(scope);
  const rootRef = doc(db, root);
  const liveRef = getVenueLiveMatchDoc(db, scope, "current");
  return runTransaction(db, async tx => {
    const sessionSnap = await tx.get(
      doc(db, "practiceSessions", scope.practiceSessionId)
    );
    checkSession(sessionSnap.data(), scope);
    const venueSnap = await tx.get(rootRef);
    const liveSnap = await tx.get(liveRef);
    const season = venueSnap.data()?.league?.activeSeason;
    if (season?.id !== scope.seasonId) {
      throw new Error("The Practice season changed.");
    }
    if (liveSnap.data()?.status === "live") {
      throw new Error("Finish the current Practice match first.");
    }
    if (season.gameFormat !== "5_V_5") {
      throw new Error("This Practice kickoff adapter currently supports five-a-side.");
    }
    const fixture = fixtureId
      ? season.fixtures?.find(item => item.id === fixtureId)
      : season.fixtures?.find(item => item.status === "scheduled");
    if (!fixture || fixture.status !== "scheduled") {
      throw new Error("No scheduled Practice fixture is available.");
    }
    const squads = {};
    const squadFingerprints = {};
    for (const clubId of [fixture.clubAId, fixture.clubBId]) {
      if (season.invitations?.[clubId]?.status !== "accepted") {
        throw new Error("Both sandbox Clubs must accept first.");
      }
      const snap = await tx.get(doc(db,
        `${root}/seasons/${season.id}/fieldMatchDayManifests/${fixture.matchDayId}/clubs/${clubId}`
      ));
      const manifest = snap.data();
      if (!manifest?.confirmed ||
          manifest.environment !== "practice" ||
          manifest.practiceSessionId !== scope.practiceSessionId ||
          manifest.seasonId !== season.id ||
          manifest.clubId !== clubId ||
          manifest.fixtureId !== fixture.id ||
          manifest.matchDayId !== fixture.matchDayId) {
        throw new Error(`${clubId}: a confirmed sandbox squad is required.`);
      }
      squads[clubId] = manifest.players;
      squadFingerprints[clubId] = manifest.fingerprint;
    }
    const {startingLineups} = buildStartingFormation({
      season, fixture, squads, squadFingerprints,
    });
    const standbyId = season.clubIds.find(id =>
      id !== fixture.clubAId && id !== fixture.clubBId
    );
    if (!standbyId) throw new Error("The shared runtime requires a standby Club.");
    if (controller?.uid !== auth.currentUser.uid || !controller.deviceId) {
      throw new Error("The Practice referee device is missing.");
    }
    const matchNo = Number(season.currentMatchNo) || 1;
    const match = {
      ...fixture, fixtureId: fixture.id, standbyId,
      status: "live", startedByUid: auth.currentUser.uid,
      startedAtMs: Date.now(),
    };
    const {data} = buildVenueLiveMatchDocument({
      scope, match, teams, controller,
      currentMatchNo: matchNo,
      matchSeconds: Number(fixture.matchSeconds || season.matchSeconds) || 2400,
      startedByUid: auth.currentUser.uid,
    });
    tx.set(liveRef, {
      ...data, environment: "practice",
      practiceSessionId: scope.practiceSessionId,
      paidSquads: squads,
      confirmedLineupSnapshot: startingLineups,
      clockVersion: 1, clockPhase: "first_half",
      halftimeSeconds: Number(season.scheduleSettings?.halftimeMinutes ?? 5) * 60,
      halftimeEndsAtMs: 0,
    });
    tx.update(rootRef, {
      "league.activeSeason": {
        ...season, currentMatchNo: matchNo,
        liveMatches: {...season.liveMatches, [fixture.id]: match},
      },
    });
    return match;
  });
}
