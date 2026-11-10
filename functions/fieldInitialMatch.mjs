export function buildFieldInitialMatch({
  scope,
  match,
  teams = [],
  matchSeconds = 3600,
  currentMatchNo = 1,
  startedByUid = "",
  controller = null,
  compactTeam = team => team || null,
  timestamp = () => null,
  now = Date.now(),
  resolveFormat = value => ["5_V_5", "6_V_6", "7_V_7", "11_V_11"].includes(value) ? value : "5_V_5",
}) {
  const startedAtMs = now;
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
    gameFormat: resolveFormat(match?.gameFormat),
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
      gameFormat: currentMatch.gameFormat,
      matchType: "LEAGUE",
      matchNumber: Number(currentMatchNo) || 1,
      teamAId,
      teamBId,
      standbyId,
      standbyLabel: standbyTeam?.label || standbyId,
      standbySnapshot: compactTeam(standbyTeam),
      teamALabel: teamA?.label || match?.clubAName || teamAId,
      teamBLabel: teamB?.label || match?.clubBName || teamBId,
      teamASnapshot: compactTeam(teamA),
      teamBSnapshot: compactTeam(teamB),
      events: [],
      goalsA: 0,
      goalsB: 0,
      finalSummary: null,
      isFinished: false,
      teams: Array.isArray(teams)
        ? teams.map(compactTeam)
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
      startedAt: timestamp(),
      startedAtMs,
      updatedAt: timestamp(),
      updatedAtMs: now,
    },
  };
}
