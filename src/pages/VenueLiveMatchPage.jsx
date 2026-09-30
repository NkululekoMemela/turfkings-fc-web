// src/pages/LiveMatchPage.jsx
import React from "react";
import VenueLeagueLiveMatchPage from "./VenueLeagueLiveMatchPage.jsx";
import { buildMatchClassification } from "../core/matchConfig.js";
import RefereeVarReview from "../components/RefereeVarReview.jsx";

export function VenueLiveMatchPage(props) {
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

  /*
   * A Field season is always a League competition.
   * Never fall through to the Club Friendly runtime.
   */
  const routedLivePage = (
    <VenueLeagueLiveMatchPage {...sharedProps} />
  );

  return (
    <>
      {routedLivePage}

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

export default VenueLiveMatchPage;