import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import ClubPageRibbon from "./ClubPageRibbon.jsx";
import FieldMatchHalfClock from "./FieldMatchHalfClock.jsx";
import VenueLeagueLiveMatchPage from "../pages/VenueLeagueLiveMatchPage.jsx";
import VenueLeagueSpectatorPage from "../pages/VenueLeagueSpectatorPage.jsx";
import {clubChallengeRequest} from "../storage/clubChallengeGateway.js";

function exhibitionDevice() {
  try {
    const key = "fanm-club-challenge-device";
    const id = sessionStorage.getItem(key) || crypto.randomUUID();
    sessionStorage.setItem(key,id);
    return id;
  } catch {return crypto.randomUUID();}
}
const emptyEvents = [];

export default function ExhibitionMatchRuntime({clubId,fixtureId,identity,viewerOnly,publicViewer,onClose,onGoToStats,onChange}) {
  const [device] = useState(exhibitionDevice);
  const [match,setMatch] = useState(null);
  const [watchClips,setWatchClips] = useState([]);
  const [error,setError] = useState("");
  const [recoveryError,setRecoveryError] = useState("");
  const [now,setNow] = useState(Date.now);
  const latest = useRef(null), poll = useRef(0), queue = useRef(Promise.resolve());
  const attemptedStart = useRef(false), automatic = useRef("");
  const mounted = useRef(true);
  const refresh = useCallback(async signal => {
    const order = ++poll.current;
    let next;
    try {
      next = await clubChallengeRequest(publicViewer ? "watch" : "matchday",{clubId,fixtureId},signal);
    } catch (error) {
      if (!viewerOnly || publicViewer || error.status !== 403) throw error;
      next = await clubChallengeRequest("watch",{clubId,fixtureId},signal);
    }
    if (!next) throw new Error("This exhibition is not available to watch.");
    if (signal?.aborted || !mounted.current || order !== poll.current) return null;
    next._receivedAt = Date.now();
    latest.current = next;
    setMatch(next);
    if (viewerOnly) setError("");
    setNow(Date.now());
    return next;
  },[clubId,fixtureId,viewerOnly,publicViewer]);
  useEffect(()=>{
    mounted.current = true;
    const controller = new AbortController();
    const read = () => refresh(controller.signal).catch(e => {if(!controller.signal.aborted)setError(e.message);});
    void read();
    const timer = window.setInterval(read,2500);
    const clock = window.setInterval(()=>setNow(Date.now()),250);
    return ()=>{mounted.current=false;controller.abort();clearInterval(timer);clearInterval(clock);};
  },[refresh]);
  const command = useCallback((action,options={})=>{
    const task = async ()=>{
      if (!mounted.current) return null;
      try {
        ++poll.current;
        const result = await clubChallengeRequest("operate",{clubId,fixtureId,device,command:action,
          revision:latest.current?.live?.revision,...options});
        if (latest.current?.live && action !== "start" && action !== "cancelStart" && Number.isInteger(result.revision)) {
          latest.current = {...latest.current,live:{...latest.current.live,revision:result.revision}};
        }
        try {await refresh();} catch { /* The write succeeded; polling will refresh the view. */ }
        if (["start","finish","cancelStart"].includes(action)) void onChange?.().catch(()=>{});
        if (mounted.current) setError("");
        return result;
      } catch(e) {
        if (mounted.current) setError(e.message);
        try {await refresh();} catch {}
        throw e;
      }
    };
    const pending=queue.current.then(task,task);
    queue.current=pending.catch(()=>{});
    return pending;
  },[clubId,fixtureId,device,onChange,refresh]);
  const canOperate = !viewerOnly && Boolean(match?.canOperate);
  const controls = canOperate && match?.live?.controller?.deviceId === device;
  const live = match?.live;
  const offset = match?.serverNowMs && match?._receivedAt ? match.serverNowMs-match._receivedAt : 0;
  const halfLeft = live ? Math.max(0,Math.ceil((live.endsAtMs ? live.endsAtMs - now - offset : live.remainingMs)/1000)) : 0;
  const start = useCallback(()=>command("start",{minutes:match?.format === "11v11" ? 90 : 40,verifyFirst:true}),[command,match?.format]);
  useEffect(()=>{
    if (attemptedStart.current || !canOperate || match?.status !== "accepted" || !match.teams?.home || !match.teams?.away) return;
    attemptedStart.current=true;
    void start().catch(()=>{});
  },[canOperate,match,start]);
  useEffect(()=>{
    if (!controls || match?.status !== "live" || !live.endsAtMs || live.phase !== "first_half" || halfLeft > 0) return;
    const key = `half:${live.revision}`;
    if (automatic.current===key) return;
    automatic.current=key;
    void command("halftime").catch(()=>{});
  },[controls,match?.status,live,halfLeft,command]);
  useEffect(()=>{
    const request=live?.request;
    if (!canOperate || controls || request?.status!=="pending" || request.requester?.deviceId!==device) return;
    const expires=Date.parse(request.expiresAtISO);
    if (!Number.isFinite(expires)) return;
    const timer=window.setTimeout(()=>{
      void command("takeover").catch(e=>setRecoveryError(e.message));
    },Math.max(0,expires-Date.now()-offset)+200);
    return ()=>clearTimeout(timer);
  },[canOperate,controls,device,live?.request?.status,live?.request?.requester?.deviceId,live?.request?.expiresAtISO,command,offset]);

  const showWatchClips = !publicViewer && (!canOperate || match?.status === "completed") &&
    ["live","completed"].includes(match?.status);
  useEffect(()=>{
    if(!showWatchClips) return;
    const controller=new AbortController();
    const load=async ()=>{
      try {
        const {clips}=await clubChallengeRequest("clips",{clubId,fixtureId,chat:true},controller.signal);
        if(!controller.signal.aborted) setWatchClips([...new Map((clips||[]).map(clip=>[
          `${clip.sourceClubId}:${clip.clipId}`,{...clip,id:`${clip.sourceClubId}:${clip.clipId}`,playableUrl:clip.videoUrl},
        ])).values()]);
      } catch {}
    };
    void load();
    const timer=window.setInterval(load,20000);
    return ()=>{controller.abort();window.clearInterval(timer);};
  },[clubId,fixtureId,showWatchClips]);

  const home = match?.home, away = match?.away;
  const homeRoster = match?.teams?.home, awayRoster = match?.teams?.away;
  // Polling replaces objects: keep Field lineup and player inputs stable until their values change.
  const rosterKey=JSON.stringify([home,away,homeRoster,awayRoster,match?.homeColour,match?.awayColour,match?.lineups,match?.format]);
  const {teams,players,saved}=useMemo(()=>{
    const [a,b,ar,br,ac,bc,lineups,format]=JSON.parse(rosterKey);
    if(!a||!b)return {teams:[],players:{},saved:{}};
    const sides=[[a,ar,ac,"home"],[b,br,bc,"away"]];
    return {
      teams:sides.map(([club,roster,colour])=>({...club,label:club.name,teamColorHex:colour,
        players:[...(roster?.starters || []),...(roster?.substitutes || [])]})),
      players:Object.fromEntries(sides.map(([club,roster])=>[club.id,[...(roster?.starters||[]),...(roster?.substitutes||[])].map((fullName,i)=>({sourcePlayerId:String(i),fullName,shortName:fullName}))])),
      saved:Object.fromEntries(sides.filter(([, , ,side])=>lineups?.[side]).map(([club,,,side])=>[club.id,{[format.split("v")[0]]:lineups[side]}])),
    };
  },[rosterKey]);
  const halfSeconds=live?.halfMs/1000 || (match?.format==="11v11" ? 2700 : 1200);
  const clockPhase=live?.phase || "first_half";
  const clockState={
    status:match?.status, clockVersion:1,clockPhase,matchSeconds:halfSeconds*2,
    secondsLeft:halfLeft+(clockPhase==="first_half"||clockPhase==="halftime"?halfSeconds:0),
    running:Boolean(live?.endsAtMs&&halfLeft>0), timeUp:clockPhase==="second_half"&&halfLeft===0,
    awaitingKitVerification:Boolean(live?.awaitingLineups), halftimeEndsAtMs:live?.halftimeEndsAtMs ? live.halftimeEndsAtMs-offset : null,
  };
  const currentMatch={fixtureId,teamAId:home?.id,teamBId:away?.id};
  const events=live?.events || emptyEvents;
  const spectatorMatch={...clockState,...currentMatch,kickoffMs:match?.kickoffMs,currentEvents:events,_receivedAt:now,
    goalsA:events.filter(e=>e.type==="goal"&&e.teamId===home?.id).length,
    goalsB:events.filter(e=>e.type==="goal"&&e.teamId===away?.id).length};
  const request=live?.request && {...live.request,
    requestedAtISO:new Date(Date.parse(live.request.requestedAtISO)-offset).toISOString(),
    expiresAtISO:new Date(Date.parse(live.request.expiresAtISO)-offset).toISOString()};
  const remove=(event)=>event && command("editEvent",{mode:"delete",eventId:event.id}).catch(()=>{});
  return <div className="field-live-runtime">
    <ClubPageRibbon title={canOperate ? "Exhibition referee booth" : "Exhibition live match"} onHome={onClose}/>
    {error && <p role="alert" className="error-text">{error}</p>}
    {!match && <section className="card"><p role="status">{error ? "Match updates unavailable." : "Opening match…"}</p><button type="button" className="secondary-btn" onClick={onClose}>Back to Club</button></section>}
    {match && canOperate && match.status==="accepted" ? <section className="card">
      {!match.teams?.home || !match.teams?.away ? <p>Both Clubs must publish their squads before kickoff.</p> :
        error ? <button type="button" className="primary-btn" onClick={()=>void start().catch(()=>{})}>Try start again</button> : <p role="status">Opening lineup verification…</p>}
      <button type="button" className="secondary-btn" onClick={onClose}>Back to Club</button>
    </section> : match && (!canOperate || match.status!=="live") ?
      <VenueLeagueSpectatorPage teams={teams} currentLive={spectatorMatch} requestedFixtureId={fixtureId}
        suppliedClips={showWatchClips ? watchClips : undefined} externalSource
        onBack={onClose} backLabel="Back to Club"/> : null}
    {match?.status==="live" && canOperate && <>
      <FieldMatchHalfClock state={clockState} canControl={controls} onStartSecondHalf={()=>command("secondHalf")}/>
      <VenueLeagueLiveMatchPage key={fixtureId+":"+device+":"+controls} {...clockState} fieldClockVersion={1} fieldClockPhase={clockPhase}
        teams={teams} currentMatch={currentMatch} currentMatchNo={1} currentEvents={events}
        identity={identity} activeRole="referee" canControlMatch={controls} canControlCurrentLiveMatch={controls}
        gameFormat={match.format} activeClubId={clubId} fieldPaidSquads={players} externalSavedLineups={saved}
        confirmedLineupSnapshot={live.confirmedLineups} refereeDeviceId={device}
        liveMatchController={live.controller} liveMatchTakeoverRequest={request}
        onRequestTakeOverLiveMatch={()=>{setRecoveryError("");return command("requestControl");}}
        onAcceptTakeoverRequest={()=>void command("transferControl").catch(()=>{})}
        onRejectTakeoverRequest={()=>void command("rejectControl").catch(()=>{})}
        takeoverRecoveryError={recoveryError}
        onConfirmPreMatchLineups={snapshots=>command("confirmLineups",{snapshots}).then(()=>snapshots)}
        onCancelPreMatchLineups={()=>command("cancelStart").then(()=>onClose())}
        matchTransport={{addEvent:event=>command("editEvent",{mode:"append",event}),
          replaceEvent:(eventId,event)=>command("editEvent",{mode:"replace",eventId,event})}}
        onDeleteEvent={index=>remove(events[index])} onUndoLastEvent={()=>remove(events.at(-1))}
        onConfirmEndMatch={()=>command("finish")} onBackToLanding={onClose} onGoToStats={onGoToStats}
        externalAddedTime={live.addedTime?.[clockPhase]} onAddMatchTime={seconds=>command("addTime",{seconds})}/>
    </>}
  </div>;
}
