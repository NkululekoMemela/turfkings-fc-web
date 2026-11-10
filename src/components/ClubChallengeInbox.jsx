import {createPortal} from "react-dom";
import "./FieldSeasonInvitations.css";
import "./ClubAdminNoticeHeader.css";
import React, {useCallback, useEffect, useRef, useState} from "react";
import {clubChallengeRequest} from "../storage/clubChallengeGateway.js";
import "./ClubChallengeInbox.css";

const formatName = (format) => `${String(format).split("v")[0]}-a-side`;
const canRespond = (match, clubId) => match.status === "pending" && match.kickoffMs > Date.now() &&
  !(match.acceptances || {home: !match.instigated, away: false})[match.home.id === clubId ? "home" : "away"];
const needsCancellationReview = (match, clubId) => {
  const request = match.cancellation;
  if (match.kickoffMs <= Date.now() || !request) return false;
  return (match.status === "accepted" && request.outcome === "pending" &&
      (request.byClubId !== clubId || Boolean(request.suggestion))) ||
    (match.status === "withdrawn" && request.restoreBy && request.restoreBy !== clubId);
};
const needsPostponementReview = (match, clubId) => match.status === "accepted" && match.kickoffMs > Date.now() &&
  match.postponement?.status === "pending" && match.postponement.byClubId !== clubId;
const noticeKey = (match) => {
  const request = match.cancellation;
  return `${match.fixtureId}:${match.revision || 0}:${match.status}:${request?.requestedAtMs || ""}:${request?.suggestedAtMs || ""}:${request?.restoreBy || ""}:${match.postponement?.requestedAtMs || ""}`;
};

function Crest({club}) {
  return <span className="challenge-crest">
    {club.logoUrl ? <img src={club.logoUrl} alt="" /> : club.name.slice(0, 2).toUpperCase()}
  </span>;
}

export function ChallengePair({match}) {
  return <div className="challenge-matchup">
    <span><Crest club={match.home} /><strong>{match.home.name}</strong></span>
    <small>vs</small>
    <span><Crest club={match.away} /><strong>{match.away.name}</strong></span>
  </div>;
}

function ChallengeDetails({match}) {
  return <>
    <ChallengePair match={match}/>
    <p>{formatName(match.format)} · {match.proposedDate} · {match.proposedKickoff} SAST</p>
    <p>{match.venue}</p>
  </>;
}

