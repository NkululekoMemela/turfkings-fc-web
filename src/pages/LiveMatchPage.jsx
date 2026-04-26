import React from "react";
import ThreeTeamLeagueLiveMatchPage from "./ThreeTeamLeague_LiveMatchPage";
import FriendlyLiveMatchPage from "./Friendly_LiveMatchPage";
import { MATCH_MODE, buildMatchClassification } from "../core/matchConfig.js";

export function LiveMatchPage(props) {
  const classification = buildMatchClassification({
    matchMode:
      props.currentMatch?.matchMode ||
      props.pendingMatchStartContext?.matchMode ||
      props.matchMode,
    gameFormat:
      props.currentMatch?.gameFormat ||
      props.pendingMatchStartContext?.gameFormat ||
      props.gameFormat,
    legacyGameFormat:
      props.currentMatch?.matchMode ||
      props.pendingMatchStartContext?.matchMode ||
      props.currentMatch?.gameFormat ||
      props.pendingMatchStartContext?.gameFormat ||
      props.gameFormat,
  });

  const sharedProps = {
    ...props,
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