// src/components/home/HomeClubDiscovery.jsx
import React, { useMemo, useState } from "react";
import HomeClubTile from "./HomeClubTile.jsx";

export default function HomeClubDiscovery({ clubs = [], onRegisterClub, onViewClub, onJoinClub, onChallengeClub }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  const filteredClubs = useMemo(() => {
    const safeQuery = query.trim().toLowerCase();

    return clubs.filter((club) => {
      const text = [club.name, club.location, club.area, club.mood, club.activity, club.helpNeeded ? "help short spots" : ""]
        .join(" ")
        .toLowerCase();
      const matchesQuery = !safeQuery || text.includes(safeQuery);
      const matchesFilter = filter === "all" || text.includes(filter);
      return matchesQuery && matchesFilter;
    });
  }, [clubs, query, filter]);

  return (
    <section className="fanm-section fanm-section--clubs" id="clubs">
      <div className="fanm-section-head">
        <div>
          <span className="fanm-kicker">Club discovery</span>
          <h2>Search clubs near you</h2>
        </div>
        <p>
          Players can find nearby clubs and help teams that are short for upcoming games.
        </p>
      </div>

      <div className="fanm-discovery-tools">
        <label className="fanm-search-box">
          <span>Search by club or location</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cape Town, Claremont, Turf Kings..."
          />
        </label>

        <div className="fanm-filter-row" aria-label="Club filters">
          {[
            ["all", "All"],
            ["social", "Social"],
            ["competitive", "Competitive"],
            ["help", "Short squads"],
            ["welcome", "New players"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={filter === value ? "is-active" : ""}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="fanm-club-grid">
        <button type="button" className="fanm-register-club-tile" onClick={onRegisterClub}>
          <span>+</span>
          <strong>Register your club</strong>
          <small>Free for captains. Create a club page and invite players.</small>
        </button>

        {filteredClubs.map((club) => (
          <HomeClubTile
            key={club.id}
            club={club}
            onViewClub={onViewClub}
            onJoinClub={onJoinClub}
            onChallengeClub={onChallengeClub}
          />
        ))}
      </div>
    </section>
  );
}