// src/pages/LiveMatchPage.jsx
import React from "react";
import ThreeTeamLeagueLiveMatchPage from "./ThreeTeamLeague_LiveMatchPage.jsx";
import FriendlyLiveMatchPage from "./Friendly_LiveMatchPage";
import { MATCH_MODE, buildMatchClassification } from "../core/matchConfig.js";

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

  const sharedProps = {
    ...props,
    currentMatch: liveCurrentMatch,
    matchType: classification.matchMode,
    matchMode:
      liveCurrentMatch?.matchMode ||
      props.pendingMatchStartContext?.matchMode ||
      props.matchMode,
    gameFormat: classification.gameFormat,
    playersPerSide: classification.playersPerSide,
  };

  if (classification.matchMode === MATCH_MODE.LEAGUE) {
    return <ThreeTeamLeagueLiveMatchPage {...sharedProps} />;
  }

  return <FriendlyLiveMatchPage {...sharedProps} />;
}

export default LiveMatchPage;