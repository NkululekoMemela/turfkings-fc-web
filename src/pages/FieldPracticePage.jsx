import {buildFieldClubTeam} from "../core/fieldClubTeam.js";
import {resolveFieldUpcomingMatch} from "../core/fieldUpcomingMatch.js";
import FieldMatchDaySchedule from "../components/FieldMatchDaySchedule.jsx";
import FieldDecisionReview from "../components/FieldDecisionReview.jsx";
import {
  chooseVenueFixturePairing,
} from "../storage/leagueSeasonRepository.js";
import FieldPracticeEndMatchDay from "../components/FieldPracticeEndMatchDay.jsx";
import FieldPracticeStartupSplash from "../components/FieldPracticeStartupSplash.jsx";
import VenueLiveMatchRuntime from "../components/VenueLiveMatchRuntime.jsx";
import {startPracticeFixture} from "../storage/fieldPracticeMatchRepository.js";
import {
  getVenueRefereeDeviceId, buildVenueRefereeController,
} from "../core/venueRefereeController.js";
import React, {useEffect, useMemo, useState} from "react";
import {
  collection, doc, onSnapshot, runTransaction,
} from "firebase/firestore";
import {auth, db} from "../firebaseConfig.js";
import FieldPracticeTimer from "../components/FieldPracticeTimer.jsx";
import FieldBottomNav from "../components/FieldBottomNav.jsx";
import {
  FieldSeasonStartModal, FieldSeasonEndModal,
} from "../components/FieldSeasonInvitations.jsx";
import {
  fieldSeasonNeedsAnnouncement,
} from "../storage/fieldSeasonInvitationRepository.js";
import VenueLandingPage from "./VenueLandingPage.jsx";
import VenueFixturesPage from "./VenueFixturesPage.jsx";
import VenueSquadsPage from "./VenueSquadsPage.jsx";
import VenueLeagueFormationsPage from "./VenueLeagueFormationsPage.jsx";
import VenueLeagueStatsPage from "./VenueLeagueStatsPage.jsx";
import {fieldPracticeRequest} from "../storage/fieldPracticeGateway.js";
import {
  createPracticeVenueLeagueScope, venueLeagueRootPath,
} from "../core/venueLeaguePaths.js";
import {buildFieldLeagueSchedule} from "../core/fieldLeagueSchedule.js";

function subscribeFieldPracticeWorkspace(root, onRoot, onClubs, onError) {
  const stops = [
    onSnapshot(doc(db, root), snap => onRoot(snap.data() || null), onError),
    onSnapshot(collection(db, `${root}/clubs`),
      snap => onClubs(snap.docs.map(item => ({
        ...item.data(), clubId: item.id,
      }))), onError),
  ];
  return () => stops.forEach(stop => stop());
}

