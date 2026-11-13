import {canStartBesideLiveFixtures} from "../../functions/fieldParallelKickoffs.mjs";
import {buildCurrentMatchFromFixture} from "../core/scheduledFixtures.js";

export function resolveFieldUpcomingMatch({season, teams = []}) {
  const venueSeason = season;
    const liveMatches = Object.values(
      venueSeason?.liveMatches || {}
    ).filter((match) => match?.status === "live");
    const liveMatch = liveMatches[0] || null;
    const busyClubs = new Set(liveMatches.flatMap(m => [m.clubAId, m.clubBId]));
    const archivedDays = new Set((venueSeason?.matchDayHistory || []).map(
      day => day.scheduledMatchDayId || day.id));
    const openDay = (venueSeason?.matchDays || []).find(day => !archivedDays.has(day.id));

    const scheduledFixtures = (
      venueSeason?.fixtures || []
    ).filter((fixture) =>
      fixture?.status === "scheduled"
    );

    const startableFixtures = scheduledFixtures.filter(fixture =>
      !venueSeason?.liveMatches?.[fixture.id] && !archivedDays.has(fixture.matchDayId) &&
      (!openDay || fixture.matchDayId === openDay.id) &&
      !busyClubs.has(fixture.clubAId) && !busyClubs.has(fixture.clubBId) &&
      canStartBesideLiveFixtures(venueSeason, fixture));
    const nextFixture = startableFixtures.find(
      fixture => fixture.id === venueSeason?.selectedFixtureId
    ) || startableFixtures.find(fixture => fixture.replayRequestedAtMs) || startableFixtures[0] || null;

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

  return {liveMatch, liveMatches, scheduledFixtures, startableFixtures, nextFixture, confirmedTeams, currentMatch};
}

export function fieldFixturePreview({season, fixture, today}) {
  if (season?.status !== "active" || !season.schedulePublishedAtMs ||
      !fixture?.clubAId || !fixture?.clubBId) return null;
  const day = season.matchDays?.find(item => item.id === fixture.matchDayId);
  const date = fixture.scheduledLocal?.slice(0, 10) || day?.dateLocal || "";
  const time = fixture.scheduledLocal?.slice(11, 16) || "";
  return {date, time, isMatchDay: Boolean(date && date === today)};
}
