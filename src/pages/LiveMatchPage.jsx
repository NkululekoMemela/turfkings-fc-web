import React from "react";
import ThreeTeamLeagueLiveMatchPage from "./3TeamLeagueLiveMatchPage";
import FiveVFiveLiveMatchPage from "./5v5LiveMatchPage";

export function LiveMatchPage(props) {
  const matchMode =
    props.currentMatch?.matchMode ||
    props.pendingMatchStartContext?.matchMode ||
    "5_V_5";

  if (matchMode === "5_V_5") {
    return <FiveVFiveLiveMatchPage {...props} />;
  }

  return <ThreeTeamLeagueLiveMatchPage {...props} />;
}

export default LiveMatchPage;