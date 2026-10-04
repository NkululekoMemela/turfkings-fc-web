import React from "react";
import FieldScheduleFixtures from "../components/FieldScheduleFixtures.jsx";

export default function VenueFixturesPage({
  venue, season, teams = [], myClubId = "", onBack,
}) {
  return (
    <div className="page field-fixtures-page"
      style={{width: "100%", minWidth: 0}}>
      <header className="header">
        <button type="button" className="secondary-btn" onClick={onBack}>
          ← Field Home
        </button>
        <h1>Fixtures</h1>
        <p className="muted">{venue?.name} · {season?.name || "Field League"}</p>
      </header>
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
