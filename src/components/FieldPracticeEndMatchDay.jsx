import React from "react";
import FieldEndMatchDay from "./FieldEndMatchDay.jsx";

export default function FieldPracticeEndMatchDay({venue, season, scope, onClose}) {
  if (scope?.environment !== "practice" ||
      scope.venueId !== venue?.id || scope.seasonId !== season?.id) {
    throw new Error("End Match Day requires the current Field Practice scope.");
  }
  return <FieldEndMatchDay venue={venue} season={season} scope={scope}
    canDiscard onClose={onClose}/>;
}
