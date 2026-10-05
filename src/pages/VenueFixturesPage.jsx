import React from "react";
import FieldScheduleFixtures from "../components/FieldScheduleFixtures.jsx";

export default function VenueFixturesPage({
  venue, season, teams = [], myClubId = "", onBack,
}) {
  return (
    <div className="page field-fixtures-page"
      style={{width: "100%", minWidth: 0}}>

      <section className="card" style={{minWidth: 0}}>
        {season ? (
          <FieldScheduleFixtures
            season={season}
            teams={teams}
            myClubId={myClubId}
            venueName={venue?.name || ""}
          />
        ) : <p className="muted">No active season yet.</p>}
      </section>
    </div>
  );
}
