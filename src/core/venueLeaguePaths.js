export const VENUE_LEAGUE_SCOPE_KIND = "venueLeague";

export const VENUE_LEAGUE_ENVIRONMENT = Object.freeze({
  OFFICIAL: "official",
  PRACTICE: "practice",
});

function requiredSegment(value, label) {
  const cleaned = String(value || "").trim();

  if (!cleaned) {
    throw new Error(`Venue League ${label} is required.`);
  }

  if (cleaned.includes("/")) {
    throw new Error(`Venue League ${label} cannot contain "/".`);
  }

  return cleaned;
}

export function createOfficialVenueLeagueScope({
  venueId,
  seasonId = "",
} = {}) {
  return {
    kind: VENUE_LEAGUE_SCOPE_KIND,
    environment: VENUE_LEAGUE_ENVIRONMENT.OFFICIAL,
    venueId: requiredSegment(venueId, "venueId"),
    seasonId: seasonId
      ? requiredSegment(seasonId, "seasonId")
      : "",
    practiceSessionId: "",
  };
}

export function createPracticeVenueLeagueScope({
  venueId,
  practiceSessionId,
  seasonId = "",
} = {}) {
  return {
    kind: VENUE_LEAGUE_SCOPE_KIND,
    environment: VENUE_LEAGUE_ENVIRONMENT.PRACTICE,
    venueId: requiredSegment(venueId, "venueId"),
    seasonId: seasonId
      ? requiredSegment(seasonId, "seasonId")
      : "",
    practiceSessionId: requiredSegment(
      practiceSessionId,
      "practiceSessionId"
    ),
  };
}

export function normalizeVenueLeagueScope(
  scope,
  { requireSeason = false } = {}
) {
  if (!scope || scope.kind !== VENUE_LEAGUE_SCOPE_KIND) {
    throw new Error(
      "Explicit Venue League scope required. Club scopes are not accepted."
    );
  }

  let normalized;

  if (
    scope.environment ===
    VENUE_LEAGUE_ENVIRONMENT.OFFICIAL
  ) {
    normalized = createOfficialVenueLeagueScope(scope);
  } else if (
    scope.environment ===
    VENUE_LEAGUE_ENVIRONMENT.PRACTICE
  ) {
    normalized = createPracticeVenueLeagueScope(scope);
  } else {
    throw new Error(
      "Venue League environment must be explicitly official or practice."
    );
  }

  if (requireSeason && !normalized.seasonId) {
    throw new Error("Venue League seasonId is required.");
  }

  return normalized;
}

export function venueLeagueRootPath(scope) {
  const normalized = normalizeVenueLeagueScope(scope);

  if (
    normalized.environment ===
    VENUE_LEAGUE_ENVIRONMENT.PRACTICE
  ) {
    return [
      "sandboxes",
      "practice",
      "leagueVenues",
      normalized.venueId,
      "sessions",
      normalized.practiceSessionId,
    ].join("/");
  }

  return `leagueVenues/${normalized.venueId}`;
}

export function venueLeagueSeasonPath(scope) {
  const normalized = normalizeVenueLeagueScope(
    scope,
    { requireSeason: true }
  );

  return [
    venueLeagueRootPath(normalized),
    "seasons",
    normalized.seasonId,
  ].join("/");
}

export function venueLeagueCollectionPath(
  collectionName,
  scope
) {
  return [
    venueLeagueRootPath(scope),
    requiredSegment(collectionName, "collection name"),
  ].join("/");
}

export function venueLeagueDocPath(
  collectionName,
  documentId,
  scope
) {
  return [
    venueLeagueCollectionPath(collectionName, scope),
    requiredSegment(documentId, "document ID"),
  ].join("/");
}

export function venueLeagueSeasonCollectionPath(
  collectionName,
  scope
) {
  return [
    venueLeagueSeasonPath(scope),
    requiredSegment(collectionName, "collection name"),
  ].join("/");
}

export function venueLeagueSeasonDocPath(
  collectionName,
  documentId,
  scope
) {
  return [
    venueLeagueSeasonCollectionPath(
      collectionName,
      scope
    ),
    requiredSegment(documentId, "document ID"),
  ].join("/");
}

export function assertVenueLeaguePathInScope(
  path,
  scope
) {
  const normalized = normalizeVenueLeagueScope(scope);
  const expectedRoot = `${venueLeagueRootPath(normalized)}/`;
  const candidate = String(path || "").trim();

  if (
    candidate !== venueLeagueRootPath(normalized) &&
    !candidate.startsWith(expectedRoot)
  ) {
    throw new Error(
      "Firestore path escaped its Venue League scope."
    );
  }

  if (
    normalized.environment ===
      VENUE_LEAGUE_ENVIRONMENT.OFFICIAL &&
    candidate.startsWith("sandboxes/")
  ) {
    throw new Error(
      "Official Venue League path entered Practice."
    );
  }

  if (
    normalized.environment ===
      VENUE_LEAGUE_ENVIRONMENT.PRACTICE &&
    !candidate.startsWith(
      "sandboxes/practice/leagueVenues/"
    )
  ) {
    throw new Error(
      "Practice Venue League path escaped its sandbox."
    );
  }

  return candidate;
}