async function preparePracticeSchedule(scope, copies) {
  if (scope.environment !== "practice") {
    throw new Error("Field Practice scope required.");
  }
  const root = venueLeagueRootPath(scope);
  const rootRef = doc(db, root);
  return runTransaction(db, async tx => {
    const snapshot = await tx.get(rootRef);
    const season = snapshot.data()?.league?.activeSeason;
    if (!season || season.id !== scope.seasonId) {
      throw new Error("Start this Practice season first.");
    }
    if (season.fixtures?.length) return;
    const accepted = copies.filter(club =>
      season.invitations?.[club.clubId]?.status === "accepted"
    );
    if (accepted.length < Number(season.minimumClubs || 3)) {
      throw new Error("Not enough sandbox Clubs accepted the invitation.");
    }
    const schedule = buildFieldLeagueSchedule({
      seasonId: season.id,
      clubs: new Map(accepted.map(club => [club.clubId, club.name])),
      startsOn: season.startsOn,
      ...season.scheduleSettings,
    });
    const next = {
      ...season, ...schedule,
      schedulePublishedAtMs: Date.now(),
      registrationOpen: false,
      currentMatchNo: 0,
    };

    // Only the sandbox Club copies are used here.
    for (const day of schedule.matchDays) {
      for (const fixture of schedule.fixtures.filter(
        item => item.matchDayId === day.id
      )) {
        for (const clubId of [fixture.clubAId, fixture.clubBId]) {
          const club = accepted.find(item => item.clubId === clubId);
          const players = (club.players || []).slice(0, 6);
          const confirmed = players.length >= 5 &&
            players.every(p => p.memberId && p.sourcePlayerId && p.fullName) &&
            new Set(players.map(p => p.memberId)).size === players.length;
          const fingerprint = JSON.stringify([
            sessionIdentity(scope), day.id, fixture.id, players,
          ]);
          tx.set(doc(db,
            `${root}/seasons/${season.id}/fieldMatchDayManifests/${day.id}/clubs/${clubId}`
          ), {
            version: 1, environment: "practice", simulated: true,
            venueId: scope.venueId, seasonId: season.id,
            practiceSessionId: scope.practiceSessionId,
            clubId, name: club.name, logoUrl: club.logoUrl || "",
            matchDayId: day.id, fixtureId: fixture.id,
            dateLocal: day.dateLocal,
            scheduledLocal: fixture.scheduledLocal || "",
            players, selectedMemberIds: players.map(p => p.memberId),
            confirmed, fingerprint, submittedAtMs: Date.now(),
            submittedByUid: auth.currentUser.uid,
          });
        }
      }
    }
    tx.update(rootRef, {"league.activeSeason": next});
    tx.set(doc(db, `${root}/seasons/${season.id}`), next);
  });
}

function sessionIdentity(scope) {
  return `${scope.venueId}:${scope.practiceSessionId}:${scope.seasonId}`;
}

