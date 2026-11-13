import {boothRequest} from "../storage/fieldBoothJournal.js";
import {getPlayerPhotosCollection} from '../core/clubFirestorePaths.js';
import {indexPlayerPortraits,resolvePlayerPortrait} from '../core/playerPortrait.mjs';
import PlayerTableIdentity from '../components/PlayerTableIdentity.jsx';
import PremiumSelect from "../components/PremiumSelect.jsx";
import {fieldMatchStatEvents} from "../core/fieldDefensiveStats.mjs";
import {fieldConfirm,fieldAlert,fieldPrompt} from '../components/FieldDialog.jsx';
import "./VenueStatsToggles.css";
import {
  normalizeVenueLeagueScope,
  createOfficialVenueLeagueScope,
  venueLeagueRootPath,
} from "../core/venueLeaguePaths.js";
import React, {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebaseConfig.js";
import {
  buildVenueLeagueStandings,
} from "../core/venueLeagueStandings.js";
import { buildPlayerEventStats } from "../core/playerEventStats.js";
import {
  deleteVenueRecordedMatch,
  deleteCurrentEmptyVenueSeason,
} from "../storage/leagueSeasonRepository.js";
import { loadVenueLeaguePlayers } from "../storage/venueLiveMatchRepository.js";
import "./VenueLeagueStatsPage.css";

const RESULT_EVENTS = {
  goal: ["⚽", "Goal"], yellow_card: ["🟨", "Yellow card"],
  red_card: ["🟥", "Red card"], injury_knock: ["🩹", "Playing with a knock"],
  injury_sitting_out: ["🤕", "Sitting out injured"], injury_recovered: ["🩹", "Recovered"],
};

const TABS = [
  ["teams", "Team Standings"],
  ["results", "Match Results"],
  ["goals", "Top Scorers"],
  ["assists", "Playmakers"],
  ["defensiveBlocks", "5-min defensive blocks"],
  ["cleansheets", "Clean Sheets"],
  ["combined", "Summary Player Stats"],
];

function clean(value) {
  return String(value || "").trim();
}

function compactPlayerName(value) {
  const parts = clean(value)
    .replace(/\\s+/g, " ")
    .split(" ")
    .filter(Boolean);

  if (parts.length < 2) {
    return parts[0] || "Player";
  }

  return `${parts[0]} ${parts.at(-1).charAt(0).toUpperCase()}.`;
}

function compactClubName(value) {
  return clean(value).replace(/\s+/g, "").slice(0, 4) || "Club";
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
  scope = null,
  season: currentSeason = null,
  clubs = [],
  canCorrectResults = false,
  canReverseResults = canCorrectResults,
  refereeUid = "",
  onBack,
}) {
  const resolvedScope = scope
    ? normalizeVenueLeagueScope(scope)
    : venue?.id
      ? createOfficialVenueLeagueScope({venueId: venue.id})
      : null;
  if (resolvedScope && resolvedScope.venueId !== venue?.id) {
    throw new Error("Stats session does not belong to this Field.");
  }
  const dataRoot = resolvedScope
    ? venueLeagueRootPath(resolvedScope) : "";
  const isPractice = resolvedScope?.environment === "practice";
  const requireOfficialWrite = () => {
    if (!canCorrectResults && !refereeUid) throw new Error("Only authorized Field staff may correct results.");
    if (isPractice) {
      throw new Error(
        "This correction needs its sandbox adapter. Official data was not changed."
      );
    }
  };

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
      collection(db, `${dataRoot}/seasons`),
      (snapshot) => setArchivedSeasons(
        snapshot.docs.map((item) => item.data())
          .filter((item) => item.status === "completed")
          .sort((a, b) => Number(b.endedAtMs || 0) -
            Number(a.endedAtMs || 0))
      ),
      (error) => console.error("[Field archived seasons]", error)
    );
  }, [venue?.id, dataRoot]);

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
  const [playerProfiles,setPlayerProfiles]=useState([]);
  const [playerPhotos,setPlayerPhotos]=useState({});
  const photoClubIds=clubs.map(club=>club.id||club.clubId).filter(Boolean).sort().join('|');
  useEffect(()=>{let cancelled=false;setPlayerPhotos({});
    if(isPractice)return;
    Promise.all(photoClubIds.split('|').filter(Boolean).map(async id=>{
      try{const snapshot=await getDocs(getPlayerPhotosCollection(db,id));return [id,indexPlayerPortraits(snapshot.docs.map(doc=>({id:doc.id,data:doc.data()})))];}catch{return [id,{}];}
    })).then(entries=>{if(!cancelled)setPlayerPhotos(Object.fromEntries(entries));});
    return()=>{cancelled=true;};
  },[photoClubIds,isPractice]);

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
            isPractice
              ? doc(db, `${dataRoot}/clubs/${clean(club.id)}`)
              : doc(db, "clubs", clean(club.id))
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
  }, [displayClubs, dataRoot, isPractice]);

  useEffect(() => {
    let cancelled = false;
    const rosterRequest = isPractice
      ? getDocs(collection(db, `${dataRoot}/clubs`)).then(snapshot => ({
          docs: snapshot.docs.flatMap(club =>
            (club.data().players || []).map(player => ({
              data: () => ({...player, clubId: club.id}),
            }))
          ),
        }))
      : loadVenueLeaguePlayers({ firestore: db, teams: clubs });
    rosterRequest
      .then((snapshot) => {
        if (cancelled) return;
        setPlayerProfiles(snapshot.docs.map(doc=>({id:doc.id,...doc.data()})));
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
  }, [clubs, dataRoot, isPractice]);

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
      setCorrectionError("Choose a player.");
      return;
    }
    setSavingCorrection(true);
    setCorrectionError("");
    try {
      requireOfficialWrite();
      await boothRequest({...resolvedScope, seasonId: currentSeason.id}, "correctResultEvent", {
        fixtureId: draft.fixtureId,
        action: draft.action,
        eventId: draft.eventId,
        event: {
          type: draft.type,
          teamId: draft.teamId,
          playerName: draft.scorer,
          assist: draft.assist,
          timeSeconds: draft.timeSeconds,
        },
      });
      setGoalDraft(null);
    } catch (error) {
      const message = error?.message || "Correction failed.";
      if (draft.action === "delete") (await fieldAlert(message));
      else setCorrectionError(message);
    } finally {
      setSavingCorrection(false);
    }
  };

  const playerStats = useMemo(() => {
    const rows = [];
    const events = visibleResults.flatMap((result) =>
      fieldMatchStatEvents({...result,gameFormat:result.gameFormat||season?.gameFormat})
    );
    const teamIds = new Set(events.map((event) => event.teamId).filter(Boolean));

    for (const teamId of teamIds) {
      rows.push(...buildPlayerEventStats({
        events: events.filter((event) => event.teamId === teamId),
      }).map((player) => ({
        ...player,
        total: Number(player.goals||0)+Number(player.assists||0)+Number(player.defensiveBlocks||0),
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
    : activeTab === "defensiveBlocks"
    ? [...playerStats].filter(p=>p.defensiveBlocks).sort((a,b)=>b.defensiveBlocks-a.defensiveBlocks||a.name.localeCompare(b.name))
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


      <section className="venue-stats-card card">
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

        <div className="venue-stats-segment segmented-toggle">
          <button
            type="button"
            className={
              seasonMode === "current" ? "segmented-option active" : "segmented-option"
            }
            onClick={() => setSeasonMode("current")}
          >
            Current
          </button>

          <button
            type="button"
            className={
              seasonMode === "previous" ? "segmented-option active" : "segmented-option"
            }
            onClick={() => {
              setSeasonMode("previous");
              setViewMode("season");
            }}
          >
            Previous
          </button>

        </div>
          {seasonMode === "previous" && archivedSeasons.length > 0 && (
            <div className="field-stats-season-picker"><label>Choose a previous season</label><PremiumSelect aria-label="Previous Field season"
              value={selectedArchive?.id || ""}
              onChange={(event) => setSelectedArchiveId(event.target.value)}>
              {archivedSeasons.map((item) => (
                <option key={item.id} value={item.id}>
                  {seasonLabel(item)} — {new Date(item.endedAtMs)
                    .toLocaleDateString()}
                </option>
              ))}
            </PremiumSelect></div>
          )}

      {canReverseResults &&
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
                if (!(await fieldConfirm("Delete this empty current season and restore the previous season? The Field will return to the previous season."
                ))) return;
                setDeletingEmptySeason(true);
                setDeleteSeasonError("");
                try {
                  requireOfficialWrite();
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

      <section className="venue-stats-card card">
        <h2>View</h2>

        <div className="venue-stats-segment segmented-toggle">
          <button
            type="button"
            className={
              viewMode === "current" ? "segmented-option active" : "segmented-option"
            }
            onClick={() => setViewMode("current")}
            disabled={seasonMode === "previous"}
          >
            Current week
          </button>

          <button
            type="button"
            className={
              viewMode === "season" ? "segmented-option active" : "segmented-option"
            }
            onClick={() => setViewMode("season")}
          >
            Full season
          </button>
        </div>

        <nav className="venue-stats-tabs actions-row stats-tabs">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={
                activeTab === id ? "secondary-btn active" : "secondary-btn"
              }
              aria-current={activeTab === id ? "page" : undefined}
              data-practice-guide={id === "results" ? "field-stats-review" : undefined}
              onClick={() => setActiveTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      </section>

      <section className="venue-stats-card card venue-stats-content">
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
          <div className="venue-table-wrap table-wrapper tk-scroll-table-wrapper tk-team-identity-table">
            <table className="venue-standings-table stats-table">
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
                    <td><span className="venue-club-cell" title={club.name}>
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

                      <strong>{club.name}</strong></span>
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
          <div className="venue-table-wrap venue-match-results table-wrapper tk-scroll-table-wrapper tk-match-results-table">
            <table className="venue-standings-table stats-table">
              <thead>
                <tr>
                  <th>Match · Club A</th><th>Score</th>
                  <th>Club B</th>
                </tr>
              </thead>
              <tbody>
                {visibleResults.map((result, index) => {
                  const resultId = result.fixtureId || result.id || String(index);
                  const expanded = expandedResultId === resultId;
                  const canEditEvents = !isPractice && seasonMode === "current" && result.status === "completed" &&
                    (canCorrectResults || Boolean(refereeUid && result.completedByUid === refereeUid));
                  const matchEvents = (result.events || [])
                    .filter(event => Object.hasOwn(RESULT_EVENTS, event?.type))
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
                        <span className="result-full-club-name">{name}</span>
                      </span>
                    );
                  };

                  const openGoalEditor = (action, event = null) => {
                    if (!canEditEvents) return;
                    setCorrectionError("");
                    setGoalDraft({
                      action,
                      fixtureId: resultId,
                      eventId: event?.id || "",
                      teamId: event?.teamId || result.teamAId,
                      type: event?.type || "goal",
                      scorer: event?.scorer || event?.playerName || "",
                      assist: event?.assist || "",
                      timeSeconds: Number(event?.timeSeconds) || 0,
                    });
                  };

                  const renderInlineEditor = () => {
                    if (!canEditEvents || !goalDraft || goalDraft.fixtureId !== resultId) return null;
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
                            <label className="tk-small-label">{goalDraft.type === "goal" ? "Scorer" : "Player"}</label>
                            <PremiumSelect className="tk-small-select" value={goalDraft.scorer}
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
                            </PremiumSelect>
                          </div>
                          {goalDraft.type === "goal" && <div>
                            <label className="tk-small-label">Assist</label>
                            <PremiumSelect className="tk-small-select" value={goalDraft.assist}
                              onChange={(event) => setGoalDraft((previous) => ({
                                ...previous, assist: event.target.value,
                              }))}>
                              <option value="">None</option>
                              {choices.filter((name) => name !== goalDraft.scorer)
                                .map((name) => (
                                  <option key={name} value={name}>{name}</option>
                                ))}
                            </PremiumSelect>
                          </div>}
                          {goalDraft.action === "add" && <div>
                            <label className="tk-small-label">Type</label>
                            <PremiumSelect className="tk-small-select" aria-label="Event type" value={goalDraft.type}
                              onChange={event => setGoalDraft(previous => ({...previous, type: event.target.value, assist: ""}))}>
                              {Object.entries(RESULT_EVENTS).map(([type, [icon, label]]) =>
                                <option key={type} value={type}>{icon} {label}</option>)}
                            </PremiumSelect>
                          </div>}
                          {(goalDraft.type === "goal" || goalDraft.action === "add") && <div>
                            <label className="tk-small-label">Club</label>
                            <PremiumSelect className="tk-small-select" value={goalDraft.teamId}
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
                            </PremiumSelect>
                          </div>}
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

                  const eventLines = (teamId) => (
                    <div className="team-scorers">
                      {matchEvents.filter((event) =>
                        event.teamId === teamId && (event.scorer || event.playerName)
                      ).map((event, goalIndex) => {
                        const playerLabel = (name) =>
                          String(name || "").trim().replace(/\s+/g," ") || "Unknown";
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
                                  <span className="field-result-event-icon" role="img" aria-label={RESULT_EVENTS[event.type][1]}
                                    title={RESULT_EVENTS[event.type][1]}>{RESULT_EVENTS[event.type][0]}</span>
                                  {playerLabel(event.scorer || event.playerName)}
                                </span>
                                {event.type === "goal" && event.assist && (
                                  <span className="tk-expanded-assist">
                                    assist: {playerLabel(event.assist)}
                                  </span>
                                )}
                              </div>
                              {canEditEvents && event.id != null && (
                                <span className="tk-mini-admin-actions">
                                  <button type="button" className="tk-mini-admin-btn"
                                    title="Edit event" aria-label={`Edit ${RESULT_EVENTS[event.type][1].toLowerCase()}`}
                                    onClick={() => openGoalEditor("edit", event)}>✎</button>
                                  <button type="button" className="tk-mini-admin-btn danger"
                                    title="Delete event" aria-label={`Delete ${RESULT_EVENTS[event.type][1].toLowerCase()}`}
                                    onClick={async () => {
                                      if (!(await fieldConfirm(event.type === "goal" ? "Delete this recorded goal and adjust the score?" : "Delete this recorded event?"
                                      ))) return;
                                      saveGoalDraft({
                                        action: "delete",
                                        fixtureId: resultId,
                                        eventId: event.id,
                                        teamId: event.teamId,
                                        type: event.type,
                                        scorer: event.scorer || event.playerName,
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
                        <td><div className="fanm-result-home"><span className="fanm-result-number">{expanded?'▾':'▸'} {result.matchNo||index+1}</span>{clubBadge(result.teamAId,result.teamAName)}</div></td>
                        <td>{result.goalsA} – {result.goalsB}</td>
                        <td>{clubBadge(result.teamBId, result.teamBName)}</td>

                      </tr>
                      {expanded && (
                        <tr className="match-details-row"><td colSpan="3"><div className="field-result-events"><section aria-label={clubNames[result.teamAId]||result.teamAName}>{matchEvents.length ? eventLines(result.teamAId) : "No match events recorded."}</section><section aria-label={clubNames[result.teamBId]||result.teamBName}>{eventLines(result.teamBId)}</section></div>
                            {canEditEvents && (
                              <div className="tk-match-admin-box">
                                <div className="tk-match-admin-label">MATCH TOOLS</div>
                                <div className="tk-match-admin-row">
                                  <button type="button" className="tk-admin-compact-btn primary"
                                    onClick={() => openGoalEditor("add")}>
                                    + Event
                                  </button>
                                  {canReverseResults && <button type="button" className="tk-admin-compact-btn danger"
                                    onClick={async () => {
                                      const ok = (await fieldConfirm(`Delete saved match #${result.matchNo}?\n\n` +
                                        "This removes the result and its linked events, and makes this fixture available to replay."
                                      ));
                                      if (!ok) return;
                                      const reason=await fieldPrompt("Why is this official result being reversed? (For example, practice recorded as official.)");
                                      if(!reason||reason.trim().length<5)return;
                                      try {
                                        requireOfficialWrite();
      await deleteVenueRecordedMatch({
                                          venueId: venue.id,
                                          fixtureId: resultId, seasonId: season.id, reason: reason.trim(),
                                        });
                                        setExpandedResultId(null);
                                        setGoalDraft(null);
                                      } catch (error) {
                                        (await fieldAlert(error?.message || "Could not delete the match."));
                                      }
                                    }}>
                                    Reverse official match
                                  </button>}
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
                  <tr><td colSpan="3">No completed matches in this view.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div
            className={`venue-table-wrap table-wrapper tk-scroll-table-wrapper tk-player-identity-table ${
              activeTab === "combined"
                ? "tk-player-summary-table"
                : "tk-player-small-table"
            }`}
            style={{
              "--venue-number-columns": activeTab === "combined" ? 5 : 1,
              "--venue-number-width": `${Math.max(7,...statRows.flatMap(player=>[player.goals,player.assists,player.defensiveBlocks,player.cleanSheets,player.total].map(value=>String(value??0).length)))+1}ch`,
              "--venue-player-club-width": activeTab === "combined" ? "2.7rem" : "4.8rem",

            }}
          >
            <table className="venue-standings-table stats-table fanm-player-stats-table"><colgroup><col className="stat-rank-col"/><col className="stat-player-col"/>{activeTab!=="combined"&&<col className="stat-club-col"/>}{Array.from({length:activeTab==="combined"?5:1},(_,index)=><col key={index} className="stat-number-col"/>)}</colgroup>
              <thead>
                <tr>
                  <th>#</th><th>Player</th>{activeTab!=="combined"&&<th>Club</th>}
                  {activeTab === "combined" ? (
                    <>
                      <th>Goals</th><th>Assists</th><th>5-min DB</th><th title="Clean sheets">CS</th><th>Total</th>
                    </>
                  ) : (
                    <th>{activeTab === "goals" ? "Goals"
                      : activeTab === "assists" ? "Assists" : activeTab === "defensiveBlocks" ? "5-min DB" : "CS"}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {statRows.map((player, index) => (
                  <tr key={`${player.teamId}:${player.name}`}>
                    <td>{index + 1}</td>
                    <td
                      className="venue-player-name-cell"
                      title={player.displayName || player.name}
                    >
                      <div className="fanm-player-cell"><PlayerTableIdentity name={player.displayName||player.name} label={compactPlayerName(player.displayName||player.name)} image={resolvePlayerPortrait(player.name,playerProfiles.filter(profile=>profile.clubId===player.teamId),playerPhotos[player.teamId]||{})}/>
                      {activeTab==="combined"&&<span className="summary-player-club" title={player.teamName}>{clubLogos[player.teamId]?<img src={clubLogos[player.teamId]} alt={player.teamName}/>:<span role="img" aria-label={player.teamName}>⚽</span>}</span>}</div>
                    </td>

                    {activeTab!=="combined"&&<td
                      className="venue-player-club-logo-cell"
                      title={player.teamName}
                      aria-label={player.teamName}
                    >
                      <span className="venue-player-club-identity">
                        {clubLogos[player.teamId] ? (
                          <img
                            src={clubLogos[player.teamId]}
                            alt={`${player.teamName} logo`}
                            className="venue-club-logo"
                          />
                        ) : (
                          <span
                            className="venue-club-logo venue-club-logo-fallback"
                            role="img"
                            aria-label={`${player.teamName} logo unavailable`}
                          >
                            ⚽
                          </span>
                        )}

                        <span className={`venue-player-club-short-name${activeTab === "combined" ? " is-logo-only" : ""}`}>
                          <span className="stats-mobile-name">{compactClubName(player.teamName)}</span><span className="stats-desktop-name">{player.teamName}</span>
                        </span>
                      </span>
                    </td>}
                    {activeTab === "combined" ? (
                      <>
                        <td>{player.goals}</td><td>{player.assists}</td>
                        <td>{player.defensiveBlocks}</td><td>{player.cleanSheets}</td><td>{player.total}</td>
                      </>
                    ) : (
                      <td>{activeTab === "goals" ? player.goals
                        : activeTab === "assists" ? player.assists
                        : activeTab === "defensiveBlocks" ? player.defensiveBlocks : player.cleanSheets}</td>
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
