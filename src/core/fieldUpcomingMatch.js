import {buildCurrentMatchFromFixture} from "../core/scheduledFixtures.js";

export function resolveFieldUpcomingMatch({season, teams = []}) {
  const venueSeason = season;
    const liveMatch = Object.values(
      venueSeason?.liveMatches || {}
    ).find((match) => match?.status === "live") || null;

    const scheduledFixtures = (
      venueSeason?.fixtures || []
    ).filter((fixture) =>
      fixture?.status === "scheduled"
    );

    const nextFixture =
      scheduledFixtures.find((fixture) =>
        fixture.id === venueSeason?.selectedFixtureId &&
        !venueSeason?.liveMatches?.[fixture.id]
      ) ||
      scheduledFixtures.find((fixture) =>
        !venueSeason?.liveMatches?.[fixture.id]
      ) || null;

    const confirmedTeams = teams.filter((team) =>
      (venueSeason?.clubIds || []).includes(team.id)
    );

    const currentMatch = liveMatch
      ? buildCurrentMatchFromFixture({
          teamAId: liveMatch.clubAId,
          teamBId: liveMatch.clubBId,
        }, confirmedTeams)
      : nextFixture
      ? buildCurrentMatchFromFixture({
          teamAId: nextFixture.clubAId,
          teamBId: nextFixture.clubBId,
        }, confirmedTeams)
      : {
          teamAId: teams[0]?.id || null,
          teamBId: teams[1]?.id || null,
          standbyId: teams[2]?.id || null,
        };

  return {liveMatch, scheduledFixtures, nextFixture, confirmedTeams, currentMatch};
}
