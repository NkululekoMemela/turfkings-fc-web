import React from "react";
import "./LeagueVenuesHub.css";

export default function VenueEntryPage({ venue, onBack }) {
  if (!venue) return null;

  const place = [venue.location?.suburb, venue.location?.city]
    .filter(Boolean).join(", ");

  return (
    <main className="fanm-venue-entry">
      <div className="fanm-venue-entry__shell">
        <button type="button" onClick={onBack}>← League venues</button>
        <span className="fanm-venue-entry__kicker">5 ASIDES NEAR ME · LEAGUE VENUE</span>
        <div className="fanm-venue-entry__badge">
          {venue.name.trim().charAt(0).toUpperCase()}
        </div>
        <h1>{venue.name}</h1>
        <p>{place || "Location to be confirmed"}</p>
        <section>
          <h2>Welcome to {venue.name}</h2>
          <p>This venue's league seasons, club invitations and field news
            will live here as its manager sets them up.</p>
          {venue.websiteUrl && (
            <a href={venue.websiteUrl} target="_blank" rel="noreferrer">
              Visit the venue website ↗
            </a>
          )}
        </section>
      </div>
    </main>
  );
}
