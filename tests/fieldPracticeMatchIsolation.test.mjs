import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile, writeFile, unlink} from "node:fs/promises";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {build} from "esbuild";
import {initializeTestEnvironment} from "@firebase/rules-unit-testing";
import {
  doc, setDoc, getDoc, Timestamp,
} from "firebase/firestore";

test("Practice kickoff, events and completion remain inside their session", async () => {
  const env = await initializeTestEnvironment({
    projectId: "demo-field-practice-match-isolation",
    firestore: {rules: await readFile("firestore.rules", "utf8")},
  });
  const db = env.authenticatedContext("owner").firestore();
  const scope = {
    kind: "venueLeague", environment: "practice",
    venueId: "field", seasonId: "season", practiceSessionId: "session",
  };
  const root = "sandboxes/practice/leagueVenues/field/sessions/session";
  const clubs = ["a", "b", "c"];
  const fixture = {
    id: "fixture", matchDayId: "day", clubAId: "a", clubBId: "b",
    clubAName: "A", clubBName: "B", status: "scheduled",
    scheduledLocal: "2030-10-09T18:00",
  };
  const players = id => Array.from({length: 6}, (_, index) => ({
    sourcePlayerId: `${id}-${index}`, memberId: `${id}-member-${index}`,
    fullName: `${id.toUpperCase()} Player ${index}`,
    mentality: index + 1, shooting: 3, status: "active", photoData: "",
  }));
  const savedLineups = Object.fromEntries(["a", "b"].map(id => [id, {
    "5": {variants: {admin: {
      formationId: "2-1-1", matchDayId: "day",
      squadFingerprint: `fingerprint-${id}`,
      positions: Object.fromEntries(
        players(id).slice(0, 5).map((p, index) => [`p${index + 1}`, p.fullName])
      ),
      benchSnapshot: [players(id)[5].fullName], meta: {},
    }}},
  }]));
  const season = {
    id: "season", status: "active", gameFormat: "5_V_5",
    scheduleVersion: 1, allowEarlyStarts: true,
    matchDays: [{
      id: "day", dateLocal: "2030-10-09", roundNo: 1,
      status: "scheduled", fixtureIds: ["fixture"],
      opensAtMs: Date.parse("2030-10-09T00:00:00+02:00"),
    }], matchDayHistory: [],
    clubIds: clubs, fixtures: [fixture], currentMatchNo: 1,
    invitations: Object.fromEntries(clubs.map(id => [id, {status: "accepted"}])),
    savedLineups, results: [], allEvents: [], liveMatches: {}, streaks: {},
    scheduleSettings: {halftimeMinutes: 5},
  };
  const sentinels = [
    ["leagueVenues/field", {
      ownerUid: "owner", name: "Official Field",
      league: {activeSeason: {id: "official-season", results: []}},
    }],
    ["clubs/a", {name: "Official Club", unchanged: true}],
    ["sandboxes/practice/clubs/a/sessions/club-session/state/main",
      {unchanged: "club-practice"}],
    ["sandboxes/practice/leagueVenues/field/sessions/other-session",
      {unchanged: "other-field-practice"}],
  ];
  await env.withSecurityRulesDisabled(async context => {
    const adminDb = context.firestore();
    await setDoc(doc(adminDb, "practiceSessions/session"), {
      kind: "venueLeague", environment: "practice",
      venueId: "field", sessionId: "session", userId: "owner",
      status: "active", expiresAt: Timestamp.fromMillis(Date.now() + 900000),
    });
    await setDoc(doc(adminDb, root), {
      venueId: "field", environment: "practice",
      practiceSessionId: "session", league: {activeSeason: season},
    });
    for (const [path, value] of sentinels) await setDoc(doc(adminDb, path), value);
    for (const id of ["a", "b"]) {
      await setDoc(doc(adminDb,
        `${root}/seasons/season/fieldMatchDayManifests/day/clubs/${id}`), {
        version: 1, environment: "practice", practiceSessionId: "session",
        venueId: "field", seasonId: "season", clubId: id,
        fixtureId: "fixture", matchDayId: "day",
        confirmed: true, fingerprint: `fingerprint-${id}`, players: players(id),
      });
    }
  });

  const bundlePath = resolve("tests/.field-practice-match-isolation-runtime.mjs");
  globalThis.__fieldPracticeIsolationHarness = {
    db, auth: {currentUser: {uid: "owner", displayName: "Test Official"}},
  };
  try {
    const config = await readFile("src/firebaseConfig.js", "utf8");
    const names = new Set(["db", "auth", "getActiveFirebaseFunctionsBaseUrl"]);
    for (const match of config.matchAll(
      /export\s+(?:async\s+)?(?:const|let|var|function|class)\s+(\w+)/g
    )) names.add(match[1]);
    for (const match of config.matchAll(/export\s*\{([^}]+)\}/g)) {
      for (const entry of match[1].split(",")) {
        const name = entry.trim().split(/\s+as\s+/).at(-1);
        if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
      }
    }
    const shim = [
      "const harness = globalThis.__fieldPracticeIsolationHarness;",
      "export const db = harness.db;",
      "export const auth = harness.auth;",
      ...[...names].filter(name => !["db", "auth"].includes(name)).map(name =>
        `export const ${name} = () => {throw new Error("Unexpected Firebase service: ${name}");};`
      ),
    ].join("\n");
    const output = await build({
      stdin: {
        contents: `
          export {startPracticeFixture, loadPracticeMatchPlayers}
            from "./src/storage/fieldPracticeMatchRepository.js";
          export {
            completeVenueFixture, cancelVenueFixtureStart,
            archiveVenueMatchDay, endVenueSeason,
            chooseVenueFixturePairing, setVenueScheduleTesting,
          } from "./src/storage/leagueSeasonRepository.js";
          export {
            submitPracticeDecision, reviewPracticeDecision,
          } from "./src/storage/fieldPracticeDecisionRepository.js";
          export {saveVenueLiveMatchState, markVenueLiveMatchCompleted}
            from "./src/storage/venueLiveMatchRepository.js";
        `,
        resolveDir: process.cwd(), loader: "js",
      },
      bundle: true, platform: "node", format: "esm",
      packages: "external", write: false,
      plugins: [{
        name: "emulator-config",
        setup(builder) {
          builder.onResolve({filter: /firebaseConfig\.js$/},
            () => ({path: "emulator-config", namespace: "test-config"}));
          builder.onLoad({filter: /.*/, namespace: "test-config"},
            () => ({contents: shim, loader: "js"}));
        },
      }],
    });
    await writeFile(bundlePath, output.outputFiles[0].text);
    const api = await import(pathToFileURL(bundlePath).href);
    const teams = clubs.map(id => ({
      id, name: id.toUpperCase(), label: id.toUpperCase(), players: players(id),
    }));
    const controller = {
      uid: "owner", deviceId: "test-referee", role: "admin", name: "Test Official",
    };

    // Requests remain pending until explicitly reviewed.
    const request = requestId => ({
      scope, venueId: "field", seasonId: "season", requestId,
      action: "reschedule_day", reason: "Practising a kickoff time change",
      parameters: {
        matchDayId: "day", dateLocal: "2030-10-09", startTime: "19:00",
      },
    });
    await api.submitPracticeDecision(request("approve-request"));
    await api.submitPracticeDecision(request("stale-request"));
    assert.equal(
      (await getDoc(doc(db, root))).data().league.activeSeason
        .fixtures[0].scheduledLocal,
      "2030-10-09T18:00"
    );
    await api.reviewPracticeDecision({
      scope, venueId: "field", requestId: "approve-request", response: "approve",
    });
    assert.equal(
      (await getDoc(doc(db, root))).data().league.activeSeason
        .fixtures[0].scheduledLocal,
      "2030-10-09T19:00"
    );
    assert.equal(
      (await getDoc(doc(db,
        `${root}/seasons/season/fieldMatchDayManifests/day/clubs/a`
      ))).data().scheduledLocal,
      "2030-10-09T19:00"
    );
    await assert.rejects(api.reviewPracticeDecision({
      scope, venueId: "field", requestId: "stale-request", response: "approve",
    }), /changed/);
    await api.reviewPracticeDecision({
      scope, venueId: "field", requestId: "stale-request", response: "reject",
    });
    assert.equal(
      (await getDoc(doc(db, `${root}/decisionRequests/stale-request`))).data().status,
      "rejected"
    );
    await assert.rejects(api.submitPracticeDecision({
      ...request("wrong-session-request"),
      scope: {...scope, practiceSessionId: "other-session"},
    }));
    await api.setVenueScheduleTesting({
      scope, venueId: "field", seasonId: "season", enabled: true,
    });
    await api.chooseVenueFixturePairing({
      scope, venueId: "field", seasonId: "season",
      clubAId: "a", clubBId: "b",
    });

    // A mismatched season must block kickoff.
    await assert.rejects(api.startPracticeFixture({
      scope: {...scope, seasonId: "wrong-season"}, teams, controller,
    }));
    await api.startPracticeFixture({scope, teams, controller});
    const livePath = `${root}/seasons/season/matches/current`;
    const started = (await getDoc(doc(db, livePath))).data();
    assert.equal(started.environment, "practice");
    assert.equal(started.practiceSessionId, "session");
    assert.deepEqual(
      started.confirmedLineupSnapshot.a.positions,
      savedLineups.a["5"].variants.admin.positions
    );
    assert.deepEqual(started.confirmedLineupSnapshot.a.benchSnapshot, ["A Player 5"]);
    const roster = await api.loadPracticeMatchPlayers({
      firestore: db, scope, fixtureId: "fixture",
    });
    assert.equal(roster.docs.length, 12);
    assert.equal(roster.docs[0].data().mentality, 1);
    await assert.rejects(api.loadPracticeMatchPlayers({
      firestore: db, scope, fixtureId: "wrong-fixture",
    }));

    const events = [{
      id: "goal-one", type: "goal", teamId: "a",
      player: "A Player 4", scorer: "A Player 4", timeSeconds: 30,
    }];
    await api.saveVenueLiveMatchState({
      scope, patch: {currentEvents: events, goalsA: 1, goalsB: 0},
    });
    const summary = {teamAId: "a", teamBId: "b", goalsA: 1, goalsB: 0};
    const completed = await api.completeVenueFixture({
      scope, venueId: "field", fixtureId: "fixture", summary,
      currentEvents: events,
      confirmedLineupSnapshot: started.confirmedLineupSnapshot,
      lineupTimeline: [],
    });
    assert.equal(completed.result.goalsA, 1);
    assert.equal(completed.result.status, "completed");
    await api.markVenueLiveMatchCompleted({scope, summary, currentEvents: events});
    const after = (await getDoc(doc(db, root))).data().league.activeSeason;
    assert.equal(after.results.length, 1);
    assert.equal(after.fixtures[0].status, "completed");

    // Completed games must be archived before ending the season.
    await assert.rejects(api.endVenueSeason({
      scope, venueId: "field", seasonId: "season", mode: "complete",
    }), /End Match Day/);
    const dayArchive = await api.archiveVenueMatchDay({
      scope, venueId: "field", seasonId: "season", matchDayId: "day",
    });
    assert.equal(dayArchive.results.length, 1);
    assert.equal(dayArchive.results[0].goalsA, 1);
    const next = await api.endVenueSeason({
      scope, venueId: "field", seasonId: "season", mode: "complete",
    });
    const archive = (await getDoc(doc(db, `${root}/seasons/season`))).data();
    assert.equal(archive.status, "completed");
    assert.equal(archive.matchDayHistory.length, 1);
    assert.equal(archive.results[0].goalsA, 1);
    assert.equal(next.previousSeasonId, "season");
    const nextScope = {...scope, seasonId: next.id};
    await api.endVenueSeason({
      scope: nextScope, venueId: "field", seasonId: next.id,
      mode: "cancel", cancellationReason: "Practising season cancellation",
    });
    assert.equal(
      (await getDoc(doc(db, `${root}/seasons/${next.id}`))).data().status,
      "cancelled"
    );

    await env.withSecurityRulesDisabled(async context => {
      for (const [path, expected] of sentinels) {
        assert.deepEqual(
          (await getDoc(doc(context.firestore(), path))).data(),
          expected, `Data changed outside the current session: ${path}`
        );
      }
    });
  } finally {
    delete globalThis.__fieldPracticeIsolationHarness;
    await unlink(bundlePath).catch(() => {});
    await env.cleanup();
  }
});
