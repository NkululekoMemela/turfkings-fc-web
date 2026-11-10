import React from "react";

export default function FixtureCrests({teams}) {
  return <span className="field-tile-crests" aria-hidden="true">
    {teams.map(({id, badge, abbreviation, colour}, index) => <React.Fragment key={id || index}>
      {index > 0 && <small>vs</small>}
      <span className="field-tile-crest" style={colour ? {borderColor: colour} : undefined}>
        {badge ? <img src={badge} alt="" /> : abbreviation}
      </span>
    </React.Fragment>)}
  </span>;
}