export default function FieldPracticePage({venue, session, onExit, onPageChange, fieldNavTarget}) {
  const [data, setData] = useState(null);
  const [clubs, setClubs] = useState([]);
  const [page, setPage] = useState("landing");
  const [showStart, setShowStart] = useState(false);
  const [showEndDay, setShowEndDay] = useState(false);
  const [showEndSeason, setShowEndSeason] = useState(false);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const season = data?.league?.activeSeason || null;
  const scope = useMemo(() => createPracticeVenueLeagueScope({
    venueId: venue.id, practiceSessionId: session.sessionId,
    seasonId: season?.id || "",
  }), [venue.id, session.sessionId, season?.id]);
  const root = venueLeagueRootPath(scope);

  useEffect(() => {
    setData(null); setClubs([]); setPage("landing");
    setError(""); setExpired(false);
    const stop = subscribeFieldPracticeWorkspace(
      root, setData, setClubs, failure => setError(failure.message)
    );
    const timer = window.setTimeout(() => {
      stop(); setExpired(true);
    }, Math.max(0, Date.parse(session.expiresAt) - Date.now()));
    return () => {stop(); window.clearTimeout(timer);};
  }, [root, session.expiresAt]);

  const practiceVenue = data ? {...data, id: venue.id} : null;
  const teams = clubs.map(buildFieldClubTeam);

  useEffect(() => {onPageChange?.(page);}, [page, onPageChange]);
  useEffect(() => {
    if (fieldNavTarget?.page) navigate(fieldNavTarget.page);
  }, [fieldNavTarget]);
  const {
    liveMatch, scheduledFixtures, nextFixture, currentMatch,
  } = resolveFieldUpcomingMatch({season, teams});

  // Simulated accepted Clubs publish only this session's schedule.
  useEffect(() => {
    if (expired || !season?.id || season.fixtures?.length) return;
    const accepted = clubs.filter(club =>
      season.invitations?.[club.clubId]?.status === "accepted"
    );
    if (accepted.length < Number(season.minimumClubs || 3)) return;
    let cancelled = false;
    preparePracticeSchedule(scope, clubs).catch(failure => {
      if (!cancelled) setError(failure.message);
    });
    return () => {cancelled = true;};
  }, [
    root, season?.id, season?.fixtures?.length, expired,
    JSON.stringify(season?.invitations || {}),
    JSON.stringify(clubs),
  ]);

  async function startMatch() {
    if (busy || expired) return;
    if (liveMatch) {
      setPage("live");
      return;
    }
    if (!season) {
      setShowStart(true);
      return;
    }
    setBusy(true); setError("");
    try {
      await preparePracticeSchedule(scope, clubs);
      const controller = buildVenueRefereeController({
        deviceId: getVenueRefereeDeviceId(),
        identity: auth.currentUser, user: auth.currentUser, role: "admin",
      });
      await startPracticeFixture({
        scope, teams, controller,
        fixtureId: nextFixture?.id || "",
      });
      setPage("live");
    } catch (failure) {
      setError(failure.message);
    } finally {setBusy(false);}
  }
  const unavailable = () => setError(
    "This feature still needs its sandbox adapter. No Official service was called."
  );
  async function navigate(next) {
    if (busy || expired) return;
    setError("");
    if (["fixtures", "squads", "formations"].includes(next) && season) {
      setBusy(true);
      try {await preparePracticeSchedule(scope, clubs);}
      catch (failure) {setError(failure.message); return;}
      finally {setBusy(false);}
    }
    setPage(next);
  }

  if (expired) return <div className="page">
    <section className="card">
      <h2>Practice session finished</h2>
      <button className="primary-btn" onClick={onExit}>Return to Official</button>
    </section>
  </div>;

  let content;
  if (!practiceVenue) {
    content = <FieldPracticeStartupSplash practiceBootstrapping/>;
  } else if (page === "landing") {
    content = <VenueLandingPage
      dataScope={scope}
      fieldSeason={season}
      fieldScheduleControls={
        <FieldMatchDaySchedule scope={scope}
          venueId={venue.id} season={season} teams={teams}
          isCreator readOnly={false}
          onPublish={() => preparePracticeSchedule(scope, clubs)}
        />
      }
      fieldScheduleView={
        <button type="button" className="field-fixtures-open"
          onClick={() => navigate("fixtures")}>
          <span className="field-fixtures-open__icon" aria-hidden="true">▦</span>
          <span>
            <strong>Fixtures</strong>
            <small>Match days, opponents and kickoff times</small>
          </span>
          <span aria-hidden="true">→</span>
        </button>
      }
      activeClub={practiceVenue}
      activeClubId={venue.id}
      activeClubName={practiceVenue.name}
      teams={teams}
      identity={auth.currentUser}
      activeRole="admin"
      isAdmin
      canStartMatch={!expired}
      startMatchDeniedMessage="Start a Practice season with both squads available."
      matchType="LEAGUE"
      gameFormat={season?.gameFormat || "5_V_5"}
      leagueMode={season?.leagueMode || "venue_league"}
      matchMode={season?.matchMode || "fixtured"}
      currentMatchNo={Number(season?.currentMatchNo) || 1}
      currentMatch={currentMatch}
      pairingRequiresCode={false}
      results={season?.results || []}
      streaks={season?.streaks || {}}
      hasLiveMatch={Boolean(liveMatch)}
      matchSeconds={season?.matchSeconds || 2400}
      defaultMatchSeconds={season?.matchSeconds || 2400}
      durationSwitchLocked
      formatSwitchLocked
      scheduledFixtures={scheduledFixtures}
      onOpenEndSeasonModal={() => {
        if (fieldSeasonNeedsAnnouncement(season)) setShowStart(true);
        else setShowEndSeason(true);
      }}
      seasonActionLabel={
        fieldSeasonNeedsAnnouncement(season) ? "Start Season" : "End Season"
      }
      onGoToStats={() => navigate("stats")}
      onGoToSquads={() => navigate("squads")}
      onGoToFormations={() => navigate("formations")}
      onGoToNews={unavailable}
      onGoToLostFound={unavailable}
      onGoToHighlights={unavailable}
      onOpenHighlightsCamera={unavailable}
      onGoToLiveAsSpectator={() => navigate("live")}
      onStartMatch={startMatch}
      onOpenBackupModal={() => {
        if (season) setShowEndDay(true);
        else setError("Start a Practice season first.");
      }}
      onUpdatePairing={async pairing => {
        if (expired || busy || liveMatch || !season) {
          throw new Error("This Practice season is unavailable.");
        }
        await chooseVenueFixturePairing({
          scope, venueId: venue.id, seasonId: season.id,
          clubAId: pairing.teamAId, clubBId: pairing.teamBId,
        });
      }}
      onUpdateMatchSeconds={unavailable}
      onSetMatchType={unavailable}
      onForceSetMatchType={unavailable}
      onSetGameFormat={unavailable}
      onForceSetGameFormat={unavailable}
      onSetLeagueMode={unavailable}
      onSetMatchMode={unavailable}
      onGenerateScheduledPlan={() => navigate("fixtures")}
      onUpdateSmartOffset={unavailable}
    />;
  } else if (page === "live" && season) {
    content = <VenueLiveMatchRuntime
      venue={practiceVenue} season={season} teams={teams} dataScope={scope}
      identity={auth.currentUser} activeRole="admin"
      isAdmin canOperateMatch
      onBack={() => navigate("landing")}
      onGoToStats={() => navigate("stats")}
    />;
  } else if (page === "fixtures") {
    content = <VenueFixturesPage venue={practiceVenue}
      season={season} teams={teams}/>;
  } else if (page === "squads" && season) {
    content = <VenueSquadsPage venue={practiceVenue}
      season={season} scope={scope}/>;
  } else if (page === "formations" && season) {
    content = <VenueLeagueFormationsPage
      fieldSeason={season} fieldLeagueScope={scope}
      activeClub={practiceVenue} activeClubId={venue.id}
      isPracticeMode practiceSessionId={session.sessionId}
      savedFieldLineups={season.savedLineups || {}}
      currentMatch={currentMatch}
      canManageFieldFormations
      teams={teams} fiveVFiveTeams={teams}
      identity={auth.currentUser} authUser={auth.currentUser}
      matchType="LEAGUE" gameFormat={season.gameFormat || "5_V_5"}
      results={season.results || []} allEvents={season.allEvents || []}
      onGoToSquads={() => navigate("squads")}
    />;
  } else if (page === "stats") {
    content = <VenueLeagueStatsPage venue={practiceVenue}
      season={season} clubs={teams} scope={scope}/>;
  } else {
    content = <section className="card">
      <p>{season ? "This feature is being connected to the sandbox."
        : "Start a Practice season first."}</p>
      <button className="secondary-btn"
        onClick={() => navigate("landing")}>Home</button>
    </section>;
  }

  return <div style={{paddingBottom: 90}}>
    <FieldPracticeTimer expiresAt={session.expiresAt} onExit={onExit}/>
    {error && <p role="alert">{error}</p>}
    {busy && <p role="status">Preparing sandbox fixtures and squads…</p>}
    {content}
    {page === "landing" && season && <FieldDecisionReview
      scope={scope} venueId={venue.id} seasonId={season.id} isCreator
    />}

    <FieldBottomNav currentPage={page} onNavigate={next => {
      if (["news", "videos", "lostFound"].includes(next)) unavailable();
      else navigate(next);
    }}/>
    {showEndDay && season && <FieldPracticeEndMatchDay
      venue={practiceVenue} season={season} scope={scope}
      onClose={() => setShowEndDay(false)}
    />}
    {showEndSeason && season && <FieldSeasonEndModal
      venue={practiceVenue} season={season} scope={scope}
      onClose={() => setShowEndSeason(false)}
    />}
    {showStart && <FieldSeasonStartModal
      venue={practiceVenue} season={season} isPractice
      onClose={() => setShowStart(false)}
      onAnnounce={async settings => {
        const result = await fieldPracticeRequest(
          "announceFieldPracticeSeason", {
            venueId: venue.id, sessionId: session.sessionId, settings,
          }
        );
        return result.invited;
      }}
    />}
  </div>;
}
