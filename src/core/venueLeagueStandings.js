function clean(value) {
  return String(value || "").trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resultClubAId(result) {
  return clean(
    result?.clubAId ||
    result?.teamAId ||
    result?.homeClubId
  );
}

function resultClubBId(result) {
  return clean(
    result?.clubBId ||
    result?.teamBId ||
    result?.awayClubId
  );
}

function resultScoreA(result) {
  return number(
    result?.scoreA ??
    result?.goalsA ??
    result?.homeScore
  );
}

function resultScoreB(result) {
  return number(
    result?.scoreB ??
    result?.goalsB ??
    result?.awayScore
  );
}

function isCompletedResult(result) {
  const status = clean(result?.status).toLowerCase();

  if (
    ["live", "scheduled", "cancelled", "postponed"]
      .includes(status)
  ) {
    return false;
  }

  return Boolean(
    resultClubAId(result) &&
    resultClubBId(result)
  );
}

export function buildVenueLeagueStandings({
  clubs = [],
  results = [],
} = {}) {
  const standings = new Map();

  for (const club of Array.isArray(clubs) ? clubs : []) {
    const id = clean(club?.id || club?.clubId);
    if (!id || standings.has(id)) continue;

    standings.set(id, {
      id,
      clubId: id,
      name: clean(
        club?.name ||
        club?.clubName ||
        club?.label ||
        id
      ),
      logo:
        club?.logo ||
        club?.clubLogo ||
        club?.badge ||
        "",
      points: 0,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
    });
  }

  for (
    const result of Array.isArray(results) ? results : []
  ) {
    if (!isCompletedResult(result)) continue;

    const clubAId = resultClubAId(result);
    const clubBId = resultClubBId(result);

    const clubA = standings.get(clubAId);
    const clubB = standings.get(clubBId);

    if (!clubA || !clubB || clubAId === clubBId) {
      continue;
    }

    const scoreA = resultScoreA(result);
    const scoreB = resultScoreB(result);

    clubA.played += 1;
    clubB.played += 1;

    clubA.goalsFor += scoreA;
    clubA.goalsAgainst += scoreB;
    clubB.goalsFor += scoreB;
    clubB.goalsAgainst += scoreA;

    if (scoreA === scoreB) {
      clubA.drawn += 1;
      clubB.drawn += 1;
      clubA.points += 1;
      clubB.points += 1;
    } else if (scoreA > scoreB) {
      clubA.won += 1;
      clubB.lost += 1;
      clubA.points += 3;
    } else {
      clubB.won += 1;
      clubA.lost += 1;
      clubB.points += 3;
    }
  }

  const rows = Array.from(standings.values());

  for (const row of rows) {
    row.goalDifference =
      row.goalsFor - row.goalsAgainst;
  }

  return rows.sort((a, b) => {
    if (b.points !== a.points) {
      return b.points - a.points;
    }

    if (b.goalDifference !== a.goalDifference) {
      return b.goalDifference - a.goalDifference;
    }

    if (b.goalsFor !== a.goalsFor) {
      return b.goalsFor - a.goalsFor;
    }

    return a.name.localeCompare(b.name);
  });
}
