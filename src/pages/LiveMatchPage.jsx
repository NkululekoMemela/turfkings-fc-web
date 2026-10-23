// src/pages/LiveMatchPage.jsx
import React, {useEffect,useMemo,useRef,useState} from "react";
import {auth} from "../firebaseConfig.js";
import {useFootballProfiles,useMatchNumberSheet,verifyPlayerKit} from "../hooks/usePlayerKit.js";
import {buildKitRoster,kitRosterSignature,labelWithNumber} from "../core/playerKit.js";
import {RefereeKitDialog} from "../components/PlayerKitEditor.jsx";
import {PlayerNumberContext} from "../components/PlayerNumberContext.jsx";
import ThreeTeamLeagueLiveMatchPage from "./ThreeTeamLeague_LiveMatchPage.jsx";
import FriendlyLiveMatchPage from "./Friendly_LiveMatchPage";
import { MATCH_MODE, buildMatchClassification } from "../core/matchConfig.js";
import RefereeVarReview from "../components/RefereeVarReview.jsx";

export function LiveMatchPage(props) {
  const liveCurrentMatch =
    props.pendingMatchStartContext?.currentMatch ||
    props.currentMatch ||
    null;

  // Important:
  // App.jsx uses `matchType` for Friendly vs League.
  // App.jsx uses `matchMode` for League scheduling style: "round_robin" / "scheduled_target".
  // Therefore this router must NOT classify from matchMode first, otherwise League
  // round-robin is mistaken for Friendly and routed into Friendly_LiveMatchPage.
  const classification = buildMatchClassification({
    matchMode:
      liveCurrentMatch?.matchType ||
      props.pendingMatchStartContext?.matchType ||
      props.matchType ||
      liveCurrentMatch?.matchMode ||
      props.pendingMatchStartContext?.matchMode ||
      props.matchMode,
    gameFormat:
      liveCurrentMatch?.gameFormat ||
      props.pendingMatchStartContext?.gameFormat ||
      props.gameFormat,
    legacyGameFormat:
      liveCurrentMatch?.matchType ||
      props.pendingMatchStartContext?.matchType ||
      props.matchType ||
      liveCurrentMatch?.gameFormat ||
      props.pendingMatchStartContext?.gameFormat ||
      props.gameFormat,
  });

  const scope = useMemo(()=>({environment:props.dataScope?.environment || (props.isPracticeMode?"practice":"official"),
    ...(props.dataScope?.venueId?{venueId:props.dataScope.venueId,seasonId:props.dataScope.seasonId}:{clubId:props.activeClubId || "turf-kings",seasonId:props.activeSeasonId || ""}),
    ...(props.dataScope?.practiceSessionId?{practiceSessionId:props.dataScope.practiceSessionId}:{})}),[props.dataScope,props.activeClubId,props.activeSeasonId,props.isPracticeMode]);
  const matchKey=String(props.currentVideoHighlightsMatchId || props.videoHighlightsMatchId || props.matchId || liveCurrentMatch?.id || `${scope.seasonId || "football"}__${new Date().toLocaleDateString("en-CA",{timeZone:"Africa/Johannesburg"})}__${props.currentMatchNo || 1}`);
  const rawTeams=props.pendingMatchStartContext?.teams || (classification.matchMode===MATCH_MODE.FRIENDLY && props.fiveVFiveTeams?.length?props.fiveVFiveTeams:props.teams) || [];
  const profiles=useFootballProfiles(rawTeams,scope.venueId?"":scope.clubId);
  const playingIds=[liveCurrentMatch?.teamAId || liveCurrentMatch?.clubAId,liveCurrentMatch?.teamBId || liveCurrentMatch?.clubBId].filter(Boolean).map(String);
  const participating=rawTeams.filter(team=>!playingIds.length || playingIds.includes(String(team.id))).slice(0,2);
  const {sheet,error:sheetError}=useMatchNumberSheet(scope,matchKey);
  const [localSheet,setLocalSheet]=useState(null),[dialog,setDialog]=useState(null);
  const resolver=useRef(null);
  const workspaceKey=JSON.stringify([scope,matchKey]);
  useEffect(()=>{setLocalSheet(null);setDialog(null);resolver.current?.(false);resolver.current=null;},[workspaceKey]);
  useEffect(()=>()=>{resolver.current?.(false);},[]);
  const currentSheet=localSheet?.matchKey===matchKey && (!sheet || localSheet.revision>=sheet.revision)?localSheet:sheet;
  const draftKit=buildKitRoster(participating,profiles,props.confirmedLineupSnapshot || {});
  const rosterMatches=currentSheet?.rosterSignature===kitRosterSignature(draftKit);
  const visibleKit=rosterMatches?currentSheet.teams:draftKit;
  const numberLabel=useMemo(()=>(raw,label,teamId="")=>labelWithNumber(visibleKit,raw,label,teamId),[JSON.stringify(visibleKit)]);
  const canVerify=Boolean(props.canControlCurrentLiveMatch && auth.currentUser?.uid && auth.currentUser.emailVerified);
  const openNumbers=(snapshots,continueLineup=false)=>{
    if(!canVerify)return Promise.resolve(false);
    const base=buildKitRoster(participating,profiles,snapshots || props.confirmedLineupSnapshot || {});
    const teams=base.map(team=>({...team,players:team.players.map(row=>{
      const saved=currentSheet?.teams?.find(item=>item.id===team.id)?.players.find(item=>item.key===row.key);
      return saved?{...row,number:saved.number,noNumberReason:saved.noNumberReason}:row;
    })}));
    return new Promise(resolve=>{resolver.current?.(false);resolver.current=resolve;setDialog({teams,snapshots,continueLineup});});
  };
  const confirmLineups=async snapshots=>openNumbers(snapshots,true);
  const saveNumbers=async teams=>{
    if(!auth.currentUser?.uid || !auth.currentUser.emailVerified)throw new Error("Sign in as the referee to verify kit.");
    const saved=scope.environment==="practice"?{teams,matchKey,rosterSignature:kitRosterSignature(teams),revision:(currentSheet?.revision || 0)+1,verifiedAtMs:Date.now()}:await verifyPlayerKit({scope,matchKey,teams,expectedRevision:currentSheet?.revision || 0});
    const snapshots=dialog?.snapshots || props.confirmedLineupSnapshot || {};
    const enriched=Object.fromEntries(Object.entries(snapshots).map(([teamId,snapshot])=>[teamId,{...snapshot,kitNumbers:teams.find(team=>team.id===teamId)?.players || [],kitVerification:{sheetId:saved.sheetId || "practice",revision:saved.revision,verifiedAtMs:saved.verifiedAtMs}}]));
    if(dialog?.continueLineup || Object.keys(snapshots).length)await props.onConfirmPreMatchLineups?.(enriched);
    setLocalSheet(saved);setDialog(null);resolver.current?.(enriched);resolver.current=null;
  };

  useEffect(()=>{
    if(props.awaitingKitVerification && canVerify && !dialog && !rosterMatches && profiles.length){
      openNumbers(props.confirmedLineupSnapshot || {});
    }
  },[props.awaitingKitVerification,canVerify,profiles.length,workspaceKey]);

  const sharedProps = {
    ...props,
    onConfirmPreMatchLineups:confirmLineups,
    onAddEvent:event=>{
      if(!rosterMatches){openNumbers(props.confirmedLineupSnapshot || {});return false;}
      const team=currentSheet.teams.find(item=>item.id===String(event.teamId || ""));
      const numberOf=name=>{const candidates=(team?.players || []).filter(row=>row.aliases.includes(String(name || "").trim().toLowerCase()));return candidates.length===1?candidates[0].number:null;};
      return props.onAddEvent?.({...event,playerNumber:numberOf(event.playerName || event.scorer),assistNumber:numberOf(event.assist),kitSheetId:currentSheet.sheetId || "",kitRevision:currentSheet.revision});
    },
    currentMatch: liveCurrentMatch,
    matchType: classification.matchMode,
    matchMode:
      liveCurrentMatch?.matchMode ||
      props.pendingMatchStartContext?.matchMode ||
      props.matchMode,
    gameFormat: classification.gameFormat,
    playersPerSide: classification.playersPerSide,
  };

  const LeagueMatchComponent =
    props.leagueMatchComponent || ThreeTeamLeagueLiveMatchPage;

  const routedLivePage =
    classification.matchMode === MATCH_MODE.LEAGUE
      ? <LeagueMatchComponent {...sharedProps} />
      : <FriendlyLiveMatchPage {...sharedProps} />;

  return (
    <>
      <PlayerNumberContext.Provider value={numberLabel}>
      {routedLivePage}
      </PlayerNumberContext.Provider>
      {props.canControlCurrentLiveMatch&&<div className={`live-kit-status ${rosterMatches?"":"is-unverified"}`}><div><strong>{rosterMatches?"Player numbers verified":"Player numbers need verification"}</strong><span className="muted">{sheetError || (rosterMatches?"The referee's match numbers appear beside player names.":"Check the actual shirts before confirming lineups.")}</span></div><button className="secondary-btn" type="button" disabled={!canVerify} onClick={()=>openNumbers(props.confirmedLineupSnapshot || {})}>Check / edit numbers</button></div>}
      {dialog&&<RefereeKitDialog key={workspaceKey} initialTeams={dialog.teams} scope={scope} onSave={saveNumbers} onCancel={()=>{setDialog(null);resolver.current?.(false);resolver.current=null;}}/>}

      <RefereeVarReview
        enabled={Boolean(props.canControlCurrentLiveMatch)}
        matchId={props.currentVideoHighlightsMatchId || ""}
        clubId={
          props.videoHighlightsClubId ||
          props.activeClubId ||
          "turf-kings"
        }
      />
    </>
  );
}

export default LiveMatchPage;