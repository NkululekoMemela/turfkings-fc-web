import {fieldMatchStatEvents} from "./fieldDefensiveStats.mjs";
import rotation from "../fieldResultRotation.cjs";
const {computeNextFromResult}=rotation;
export function completeBoothSeason({season, fixtureId, summary, currentEvents, confirmedLineupSnapshot, lineupTimeline, playedSeconds, uid}) {
 const fixtureIndex=(season.fixtures||[]).findIndex(f=>f.id===fixtureId);
 const fixtures=season.fixtures||[], fixture=fixtures[fixtureIndex], liveMatch=season.liveMatches?.[fixtureId], user={uid};
 if(!fixture || liveMatch?.status!=="live")throw Error("This match is no longer live.");
      const teamAId = String(
        summary?.teamAId ||
        fixture.clubAId ||
        ""
      ).trim();

      const teamBId = String(
        summary?.teamBId ||
        fixture.clubBId ||
        ""
      ).trim();

      if (
        teamAId !== fixture.clubAId ||
        teamBId !== fixture.clubBId
      ) {
        throw new Error(
          "The completed clubs do not match the scheduled fixture."
        );
      }

      const goalsA = Math.max(
        0,
        Number(summary?.goalsA) || 0
      );

      const goalsB = Math.max(
        0,
        Number(summary?.goalsB) || 0
      );

      const standbyId = String(liveMatch.standbyId || "").trim();
      if (!standbyId ||
          standbyId === teamAId ||
          standbyId === teamBId ||
          !(season.clubIds || []).includes(standbyId)) {
        throw new Error("The live match is missing its confirmed standby club.");
      }

      const rotation = computeNextFromResult(
        season.streaks || {},
        { teamAId, teamBId, standbyId, goalsA, goalsB }
      );

      const matchNo =
        Number(season.currentMatchNo) ||
        (
          Array.isArray(season.results)
            ? season.results.length + 1
            : 1
        );

      const completedAtMs = Date.now();
      const gameFormat = season.gameFormat || "5_V_5";
      const matchMeta = {
        matchType: "LEAGUE",
        gameFormat,
        matchMode: "scheduled_target",
      };
      const rawCommittedEvents = (Array.isArray(currentEvents) ? currentEvents : [])
        .map((event) => ({ ...event, ...matchMeta, matchNo }));
      const confirmedPlayedSeconds=Number.isFinite(playedSeconds)&&playedSeconds>=0?playedSeconds:null;
      const committedEvents=fieldMatchStatEvents({id:fixtureId,fixtureId,matchNo,teamAId,teamBId,goalsA,goalsB,gameFormat,playedSeconds:confirmedPlayedSeconds,confirmedLineupSnapshot,lineupTimeline},rawCommittedEvents);
      const allCommittedEvents=committedEvents;

      const result = {
        ...matchMeta,
        id: fixtureId,
        fixtureId,
        matchNo,
        teamAId,
        teamBId,
        standbyId,
        clubAId: teamAId,
        clubBId: teamBId,
        teamAName:
          fixture.clubAName || teamAId,
        teamBName:
          fixture.clubBName || teamBId,
        clubAName:
          fixture.clubAName || teamAId,
        clubBName:
          fixture.clubBName || teamBId,
        goalsA,
        goalsB,
        scoreA: goalsA,
        scoreB: goalsB,
        winnerId: rotation.winnerId,
        isDraw: rotation.isDraw,
        status: "completed",
        scheduledLocal:
          fixture.scheduledLocal || "",
        timezone:
          fixture.timezone ||
          "Africa/Johannesburg",
        playedSeconds: confirmedPlayedSeconds,
        events: committedEvents,
        confirmedLineupSnapshot:
          confirmedLineupSnapshot || null,
        lineupTimeline: Array.isArray(lineupTimeline)
          ? lineupTimeline
          : [],
        completedByUid: user.uid,
        completedAtMs,
      };

      const nextFixtures =
        fixtures.map((item, index) =>
          index === fixtureIndex
            ? {
                ...item,
                status: "completed",
                goalsA,
                goalsB,
                scoreA: goalsA,
                scoreB: goalsB,
                winnerId: result.winnerId,
                isDraw: result.isDraw,
                completedByUid: user.uid,
                completedAtMs,
              }
            : item
        );

      const nextFixture = nextFixtures.find(
        (item) => item?.status === "scheduled"
      );
      const nextCurrentMatch = nextFixture
        ? {teamAId: nextFixture.clubAId, teamBId: nextFixture.clubBId, standbyId: (season.clubIds || []).find(id => id !== nextFixture.clubAId && id !== nextFixture.clubBId)}
        : {
            teamAId: rotation.nextTeamAId,
            teamBId: rotation.nextTeamBId,
            standbyId: rotation.nextStandbyId,
          };

      const nextLiveMatches = {
        ...(season.liveMatches || {}),
        [fixtureId]: {
          ...liveMatch,
          status: "completed",
          scoreA: goalsA,
          scoreB: goalsB,
          goalsA,
          goalsB,
          winnerId: result.winnerId,
          isDraw: result.isDraw,
          completedByUid: user.uid,
          completedAtMs,
        },
      };

      const previousResults =
        Array.isArray(season.results)
          ? season.results.filter(
              (item) =>
                item?.fixtureId !== fixtureId &&
                item?.id !== fixtureId
            )
          : [];

      const nextSeason = {
        ...season,
        status: "active",
        fixtures: nextFixtures,
        liveMatches: nextLiveMatches,
        results: [
          ...previousResults,
          result,
        ],
        allEvents: [
          ...(Array.isArray(season.allEvents) ? season.allEvents : []),
          ...allCommittedEvents,
        ],
        currentMatchNo: matchNo + 1,
        currentMatch: nextCurrentMatch,
        streaks: rotation.updatedStreaks,
        updatedAtMs: completedAtMs,
      };

 return {season:nextSeason,result};
}
