import React, {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebaseConfig.js";
import {
  buildVenueLeagueStandings,
} from "../core/venueLeagueStandings.js";
import { buildPlayerEventStats } from "../core/playerEventStats.js";
import {
  correctVenueRecordedGoal,
  deleteVenueRecordedMatch,
  deleteCurrentEmptyVenueSeason,
} from "../storage/leagueSeasonRepository.js";
import { loadVenueLeaguePlayers } from "../storage/venueLiveMatchRepository.js";
import "./VenueLeagueStatsPage.css";

const TABS = [
  ["teams", "Team Standings"],
  ["results", "Match Results"],
  ["goals", "Top Scorers"],
  ["assists", "Playmakers"],
  ["cleansheets", "Clean Sheets"],
  ["combined", "Summary Player Stats"],
];

function clean(value) {
  return String(value || "").trim();
}

function seasonLabel(season) {
  return clean(
    season?.name ||
    season?.title ||
    season?.label ||
    season?.seasonId ||
    season?.id
  ) || "Current Field season";
}

export default function VenueLeagueStatsPage({
  venue = null,
  season: currentSeason = null,
  clubs = [],
  canCorrectResults = false,
  onBack,
}) {
  const [activeTab, setActiveTab] = useState("teams");
  const [expandedResultId, setExpandedResultId] = useState(null);
  const [goalDraft, setGoalDraft] = useState(null);
  const [savingCorrection, setSavingCorrection] = useState(false);
  const [correctionError, setCorrectionError] = useState("");
  const [viewMode, setViewMode] = useState("season");
  const [seasonMode, setSeasonMode] = useState("current");
  const [archivedSeasons, setArchivedSeasons] = useState([]);
  const [selectedArchiveId, setSelectedArchiveId] = useState("");
  const [deletingEmptySeason, setDeletingEmptySeason] = useState(false);
  const [deleteSeasonError, setDeleteSeasonError] = useState("");

  useEffect(() => {
    if (!venue?.id) {
      setArchivedSeasons([]);
      return undefined;
    }
    return onSnapshot(
      collection(db, "leagueVenues", venue.id, "seasons"),
      (snapshot) => setArchivedSeasons(
        snapshot.docs.map((item) => item.data())
          .filter((item) => item.status === "completed")
          .sort((a, b) => Number(b.endedAtMs || 0) -
            Number(a.endedAtMs || 0))
      ),
      (error) => console.error("[Field archived seasons]", error)
    );
  }, [venue?.id]);

  const selectedArchive = archivedSeasons.find(
    (item) => item.id === selectedArchiveId
  ) || archivedSeasons[0] || null;
  const season = seasonMode === "previous"
    ? selectedArchive : currentSeason;

  const displayClubs = useMemo(() => {
    if (seasonMode !== "previous" || !season) return clubs;
    const ids = new Set([
      ...(season.clubIds || []),
      ...(season.fixtures || []).flatMap((fixture) =>
        [fixture.clubAId, fixture.clubBId].filter(Boolean)
      ),
    ]);
    return [...ids].map((id) => {
      const existing = clubs.find((club) => club.id === id);
      const fixture = (season.fixtures || []).find((item) =>
        item.clubAId === id || item.clubBId === id
      );
      return existing || {
        id,
        name: season.invitations?.[id]?.clubName ||
          (fixture?.clubAId === id
            ? fixture?.clubAName : fixture?.clubBName) || id,
      };
    });
  }, [seasonMode, season, clubs]);

  const results = Array.isArray(season?.results)
    ? season.results
    : [];

  const [clubLogos, setClubLogos] = useState({});
  const [playerNamesByClub, setPlayerNamesByClub] = useState({});

  useEffect(() => {
    let cancelled = false;

    const uniqueClubs = Array.from(
      new Map(
        displayClubs
          .filter((club) => clean(club?.id))
          .map((club) => [clean(club.id), club])
      ).values()
    );

    Promise.all(
      uniqueClubs.map(async (club) => {
        try {
          const snapshot = await getDoc(
            doc(db, "clubs", clean(club.id))
          );

          if (!snapshot.exists()) {
            return [clean(club.id), ""];
          }

          const data = snapshot.data() || {};
          const logoUrl = clean(
            data?.branding?.uploadedLogoUrl ||
            data?.branding?.generatedLogoDataUrl ||
            data?.logoUrl ||
            data?.image ||
            data?.teamPhoto
          );

          return [clean(club.id), logoUrl];
        } catch {
          return [clean(club.id), ""];
        }
      })
    ).then((entries) => {
      if (!cancelled) {
        setClubLogos(Object.fromEntries(entries));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [displayClubs]);

  useEffect(() => {
    let cancelled = false;
    loadVenueLeaguePlayers({ firestore: db, teams: clubs })
      .then((snapshot) => {
        if (cancelled) return;
        const grouped = {};
        snapshot.docs.forEach((player) => {
          const data = player.data() || {};
          if (String(data.status || "active").toLowerCase() !== "active") return;
          const clubId = clean(data.clubId);
          const name = clean(
            data.shortName || data.fullName || data.displayName ||
            data.name || data.playerName
          );
          if (!clubId || !name) return;
          (grouped[clubId] ||= []).push(name);
        });
        setPlayerNamesByClub(Object.fromEntries(
          Object.entries(grouped).map(([id, names]) => [
            id, [...new Set(names)].sort((a, b) => a.localeCompare(b))
          ])
        ));
      })
      .catch((error) => console.error("[Field stats players]", error));
    return () => { cancelled = true; };
  }, [clubs]);

  const visibleResults = useMemo(() => {
    if (viewMode === "season" || seasonMode === "previous") {
      return results;
    }

    const archivedFixtureIds = new Set(
      (season?.matchDayHistory || []).flatMap((day) =>
        (day.results || []).map((result) =>
          String(result.fixtureId || result.id || "")
        )
      )
    );

    return results.filter((result) =>
      result?.status === "completed" &&
      !archivedFixtureIds.has(
        String(result.fixtureId || result.id || "")
      )
    );
  }, [results, season?.matchDayHistory, seasonMode, viewMode]);

  const standings = useMemo(
    () => buildVenueLeagueStandings({
      clubs: displayClubs, results: visibleResults
    }),
    [displayClubs, visibleResults]
  );

  const clubNames = Object.fromEntries(
    displayClubs.map((club) => [club.id, club.name])
  );

  const saveGoalDraft = async (draft = goalDraft) => {
    if (!draft || savingCorrection) return;
    if (draft.action !== "delete" && !clean(draft.scorer)) {
      setCorrectionError("Choose a scorer.");
      return;
    }
    setSavingCorrection(true);
    setCorrectionError("");
    try {
      await correctVenueRecordedGoal({
        venueId: venue.id,
        fixtureId: draft.fixtureId,
        action: draft.action,
        eventId: draft.eventId,
        goal: {
          teamId: draft.teamId,
          scorer: draft.scorer,
          assist: draft.assist,
          timeSeconds: draft.timeSeconds,
        },
      });
      setGoalDraft(null);
    } catch (error) {
      const message = error?.message || "Correction failed.";
      if (draft.action === "delete") window.alert(message);
      else setCorrectionError(message);
    } finally {
      setSavingCorrection(false);
    }
  };

  const playerStats = useMemo(() => {
    const rows = [];
    const events = visibleResults.flatMap((result) =>
      Array.isArray(result.events) ? result.events : []
    );
    const teamIds = new Set(events.map((event) => event.teamId).filter(Boolean));

    for (const teamId of teamIds) {
      rows.push(...buildPlayerEventStats({
        events: events.filter((event) => event.teamId === teamId),
      }).map((player) => ({
        ...player,
        teamId,
        teamName: clubNames[teamId] || teamId,
      })));
    }
    return rows;
  }, [visibleResults, displayClubs]);

  const leaders = [...playerStats]
    .sort((a, b) => b.total - a.total || b.goals - a.goals
      || a.name.localeCompare(b.name));

  const statRows = activeTab === "goals"
    ? [...playerStats].filter((p) => p.goals)
        .sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name))
    : activeTab === "assists"
    ? [...playerStats].filter((p) => p.assists)
        .sort((a, b) => b.assists - a.assists || a.name.localeCompare(b.name))
    : activeTab === "cleansheets"
    ? [...playerStats].filter((p) => p.cleanSheets)
        .sort((a, b) => b.cleanSheets - a.cleanSheets
          || a.name.localeCompare(b.name))
    : leaders.filter((p) => p.total);

  const activeTabLabel =
    TABS.find(([id]) => id === activeTab)?.[1] ||
    "Team Standings";

  return (
    <main className="venue-stats-page">
      <header className="venue-stats-header">
        <h1>Stats &amp; Leaderboards</h1>

        <button
          type="button"
          className="venue-stats-home"
          onClick={onBack}
          aria-label="Return to Field home"
          title="Return to Field home"
        >
          🏠
        </button>
      </header>

      <section className="venue-stats-card">
        <h2>Season</h2>

        <p className="venue-stats-muted">
          <strong>
            {seasonMode === "current"
              ? "Current season"
              : "Previous season"}
          </strong>
          {" • "}
          {viewMode === "season"
            ? "Full season"
            : "Current week"}
          {" • "}
          {seasonLabel(season)}
        </p>

        <div className="venue-stats-segment">
          <button
            type="button"
            className={
              seasonMode === "current" ? "is-active" : ""
            }
            onClick={() => setSeasonMode("current")}
          >
            Current
          </button>

          <button
            type="button"
            className={
              seasonMode === "previous" ? "is-active" : ""
            }
            onClick={() => {
              setSeasonMode("previous");
              setViewMode("season");
            }}
          >
            Previous
          </button>
          {seasonMode === "previous" && archivedSeasons.length > 1 && (
            <select aria-label="Previous Field season"
              value={selectedArchive?.id || ""}
              onChange={(event) => setSelectedArchiveId(event.target.value)}>
              {archivedSeasons.map((item) => (
                <option key={item.id} value={item.id}>
                  {seasonLabel(item)} — {new Date(item.endedAtMs)
                    .toLocaleDateString()}
                </option>
              ))}
            </select>
          )}
        </div>

      {canCorrectResults &&
        seasonMode === "current" &&
        currentSeason?.status === "active" &&
        archivedSeasons.some((item) =>
          item.id === currentSeason.previousSeasonId
        ) &&
        ![
          "clubIds", "fixtures", "results", "allEvents",
          "matchDayHistory", "currentEvents",
        ].some((key) => (currentSeason[key] || []).length > 0) &&
        !Object.keys(currentSeason.invitations || {}).length &&
        !Object.keys(currentSeason.liveMatches || {}).length && (
          <div className="venue-stats-danger-row">
            <button
              type="button"
              className="tk-danger-btn"
              disabled={deletingEmptySeason}
              onClick={async () => {
                if (!window.confirm(
                  "Delete this empty current season and restore the previous season? The Field will return to the previous season."
                )) return;
                setDeletingEmptySeason(true);
                setDeleteSeasonError("");
                try {
                  await deleteCurrentEmptyVenueSeason({
                    venueId: venue.id,
                    seasonId: currentSeason.id,
                  });
                  setSeasonMode("current");
                  setViewMode("season");
                } catch (error) {
                  setDeleteSeasonError(
                    error?.message || "Could not restore the previous season."
                  );
                } finally {
                  setDeletingEmptySeason(false);
                }
              }}
            >
              {deletingEmptySeason
                ? "Restoring previous season…"
                : "Delete current empty season"}
            </button>
            {deleteSeasonError && (
              <p className="error-text" role="alert">
                {deleteSeasonError}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="venue-stats-card">
        <h2>View</h2>

        <div className="venue-stats-segment">
          <button
            type="button"
            className={
              viewMode === "current" ? "is-active" : ""
            }
            onClick={() => setViewMode("current")}
            disabled={seasonMode === "previous"}
          >
            Current week
          </button>

          <button
            type="button"
            className={
              viewMode === "season" ? "is-active" : ""
            }
            onClick={() => setViewMode("season")}
          >
            Full season
          </button>
        </div>

        <nav className="venue-stats-tabs">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={
                activeTab === id ? "is-active" : ""
              }
              onClick={() => setActiveTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      </section>

      <section className="venue-stats-card venue-stats-content">
        <h2>
          {activeTabLabel}
          {activeTab === "teams"
            ? seasonMode === "previous"
              ? " — Previous Season"
              : viewMode === "current"
                ? " — Current Week"
                : " — Current Season"
            : ""}
        </h2>

        <p className="venue-stats-muted">
          {clean(venue?.name) || "Field League"}
          {" • "}
          {seasonLabel(season)}
        </p>

        {activeTab === "teams" ? (
          <div className="venue-table-wrap">
            <table className="venue-standings-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Club</th>
                  <th>Pts</th>
                  <th>P</th>
                  <th>W</th>
                  <th>D</th>
                  <th>L</th>
                  <th>GF</th>
                  <th>GA</th>
                  <th>GD</th>
                </tr>
              </thead>

              <tbody>
                {standings.map((club, index) => (
                  <tr key={club.id}>
                    <td>{index + 1}</td>
                    <td className="venue-club-cell">
                      {(
                        clubLogos[club.id] ||
                        club.logo
                      ) ? (
                        <img
                          src={
                            clubLogos[club.id] ||
                            club.logo
                          }
                          alt={`${club.name} logo`}
                          className="venue-club-logo"
                        />
                      ) : (
                        <span
                          className="venue-club-logo venue-club-logo-fallback"
                          aria-hidden="true"
                        >
                          ⚽
                        </span>
                      )}

                      <strong>{club.name}</strong>
                    </td>
                    <td>{club.points}</td>
                    <td>{club.played}</td>
                    <td>{club.won}</td>
                    <td>{club.drawn}</td>
                    <td>{club.lost}</td>
                    <td>{club.goalsFor}</td>
                    <td>{club.goalsAgainst}</td>
                    <td>{club.goalDifference}</td>
                  </tr>
                ))}

                {standings.length === 0 ? (
                  <tr>
                    <td colSpan="10">
                      No clubs have joined this Field season yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : activeTab === "results" ? (
          <div className="venue-table-wrap venue-match-results">
            <table className="venue-standings-table">
              <thead>
                <tr>
                  <th>Match #</th><th>Club A</th><th>Score</th>
                  <th>Club B</th><th>Result</th>
                </tr>
              </thead>
              <tbody>
                {visibleResults.map((result, index) => {
                  const resultId = result.fixtureId || result.id || String(index);
                  const expanded = expandedResultId === resultId;
                  const goals = (result.events || [])
                    .filter((event) =>
                      String(event?.type || "").toLowerCase() === "goal"
                    )
                    .slice()
                    .sort((a, b) =>
                      Number(a.timeSeconds || 0) - Number(b.timeSeconds || 0)
                    );

                  const clubBadge = (id, fallbackName) => {
                    const name = clubNames[id] || fallbackName || id;
                    const logo = clubLogos[id];
                    return (
                      <span className="venue-result-club-badge" title={name}>
                        {logo ? <img src={logo} alt="" /> : (
                          <span className="venue-result-logo-fallback">⚽</span>
                        )}
                        <span>{name}</span>
                      </span>
                    );
                  };

                  const openGoalEditor = (action, event = null) => {
                    setCorrectionError("");
                    setGoalDraft({
                      action,
                      fixtureId: resultId,
                      eventId: event?.id || "",
                      teamId: event?.teamId || result.teamAId,
                      scorer: event?.scorer || "",
                      assist: event?.assist || "",
                      timeSeconds: Number(event?.timeSeconds) || 0,
                    });
                  };

                  const renderInlineEditor = () => {
                    if (!goalDraft || goalDraft.fixtureId !== resultId) return null;
                    const choices = [...new Set([
                      ...(playerNamesByClub[goalDraft.teamId] || []),
                      goalDraft.scorer,
                      goalDraft.assist,
                    ].filter(Boolean))].sort((a, b) => a.localeCompare(b));
                    return (
                      <div className="tk-admin-panel"
                        onClick={(event) => event.stopPropagation()}>
                        <div className="tk-admin-grid">
                          <div>
                            <label className="tk-small-label">Scorer</label>
                            <select className="tk-small-select" value={goalDraft.scorer}
                              onChange={(event) => setGoalDraft((previous) => ({
                                ...previous,
                                scorer: event.target.value,
                                assist: previous.assist === event.target.value
                                  ? "" : previous.assist,
                              }))}>
                              <option value="">Select player</option>
                              {choices.map((name) => (
                                <option key={name} value={name}>{name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="tk-small-label">Assist</label>
                            <select className="tk-small-select" value={goalDraft.assist}
                              onChange={(event) => setGoalDraft((previous) => ({
                                ...previous, assist: event.target.value,
                              }))}>
                              <option value="">None</option>
                              {choices.filter((name) => name !== goalDraft.scorer)
                                .map((name) => (
                                  <option key={name} value={name}>{name}</option>
                                ))}
                            </select>
                          </div>
                          <div>
                            <label className="tk-small-label">Type</label>
                            <select className="tk-small-select" value="goal" disabled>
                              <option value="goal">goal</option>
                            </select>
                          </div>
                          <div>
                            <label className="tk-small-label">Club</label>
                            <select className="tk-small-select" value={goalDraft.teamId}
                              onChange={(event) => setGoalDraft((previous) => ({
                                ...previous,
                                teamId: event.target.value,
                                scorer: "",
                                assist: "",
                              }))}>
                              <option value={result.teamAId}>
                                {clubNames[result.teamAId] || result.teamAId}
                              </option>
                              <option value={result.teamBId}>
                                {clubNames[result.teamBId] || result.teamBId}
                              </option>
                            </select>
                          </div>
                        </div>
                        {correctionError && (
                          <p className="error-text">{correctionError}</p>
                        )}
                        <div className="tk-inline-actions">
                          <button type="button" className="tk-edit-btn"
                            disabled={savingCorrection || !goalDraft.scorer}
                            onClick={() => saveGoalDraft()}>
                            {savingCorrection ? "Saving…" : "Save event"}
                          </button>
                          <button type="button" className="secondary-btn"
                            disabled={savingCorrection}
                            onClick={() => {
                              setGoalDraft(null);
                              setCorrectionError("");
                            }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    );
                  };

                  const goalLines = (teamId) => (
                    <div className="team-scorers">
                      {goals.filter((event) =>
                        event.teamId === teamId && event.scorer
                      ).map((event, goalIndex) => {
                        const shortName = (name) =>
                          String(name || "").trim().split(/\s+/)[0] || "Unknown";
                        const minute = `${Math.floor(
                          Math.max(0, Number(event.timeSeconds) || 0) / 60
                        )}'`;
                        return (
                          <div key={event.id || goalIndex} className="scorer-line">
                            <div className="tk-event-line">
                              <div className="tk-event-line-text tk-expanded-goal-line">
                                <span className="tk-expanded-scorer">
                                  <span className="tk-expanded-goal-minute">
                                    {minute}
                                  </span>
                                  {shortName(event.scorer)}
                                </span>
                                {event.assist && (
                                  <span className="tk-expanded-assist">
                                    assist: {shortName(event.assist)}
                                  </span>
                                )}
                              </div>
                              {canCorrectResults && seasonMode === "current" && (
                                <span className="tk-mini-admin-actions">
                                  <button type="button" className="tk-mini-admin-btn"
                                    title="Edit goal" aria-label="Edit goal"
                                    onClick={() => openGoalEditor("edit", event)}>✎</button>
                                  <button type="button" className="tk-mini-admin-btn danger"
                                    title="Delete goal" aria-label="Delete goal"
                                    onClick={() => {
                                      if (!window.confirm(
                                        "Delete this recorded goal and recalculate the match score?"
                                      )) return;
                                      saveGoalDraft({
                                        action: "delete",
                                        fixtureId: resultId,
                                        eventId: event.id,
                                        teamId: event.teamId,
                                        scorer: event.scorer,
                                        assist: event.assist,
                                        timeSeconds: event.timeSeconds,
                                      });
                                    }}>×</button>
                                </span>
                              )}
                            </div>
                            {goalDraft?.action === "edit" &&
                              goalDraft.fixtureId === resultId &&
                              String(goalDraft.eventId) === String(event.id) &&
                              renderInlineEditor()}
                          </div>
                        );
                      })}
                    </div>
                  );

                  const winnerId = result.winnerId ||
                    (Number(result.goalsA) === Number(result.goalsB)
                      ? null
                      : Number(result.goalsA) > Number(result.goalsB)
                        ? result.teamAId : result.teamBId);
                  const resultText = winnerId
                    ? `${clubNames[winnerId] || winnerId} won`
                    : "Draw";
                  const toggle = () =>
                    setExpandedResultId(expanded ? null : resultId);

                  return (
                    <React.Fragment key={resultId}>
                      <tr
                        className={expanded ? "match-row expanded" : "match-row"}
                        onClick={toggle}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggle();
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        aria-expanded={expanded}
                      >
                        <td className="tk-match-no-cell">
                          <div className="tk-match-no-inner">
                            <span className="match-toggle-indicator">
                              {expanded ? "▾" : "▸"}
                            </span>
                            <span className="tk-match-no-main">
                              {result.matchNo || index + 1}
                            </span>
                          </div>
                        </td>
                        <td>{clubBadge(result.teamAId, result.teamAName)}</td>
                        <td>{result.goalsA} – {result.goalsB}</td>
                        <td>{clubBadge(result.teamBId, result.teamBName)}</td>
                        <td>{resultText}</td>
                      </tr>
                      {expanded && (
                        <tr className="match-details-row">
                          <td />
                          <td>{goals.length ? goalLines(result.teamAId)
                            : "No goal or assist breakdown recorded."}</td>
                          <td />
                          <td>{goalLines(result.teamBId)}</td>
                          <td>
                            {canCorrectResults && seasonMode === "current" && (
                              <div className="tk-match-admin-box">
                                <div className="tk-match-admin-label">ADMIN TOOLS</div>
                                <div className="tk-match-admin-row">
                                  <button type="button" className="tk-admin-compact-btn primary"
                                    onClick={() => openGoalEditor("add")}>
                                    + Goal
                                  </button>
                                  <button type="button" className="tk-admin-compact-btn danger"
                                    onClick={async () => {
                                      const ok = window.confirm(
                                        `Delete saved match #${result.matchNo}?\n\n` +
                                        "This will remove the match result and all linked scorer/assist events for that match."
                                      );
                                      if (!ok) return;
                                      try {
                                        await deleteVenueRecordedMatch({
                                          venueId: venue.id,
                                          fixtureId: resultId,
                                        });
                                        setExpandedResultId(null);
                                        setGoalDraft(null);
                                      } catch (error) {
                                        window.alert(error?.message || "Could not delete the match.");
                                      }
                                    }}>
                                    Delete match
                                  </button>
                                </div>
                                {goalDraft?.action === "add" &&
                                  goalDraft.fixtureId === resultId &&
                                  renderInlineEditor()}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {!visibleResults.length && (
                  <tr><td colSpan="5">No completed matches in this view.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="venue-table-wrap">
            <table className="venue-standings-table">
              <thead>
                <tr>
                  <th>#</th><th>Player</th><th>Club</th>
                  {activeTab === "combined" ? (
                    <>
                      <th>Goals</th><th>Assists</th><th>Clean sheets</th><th>Total</th>
                    </>
                  ) : (
                    <th>{activeTab === "goals" ? "Goals"
                      : activeTab === "assists" ? "Assists" : "Clean sheets"}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {statRows.map((player, index) => (
                  <tr key={`${player.teamId}:${player.name}`}>
                    <td>{index + 1}</td>
                    <td>{player.displayName || player.name}</td>
                    <td>{player.teamName}</td>
                    {activeTab === "combined" ? (
                      <>
                        <td>{player.goals}</td><td>{player.assists}</td>
                        <td>{player.cleanSheets}</td><td>{player.total}</td>
                      </>
                    ) : (
                      <td>{activeTab === "goals" ? player.goals
                        : activeTab === "assists" ? player.assists
                        : player.cleanSheets}</td>
                    )}
                  </tr>
                ))}
                {!statRows.length && (
                  <tr>
                    <td colSpan={activeTab === "combined" ? 7 : 4}>
                      No recorded player stats in this view.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

    </main>
  );
}
