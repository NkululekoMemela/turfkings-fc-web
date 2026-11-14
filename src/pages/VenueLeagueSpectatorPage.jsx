import {SpectatorPage} from "./SpectatorPage.jsx";
import React, {useEffect, useMemo, useState} from "react";
import {onSnapshot} from "firebase/firestore";
import {db} from "../firebaseConfig.js";
import {getVenueLiveMatchDoc} from "../storage/venueLiveMatchRepository.js";
import {subscribeToMatchHighlights} from "../storage/venueVideoHighlightsRepository.js";
import {fieldSpectatorView, fieldSpectatorScore} from "../core/fieldSpectatorView.mjs";
import {fieldHalfSecondsLeft} from "../core/fieldMatchClock.js";
import {visibleFieldMatchEvents} from "../core/fieldMatchFeed.mjs";
import {fieldHighlightMatchId, clipBelongsToLiveFixture} from "../core/liveFixtureClips.mjs";
import "./VenueLeagueSpectatorPage.css";

const clock = seconds => {
  const n = Math.max(0, Number(seconds) || 0);
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
};
const phases = {first_half: "First half", halftime: "Half-time", second_half: "Second half", full_time: "Full time"};
const kickoff = new Intl.DateTimeFormat("en-ZA", {dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg"});

function Team({team}) {
  const logo = team.transparentLogoUrl || team.logoUrl || team.branding?.logoUrl || team.image;
  return <div className="field-watch-team">
    <span className="field-watch-crest">{logo ? <img src={logo} alt=""/> : <span aria-hidden="true">⚽</span>}</span>
    <strong>{team.label || team.name || "Team"}</strong>
  </div>;
}

export default function VenueLeagueSpectatorPage({venue, season = {}, teams = [], dataScope, currentLive = null, requestedFixtureId = "", onBack, onBackToLanding, activeClubId, externalSource = false, suppliedClips, backLabel = "Back to Field"}) {
  const venueId = venue?.id || dataScope?.venueId || activeClubId || "";
  const seasonId = dataScope?.seasonId || season?.id || "";
  const environment = dataScope?.environment || "official";
  const practiceSessionId = dataScope?.practiceSessionId;
  const matchSummary = requestedFixtureId ? season?.liveMatches?.[requestedFixtureId]
    : Object.values(season?.liveMatches || {}).find(match => match?.status === "live");
  const liveDocumentId = environment === "practice" ? "current" : matchSummary?.liveDocumentId || "current";
  const scope = useMemo(() => ({kind: "venueLeague", environment, venueId, seasonId, practiceSessionId, liveDocumentId}),
    [environment, venueId, seasonId, practiceSessionId, liveDocumentId]);
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now);
  const live = snapshot?.scope === scope ? snapshot.value : currentLive;
  useEffect(() => {
    if (externalSource || !scope.venueId || !scope.seasonId) return;
    let active = true;
    let stop;
    try {
      stop = onSnapshot(getVenueLiveMatchDoc(db, scope), snap => {
        if (!active) return;
        const value = snap.data();
        setSnapshot({scope, value: value ? {...value, _receivedAt: Date.now()} : null});
        setError("");
      }, () => { if (active) setError("Live updates interrupted."); });
    } catch {
      setError("Match updates are unavailable.");
    }
    return () => { active = false; stop?.(); };
  }, [scope,externalSource]);
  useEffect(() => {
    if (live?.status !== "live" || !live.running || live.timeUp) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [live?.status, live?.running, live?.timeUp]);

  const {kind, match} = fieldSpectatorView({season, live, now, requestedFixtureId});
  const fixtureId = match?.fixtureId || match?.id;
  const matchId = !externalSource && environment !== "practice" && match && kind !== "upcoming"
    ? fieldHighlightMatchId(venueId, seasonId, fixtureId) : "";
  const [reel, setReel] = useState(null);
  useEffect(() => {
    if (!matchId) return;
    let active = true;
    const stop = subscribeToMatchHighlights({matchId, clubId: venueId, onChange: items => {
      if (active) setReel({matchId, items:items.filter(clip => clipBelongsToLiveFixture(clip, {matchId, venueId, fixtureId, seasonId}))});
    }, onError: () => { if (active) setReel(null); }});
    return () => {active = false; stop();};
  }, [matchId, venueId, fixtureId, seasonId]);

  if (!match) return <main className="page live-page field-spectator-page">
    <section className="field-watch-panel"><p>{requestedFixtureId ? "This fixture is unavailable." : "No fixture announced yet."}</p></section>
    {error && <p role="status">{error}</p>}
    {(onBack || onBackToLanding) && <button className="secondary-btn field-watch-back" onClick={onBack || onBackToLanding}>{backLabel}</button>}
  </main>;
  const score = fieldSpectatorScore(match);
  const team = (side, id) => {
    const listed = (teams || []).find(entry => String(entry.id) === id);
    return {...listed, label: listed?.label || listed?.name || match[`team${side}Label`] || id,
      ...match[`team${side}Snapshot`]};
  };
  const phase = kind === "result" || match.timeUp ? "Full time"
    : kind === "upcoming" ? "Upcoming"
    : match.awaitingKitVerification ? "Lineups" : phases[match.clockPhase] || "Live";
  const elapsed = match.running && !match.timeUp && match.clockPhase !== "halftime"
    ? Math.max(0, Math.floor((now - (match._receivedAt || now)) / 1000)) : 0;
  const remaining = Math.max(0, (Number(match.secondsLeft) || 0) - elapsed);
  if (kind !== "upcoming") {
    const nextAt = (season?.fixtures || []).filter(f => f.status === "scheduled" && f.scheduledLocal)
      .map(f => Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/i.test(f.scheduledLocal) ? f.scheduledLocal : f.scheduledLocal + "+02:00"))
      .filter(at => at >= now).sort((a,b) => a-b)[0];
    const next = Number.isFinite(nextAt) ? kickoff.format(nextAt) : "";
    return <SpectatorPage key={fixtureId} onBack={onBack || onBackToLanding} nextMatchDaySchedule={next}
      externalView={{match:{...match, teamAId:score.a, teamBId:score.b,
        teamASnapshot:team("A",score.a), teamBSnapshot:team("B",score.b),
        matchNumber:match.matchNumber || match.matchNo,
        finalSummary:{goalsA:score.goalsA,goalsB:score.goalsB},
        events:visibleFieldMatchEvents(score.events).map(event=>({...event,teamId:String(event.teamId||""),
          scorer:event.scorer||event.playerName||event.player})),
        isFinished:kind==="result" || match.isFinished},
        clips:suppliedClips || (reel?.matchId===matchId ? reel?.items : []),
        secondsLeft:match.clockVersion===1?fieldHalfSecondsLeft({...match,secondsLeft:remaining}):remaining,
        phase:!match.running && kind==="live" ? `${phase} · Paused` : phase, scores:{goalsA:score.goalsA,goalsB:score.goalsB}, backLabel,error}}/>;
  }
  return <main className="page live-page field-spectator-page">
    <section className="field-watch-panel field-watch-scoreboard" aria-label="Match score">
      <div className="field-watch-status" data-live={kind === "live" && match.running && !match.timeUp}>{phase}</div>
      <div className="field-watch-score">
        <Team team={team("A", score.a)}/>
        <strong>{kind === "upcoming" ? "VS" : `${score.goalsA} – ${score.goalsB}`}</strong>
        <Team team={team("B", score.b)}/>
      </div>
      {kind === "upcoming" && Number.isFinite(match.atMs) && <small>{kickoff.format(match.atMs)}</small>}
      {kind === "live" && !match.timeUp && !match.awaitingKitVerification && match.clockPhase !== "halftime" &&
        <small role="timer">{clock(match.clockVersion === 1 ? fieldHalfSecondsLeft({...match, secondsLeft: remaining}) : remaining)}{!match.running && " · Paused"}</small>}
    </section>
    {error && <p role="status">{error}</p>}
    {(onBack || onBackToLanding) && <button className="secondary-btn field-watch-back" onClick={onBack || onBackToLanding}>{backLabel}</button>}
  </main>;
}
