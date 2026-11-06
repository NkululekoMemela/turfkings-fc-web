// src/pages/LiveMatchPage.jsx
import React, {useEffect,useMemo,useState} from "react";
import {auth} from "../firebaseConfig.js";
import {useFootballProfiles,useMatchNumberSheet,verifyPlayerKit} from "../hooks/usePlayerKit.js";
import {buildKitRoster,kitRosterSignature,labelWithNumber,jerseyNumber,validateKitTeams,normalizeKitName} from "../core/playerKit.js";
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
  const matchKey=String(props.currentVideoHighlightsMatchId || props.videoHighlightsMatchId || props.matchId || liveCurrentMatch?.fixtureId || liveCurrentMatch?.id || `${scope.seasonId || "football"}__${new Date().toLocaleDateString("en-CA",{timeZone:"Africa/Johannesburg"})}__${props.currentMatchNo || 1}`);
  const rawTeams=props.pendingMatchStartContext?.teams || (classification.matchMode===MATCH_MODE.FRIENDLY && props.fiveVFiveTeams?.length?props.fiveVFiveTeams:props.teams) || [];
  const profiles=useFootballProfiles(rawTeams,scope.venueId?"":scope.clubId);
  const playingIds=[liveCurrentMatch?.teamAId || liveCurrentMatch?.clubAId,liveCurrentMatch?.teamBId || liveCurrentMatch?.clubBId].filter(Boolean).map(String);
  const participating=rawTeams.filter(team=>!playingIds.length || playingIds.includes(String(team.id))).slice(0,2);
  const boothNumbers=Boolean(scope.venueId)&&scope.environment!=="practice"&&props.currentLive?.boothVersion===1;
  const {sheet,error:sheetError}=useMatchNumberSheet(boothNumbers?{...scope,environment:"practice"}:scope,matchKey);
  const [localSheet,setLocalSheet]=useState(null),[overrides,setOverrides]=useState({}),[numberError,setNumberError]=useState("");
  const workspaceKey=JSON.stringify([scope,matchKey]);
  useEffect(()=>{setLocalSheet(null);setOverrides({});setNumberError("");},[workspaceKey]);
  const numbersEnabled=Boolean(scope.venueId)||rawTeams.some(team=>team.usePlayerNumbers!==false);
  const snapshotTeams=participating.map(team=>({id:String(team.id),players:props.confirmedLineupSnapshot?.[team.id]?.kitNumbers||[]}));
  const snapshotSheet=boothNumbers&&snapshotTeams.length===2&&snapshotTeams.every(team=>team.players.length&&props.confirmedLineupSnapshot?.[team.id]?.kitVerification)
    ? {teams:snapshotTeams,matchKey,rosterSignature:kitRosterSignature(snapshotTeams),revision:Math.max(...snapshotTeams.map(team=>props.confirmedLineupSnapshot?.[team.id]?.kitVerification?.revision||1))} : null;
  const storedSheet=boothNumbers?snapshotSheet:sheet;
  const currentSheet=localSheet?.matchKey===matchKey&&(!storedSheet||localSheet.revision>=storedSheet.revision)?localSheet:storedSheet;
  const draftKit=buildKitRoster(participating,profiles,props.confirmedLineupSnapshot||{});
  const applyNumbers=teams=>teams.map(team=>({...team,players:team.players.map(row=>({...row,number:!numbersEnabled?null:Object.hasOwn(overrides,`${team.id}:${row.key}`)?overrides[`${team.id}:${row.key}`]:row.number,noNumberReason:!numbersEnabled?"not_used":row.noNumberReason||"not_recorded"}))}));
  const rosterMatches=currentSheet?.rosterSignature===kitRosterSignature(draftKit);
  const visibleKit=applyNumbers(rosterMatches?currentSheet.teams:draftKit);
  const canVerify=Boolean(props.canControlCurrentLiveMatch&&auth.currentUser?.uid&&auth.currentUser.emailVerified);
  const saveNumbers=async(teams,snapshots=props.confirmedLineupSnapshot||{})=>{
    if(!canVerify)throw Error("Sign in as the controlling referee to update numbers.");
    const checked=validateKitTeams(teams,{referee:true,requireNumbered:Boolean(scope.venueId)&&scope.environment!=="practice"});
    const saved=(scope.environment==="practice"||boothNumbers)?{teams:checked,matchKey,rosterSignature:kitRosterSignature(checked),revision:(currentSheet?.revision||0)+1,verifiedAtMs:Date.now()}:await verifyPlayerKit({scope,matchKey,teams:checked,expectedRevision:currentSheet?.revision||0});
    const enriched=Object.fromEntries(Object.entries(snapshots).map(([teamId,snapshot])=>[teamId,{...snapshot,kitNumbers:checked.find(team=>team.id===teamId)?.players||[],kitVerification:{sheetId:saved.sheetId||(boothNumbers?`field-booth-${matchKey}`:"practice"),revision:saved.revision,verifiedAtMs:saved.verifiedAtMs}}]));
    await props.onConfirmPreMatchLineups?.(enriched);setLocalSheet(saved);setOverrides({});setNumberError("");return enriched;
  };
  const confirmLineups=async snapshots=>saveNumbers(applyNumbers(buildKitRoster(participating,profiles,snapshots)),snapshots);
  const editNumber=async(teamId,key,value)=>{
    const number=jerseyNumber(value),next=visibleKit.map(team=>team.id!==String(teamId)?team:{...team,players:team.players.map(row=>row.key!==key?row:{...row,number,noNumberReason:number===null?"not_recorded":""})});
    validateKitTeams(next);
    if(rosterMatches)await saveNumbers(next);else setOverrides(old=>({...old,[`${teamId}:${key}`]:number}));
  };
  const numberLabel=useMemo(()=>(raw,label,teamId="")=>numbersEnabled?labelWithNumber(visibleKit,raw,label,teamId):label,[JSON.stringify(visibleKit),numbersEnabled]);
  numberLabel.enabled=numbersEnabled;numberLabel.canEdit=canVerify;numberLabel.edit=editNumber;
  numberLabel.resolve=(raw,teamId)=>visibleKit.filter(team=>!teamId||team.id===String(teamId)).flatMap(team=>team.players).find(row=>row.key===raw||(row.aliases||[]).includes(normalizeKitName(raw)));

  const sharedProps = {
    ...props,
    onConfirmPreMatchLineups:confirmLineups,
    onAddEvent:event=>{
      if(!rosterMatches){setNumberError("Confirm the lineups before recording events.");return false;}
      const team=currentSheet.teams.find(item=>item.id===String(event.teamId || ""));
      const numberOf=name=>{if(!numbersEnabled)return null;const candidates=(team?.players || []).filter(row=>row.aliases.includes(String(name || "").trim().toLowerCase()));return candidates.length===1?candidates[0].number:null;};
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
      {(numberError||sheetError)&&canVerify&&<p className="live-number-note" role="alert">{numberError||sheetError}</p>}

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