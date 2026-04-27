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

  const classification = buildMatchClassification({
    matchMode:
      liveCurrentMatch?.matchMode ||
      props.pendingMatchStartContext?.matchMode ||
      props.matchMode,
    gameFormat:
      liveCurrentMatch?.gameFormat ||
      props.pendingMatchStartContext?.gameFormat ||
      props.gameFormat,
    legacyGameFormat:
      liveCurrentMatch?.matchMode ||
      props.pendingMatchStartContext?.matchMode ||
      liveCurrentMatch?.gameFormat ||
      props.pendingMatchStartContext?.gameFormat ||
      props.gameFormat,
  });

  const sharedProps = {
    ...props,
    currentMatch: liveCurrentMatch,
    matchMode: classification.matchMode,
    gameFormat: classification.gameFormat,
    playersPerSide: classification.playersPerSide,
  };

  if (classification.matchMode === MATCH_MODE.LEAGUE) {
    return <ThreeTeamLeagueLiveMatchPage {...sharedProps} />;
  }

  return <FriendlyLiveMatchPage {...sharedProps} />;
}

export default LiveMatchPage;