export default function ClubChallengeInbox({clubId, userId, promptOnly = false, focusFixtureId, onChange, managementOnly = false, invitationOpen = null}) {
  const [matches, setMatches] = useState([]);
  const [allowed, setAllowed] = useState(false);
  const [canAccept, setCanAccept] = useState(false);
  const [clockOffset, setClockOffset] = useState(0);
  const hasLive = useRef(false);
  const [openId, setOpenId] = useState(null);
  const [proposal, setProposal] = useState(null);
  const [withdraw, setWithdraw] = useState(false);
  const [cancellationText, setCancellationText] = useState("");
  const [postpone, setPostpone] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const skipped = useRef(new Set());
  const dialog = useRef(null);
  const openedNotification = useRef(null);
  const storageKey = `fanm-challenge-later:${userId}:${clubId}`;
  const refresh = useCallback(async (signal) => {
    try {
      const result = await clubChallengeRequest("list", {clubId}, signal);
      if (signal?.aborted) return;
      setAllowed(true);
      setCanAccept(Boolean(result.canRespondToInvitations));
      setMatches(result.matches || []);
      hasLive.current = result.matches?.some((match) => match.status === "live");
      if (result.serverNowMs) setClockOffset(result.serverNowMs - Date.now());
    } catch (error) {
      if (signal?.aborted) return;
      if (error.status === 403 || error.status === 401) {
        setAllowed(false);
        setMatches([]);
      } else throw error;
    }
  }, [clubId]);
  useEffect(() => {
    const controller = new AbortController();
    const read = () => refresh(controller.signal).catch(() => {});
    try { skipped.current = new Set(JSON.parse(sessionStorage.getItem(storageKey) || "[]")); }
    catch { skipped.current = new Set(); }
    read();
    let checks = 0;
    const timer = window.setInterval(() => {
      if (!document.hidden && (hasLive.current || ++checks % 4 === 0)) read();
    }, 5000);
    window.addEventListener("focus", read);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", read);
    };
  }, [refresh, storageKey]);
  useEffect(() => {
    if (!promptOnly || !canAccept || busy) return;
    if (invitationOpen?.openedAt && openedNotification.current !== invitationOpen.openedAt) {
      const target = matches.find(match => match.fixtureId === invitationOpen.fixtureId && canRespond(match,clubId));
      if (target) {
        openedNotification.current = invitationOpen.openedAt;
        setProposal(null); setWithdraw(false); setPostpone(null); setCancellationText(""); setError("");
        setOpenId(target.fixtureId);
        return;
      }
    }
    if (openId) return;
    const next = matches.find((match) => (canRespond(match, clubId) || needsCancellationReview(match, clubId) || needsPostponementReview(match, clubId)) &&
      !skipped.current.has(noticeKey(match)));
    if (next) setOpenId(next.fixtureId);
  }, [clubId, matches, openId, promptOnly, canAccept, busy, invitationOpen]);
  const pendingInvitations = canAccept ? matches.filter(match => canRespond(match,clubId)) : [];
  const pendingIndex = pendingInvitations.findIndex(match => match.fixtureId === openId);
  const selected = matches.find((match) => match.fixtureId === openId);
  const request = selected?.cancellation;
  const pendingCancellation = selected?.status === "accepted" && request?.outcome === "pending";
  const archive = selected?.status === "withdrawn";
  const postponement = selected?.status === "accepted" && selected.postponement?.status === "pending" ? selected.postponement : null;
  const reviewingPostponement = !withdraw && !pendingCancellation && (postpone || postponement);
  const closeToKickoff = selected?.kickoffMs - (Date.now() + clockOffset) <= 4 * 3600000 + 60000;
  useEffect(() => {
    if (selected && !dialog.current?.open) dialog.current?.showModal();
  }, [selected]);
  function reviewLater() {
    if (selected) skipped.current.add(noticeKey(selected));
    setProposal(null);
    setWithdraw(false);
    setCancellationText("");
    setPostpone(null);
    try { sessionStorage.setItem(storageKey, JSON.stringify([...skipped.current].slice(-40))); }
    catch { /* The in-memory dismissal is still available. */ }
    setError("");
    setOpenId(null);
  }
  async function respond(decision) {
    setBusy(true);
    setError("");
    try {
      const result = await clubChallengeRequest("respond", {clubId, fixtureId: openId, decision, revision: selected.revision || 0});
      setMatches((items) => items.map((match) => match.fixtureId === result.fixtureId
        ? {...match, status: result.status, acceptances: result.acceptances} : match));
      reviewLater();
      onChange?.().catch(() => {});
      void refresh().catch(() => {});
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  function openReview(match, shouldWithdraw = false) {
    setProposal(null);
    setWithdraw(shouldWithdraw);
    setCancellationText("");
    setPostpone(null);
    setError("");
    setOpenId(match.fixtureId);
  }
  async function revise(cancellationAction) {
    setBusy(true);
    setError("");
    try {
      await clubChallengeRequest("revise", {clubId, fixtureId: openId, revision: selected.revision || 0,
        ...(cancellationAction ? {cancellationAction, reason:cancellationText, suggestion:cancellationText} : proposal)});
      await refresh();
      reviewLater();
      onChange?.().catch(() => {});
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function submitPostponement(action) {
    setBusy(true); setError("");
    try {
      await clubChallengeRequest("revise",{clubId,fixtureId:openId,postponementAction:action,
        ...(action==="request" ? postpone : {requestedAtMs:postponement?.requestedAtMs})});
      await refresh();
      reviewLater();
      void onChange?.().catch(()=>{});
    } catch (error) {setError(error.message);}
    finally {setBusy(false);}
  }
  if (!allowed) return null;
  return <>
    {promptOnly && pendingInvitations.length > 0 && createPortal(
      <div className="tk-admin-notification-dock club-challenge-notification-dock">
        <button type="button" className="tk-admin-notification-bell" onClick={() => openReview(pendingInvitations[0])}
          aria-label={`Open Club challenges, ${pendingInvitations.length} awaiting reply`} title="Club challenge invitations">
          <span aria-hidden="true">🔔</span><em className="tk-admin-notification-count">{pendingInvitations.length}</em>
        </button>
      </div>, document.body)}
    {!promptOnly && <section className={managementOnly ? "club-challenge-inbox exhibition-management" : "club-challenge-inbox card"} aria-label="Exhibition matches">
    {!managementOnly && <h3>Exhibition referee booth</h3>}
    {!managementOnly && !matches.length && <p>No challenges yet. Open the Hub to challenge another Club.</p>}
    {matches.filter((match) => (!focusFixtureId || match.fixtureId === focusFixtureId || (managementOnly && match.status === "withdrawn")) && (!managementOnly || match.kickoffMs > Date.now()) &&
      (!managementOnly || ["pending", "accepted", "withdrawn"].includes(match.status))).map((match) => <article key={match.fixtureId} className="challenge-match">
      {managementOnly ? <ChallengePair match={match}/> : <ChallengeDetails match={match} />}
      <div className="exhibition-management-footer">
        <strong>{match.status === "withdrawn" ? "Cancelled" : match.cancellation?.outcome === "pending" ? "Cancellation requested" :
          match.status === "pending" ? "Awaiting reply" : match.status === "accepted" ? "Accepted" :
          match.status === "live" ? "Live" : match.status === "completed" ? "Full time" : "Declined"}</strong>
        {canAccept && ["pending", "accepted", "withdrawn"].includes(match.status) && match.kickoffMs > Date.now() &&
          <button type="button" onClick={() => openReview(match, match.status !== "withdrawn" && match.cancellation?.outcome !== "pending")}>
            {match.status === "withdrawn" ? "View archive" : match.cancellation?.outcome === "pending" ? "Review request" : "Withdraw challenge"}
          </button>}
      </div>
      {canAccept && match.status === "accepted" && match.kickoffMs > Date.now() && match.cancellation?.outcome !== "pending" &&
        <button type="button" className="exhibition-postpone-action" onClick={() => {
          openReview(match);
          if (match.postponement?.status !== "pending") setPostpone({proposedDate:"",proposedKickoff:match.proposedKickoff,reason:""});
        }}>{match.postponement?.status === "pending" ? "View postponement request" : "Postpone match"}</button>}
      {canAccept && canRespond(match, clubId) && <button type="button" onClick={() => openReview(match)}>Review invitation</button>}
      {match.status === "withdrawn" && match.signedPlayers?.length > 0 && <details>
        <summary>Your Club’s saved bookings</summary>
        <ul>{match.signedPlayers.map((player) => <li key={player.memberId}>
          {player.name} · {player.cashPaid ? `Cash recorded: R${(player.priceCents / 100).toFixed(2)}` : "No cash recorded"}
        </li>)}</ul>
      </details>}
    </article>)}
    {!selected && error && <p role="alert">{error}</p>}
  </section>}
    {selected && <dialog ref={dialog} className="club-challenge-dialog tk-admin-notification-card"
      aria-labelledby="club-challenge-title" onCancel={(event) => {event.preventDefault(); if (!busy) reviewLater();}}>
      <div className="tk-admin-notification-topline">
        <img src="/favicon_nobackground.png" alt="FANM" className="club-challenge-brand" />
        <div className="tk-admin-notification-title-wrap">
          <div className="tk-admin-notification-title" id="club-challenge-title">
            {archive ? "Archived cancellation" : reviewingPostponement ? "Postpone exhibition" : withdraw ? "Withdraw challenge?" : pendingCancellation
              ? "Cancellation requested" : selected.revisedBy ? "Updated fixture proposal" : "Your Club is invited"}
          </div>
          <span className="tk-admin-notification-tag">{selected.instigated ? "FANM exhibition" : "Club challenge invitation"}</span>
        </div>
      </div>
      <div className="tk-admin-notification-body">
        <div className="field-invite-intro"><span>Club exhibition</span><ChallengePair match={selected}/></div>
        <div className="field-invite-facts">
          <div><span>Match day</span><strong>{selected.proposedDate}</strong><small>{selected.proposedKickoff} SAST</small></div>
          <div><span>Venue</span><strong>{selected.venue}</strong></div>
          <div><span>Format</span><strong>{formatName(selected.format)}</strong></div>
          <div><span>Entry per Club</span><strong>{selected.clubTotalCents > 0 ? `R${(selected.clubTotalCents / 100).toFixed(2)}` : "Free to play"}</strong></div>
        </div>
        {selected.homeColour && selected.awayColour && <p className="challenge-kit-pair">
          <span><i style={{background: selected.homeColour}} />{selected.home.name} kit</span>
          <span><i style={{background: selected.awayColour}} />{selected.away.name} kit</span>
        </p>}
        {selected.hostedPackage && <p className="exhibition-hosted-package">
          <strong>FANM package:</strong> {selected.hostedPackage.rosterPerClub} players and {selected.hostedPackage.waterPerClub} × {selected.hostedPackage.waterMl} mL waters per Club. Field booking, referee and camera operator included.
        </p>}
        {selected.message && <p>{selected.message}</p>}
        {reviewingPostponement && <section className="exhibition-postpone-details">
          <p>The existing kickoff stays in place until both captains agree. All bookings and squads carry over.</p>
          {postpone ? <div className="exhibition-postpone-fields">
            <label>New date<input type="date" value={postpone.proposedDate} onChange={event=>setPostpone({...postpone,proposedDate:event.target.value})}/></label>
            <label>Kickoff (SAST)<input type="time" value={postpone.proposedKickoff} onChange={event=>setPostpone({...postpone,proposedKickoff:event.target.value})}/></label>
            <label className="exhibition-cancellation-input">Reason<textarea rows={3} maxLength={500} value={postpone.reason} onChange={event=>setPostpone({...postpone,reason:event.target.value})}/></label>
            <button type="button" className="tk-admin-notification-primary" disabled={busy||!postpone.proposedDate||!postpone.proposedKickoff||!postpone.reason.trim()} onClick={()=>submitPostponement("request")}>Propose new kickoff</button>
          </div> : <>
            <p><strong>{postponement.proposedDate} · {postponement.proposedKickoff} SAST</strong><br/>{postponement.reason}</p>
            {postponement.byClubId === clubId ? <p>Waiting for the other captain.</p> : <div className="tk-admin-notification-actions">
              <button type="button" className="tk-admin-notification-primary" disabled={busy} onClick={()=>submitPostponement("agree")}>Agree to new kickoff</button>
              <button type="button" className="tk-admin-notification-secondary" disabled={busy} onClick={()=>submitPostponement("decline")}>Keep original kickoff</button>
            </div>}
          </>}
        </section>}
        {withdraw && !archive && !pendingCancellation && <p>{selected.status === "pending" ? "This ends the invitation." : closeToKickoff
          ? "Kickoff is close. You can confirm cancellation now so players are notified immediately."
          : "The match remains scheduled until the other captain acknowledges or the reply deadline passes."}</p>}
        {(pendingCancellation || archive) && request && <>
          <p><strong>Reason:</strong> {request.reason}</p>
          {pendingCancellation && <p>Reply by {new Intl.DateTimeFormat("en-ZA",{weekday:"short",hour:"2-digit",minute:"2-digit",timeZone:"Africa/Johannesburg"}).format(request.dueMs)} SAST.</p>}
          {request.suggestion && <p><strong>Opponent’s alternative:</strong> {request.suggestion}</p>}
          {archive && <p>Bookings and squads are saved. Both captains must agree to restore before kickoff.</p>}
        </>}
        {((withdraw && !archive && !pendingCancellation) || (pendingCancellation && (request.byClubId !== clubId || closeToKickoff))) && <label className="exhibition-cancellation-input">
          {withdraw || request?.byClubId === clubId ? "Cancellation reason" : "Suggest an alternative"}
          <textarea rows={3} maxLength={500} value={cancellationText} onChange={(event) => setCancellationText(event.target.value)}/>
        </label>}
        {proposal && <form className="challenge-counter-form" onSubmit={(event) => {event.preventDefault(); revise();}}>
          {[
            ["venue", "Venue", "text"], ["proposedDate", "Date", "date"], ["proposedKickoff", "Kickoff (SAST)", "time"],
            ["homeColour", `${selected.home.name} kit`, "color"], ["awayColour", `${selected.away.name} kit`, "color"],
            ["message", "Message (optional)", "text"],
          ].map(([key,label,type]) => <label key={key}>{label}
            <input type={type} required={key !== "message"} value={proposal[key]} maxLength={key === "venue" ? 140 : 600}
              onChange={(event) => setProposal({...proposal, [key]: event.target.value})} />
          </label>)}
          <button type="submit" className="tk-admin-notification-primary" disabled={busy}>Send counterproposal</button>
        </form>}
        {error && <p role="alert">{error}</p>}
        {promptOnly && pendingIndex >= 0 && pendingInvitations.length > 1 && <nav className="club-challenge-invitation-nav" aria-label="Pending invitations">
          <button type="button" disabled={busy} onClick={() => openReview(pendingInvitations[(pendingIndex + pendingInvitations.length - 1) % pendingInvitations.length])}>Previous</button>
          <span>{pendingIndex + 1} of {pendingInvitations.length}</span>
          <button type="button" disabled={busy} onClick={() => openReview(pendingInvitations[(pendingIndex + 1) % pendingInvitations.length])}>Next</button>
        </nav>}
        <div className="tk-admin-notification-actions">
          {withdraw && !archive && !pendingCancellation && <button type="button" className="tk-admin-notification-primary" disabled={busy || !cancellationText.trim()}
            onClick={() => revise(closeToKickoff && selected.status === "accepted" ? "force" : "request")}>
            {selected.status === "pending" ? "Withdraw invitation" : closeToKickoff ? "Cancel now" : "Request cancellation"}
          </button>}
          {canAccept && pendingCancellation && request.byClubId !== clubId && <>
            <button type="button" className="tk-admin-notification-primary" disabled={busy} onClick={() => revise("acknowledge")}>Acknowledge cancellation</button>
            <button type="button" className="tk-admin-notification-secondary" disabled={busy || !cancellationText.trim()} onClick={() => revise("suggest")}>Send alternative</button>
          </>}
          {canAccept && pendingCancellation && request.byClubId === clubId && <>
            <button type="button" className="tk-admin-notification-secondary" disabled={busy} onClick={() => revise("keep")}>Keep match on</button>
            {closeToKickoff && <button type="button" className="tk-admin-notification-primary" disabled={busy || !cancellationText.trim()} onClick={() => revise("force")}>Cancel now</button>}
          </>}
          {canAccept && archive && request?.wasAgreed && selected.kickoffMs > Date.now() && <button type="button"
            className="tk-admin-notification-primary" disabled={busy || request.restoreBy === clubId} onClick={() => revise("restore")}>
            {request.restoreBy === clubId ? "Waiting for opponent" : request.restoreBy ? "Agree to restore" : "Request restore"}
          </button>}
          {!withdraw && !proposal && canAccept && canRespond(selected, clubId) && <>
            <button type="button" className="tk-admin-notification-primary" disabled={busy || !selected.homeColour || !selected.awayColour} onClick={() => respond("accepted")}>Accept fixture</button>
            <button type="button" className="tk-admin-notification-secondary" disabled={busy} onClick={() => setProposal({
              venue: selected.venue, proposedDate: selected.proposedDate, proposedKickoff: selected.proposedKickoff,
              homeColour: selected.homeColour || "#1d4ed8", awayColour: selected.awayColour || "#f59e0b", message: "",
              revision: selected.revision || 0,
            })}>Propose changes</button>
            <button type="button" className="tk-admin-notification-secondary" disabled={busy} onClick={() => respond("declined")}>Decline</button>
          </>}
          <button type="button" className="tk-admin-notification-nav-btn" disabled={busy} onClick={reviewLater}>
            {withdraw ? "Keep fixture" : (archive || pendingCancellation || reviewingPostponement) ? "Dismiss" : "Review later"}
          </button>
        </div>
      </div>
    </dialog>}
  </>;
}
