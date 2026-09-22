import React, {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "../firebaseConfig.js";
import {
  buildVenueLeagueStandings,
} from "../core/venueLeagueStandings.js";
import "./VenueLeagueStatsPage.css";

const TABS = [
  ["teams", "Team Standings"],
  ["results", "Match Results"],
  ["goals", "Top Scorers"],
  ["assists", "Playmakers"],
  ["cleansheets", "Clean Sheets"],
  ["combined", "Summary Player Stats"],
];

function clean(value) {
  return String(value || "").trim();
}

function seasonLabel(season) {
  return clean(
    season?.name ||
    season?.title ||
    season?.label ||
    season?.seasonId ||
    season?.id
  ) || "Current Field season";
}

export default function VenueLeagueStatsPage({
  venue = null,
  season = null,
  clubs = [],
  onBack,
}) {
  const [activeTab, setActiveTab] = useState("teams");
  const [viewMode, setViewMode] = useState("season");
  const [seasonMode, setSeasonMode] = useState("current");

  const results = Array.isArray(season?.results)
    ? season.results
    : [];

  const [clubLogos, setClubLogos] = useState({});

  useEffect(() => {
    let cancelled = false;

    const uniqueClubs = Array.from(
      new Map(
        clubs
          .filter((club) => clean(club?.id))
          .map((club) => [clean(club.id), club])
      ).values()
    );

    Promise.all(
      uniqueClubs.map(async (club) => {
        try {
          const snapshot = await getDoc(
            doc(db, "clubs", clean(club.id))
          );

          if (!snapshot.exists()) {
            return [clean(club.id), ""];
          }

          const data = snapshot.data() || {};
          const logoUrl = clean(
            data?.branding?.logoUrl ||
            data?.logoUrl ||
            data?.image ||
            data?.teamPhoto
          );

          return [clean(club.id), logoUrl];
        } catch {
          return [clean(club.id), ""];
        }
      })
    ).then((entries) => {
      if (!cancelled) {
        setClubLogos(Object.fromEntries(entries));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [clubs]);

  const standings = useMemo(
    () =>
      buildVenueLeagueStandings({
        clubs,
        results,
      }),
    [clubs, results]
  );

  const activeTabLabel =
    TABS.find(([id]) => id === activeTab)?.[1] ||
    "Team Standings";

  return (
    <main className="venue-stats-page">
      <header className="venue-stats-header">
        <h1>Stats &amp; Leaderboards</h1>

        <button
          type="button"
          className="venue-stats-home"
          onClick={onBack}
          aria-label="Return to Field home"
          title="Return to Field home"
        >
          🏠
        </button>
      </header>

      <section className="venue-stats-card">
        <h2>Season</h2>

        <p className="venue-stats-muted">
          <strong>
            {seasonMode === "current"
              ? "Current season"
              : "Previous season"}
          </strong>
          {" • "}
          {viewMode === "season"
            ? "Full season"
            : "Current week"}
          {" • "}
          {seasonLabel(season)}
        </p>

        <div className="venue-stats-segment">
          <button
            type="button"
            className={
              seasonMode === "current" ? "is-active" : ""
            }
            onClick={() => setSeasonMode("current")}
          >
            Current
          </button>

          <button
            type="button"
            className={
              seasonMode === "previous" ? "is-active" : ""
            }
            onClick={() => setSeasonMode("previous")}
          >
            Previous
          </button>
        </div>
      </section>

      <section className="venue-stats-card">
        <h2>View</h2>

        <div className="venue-stats-segment">
          <button
            type="button"
            className={
              viewMode === "current" ? "is-active" : ""
            }
            onClick={() => setViewMode("current")}
          >
            Current week
          </button>

          <button
            type="button"
            className={
              viewMode === "season" ? "is-active" : ""
            }
            onClick={() => setViewMode("season")}
          >
            Full season
          </button>
        </div>

        <nav className="venue-stats-tabs">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={
                activeTab === id ? "is-active" : ""
              }
              onClick={() => setActiveTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      </section>

      <section className="venue-stats-card venue-stats-content">
        <h2>
          {activeTabLabel}
          {activeTab === "teams"
            ? seasonMode === "current"
              ? " — Current Season"
              : " — Previous Season"
            : ""}
        </h2>

        <p className="venue-stats-muted">
          {clean(venue?.name) || "Field League"}
          {" • "}
          {seasonLabel(season)}
        </p>

        {activeTab === "teams" ? (
          <div className="venue-table-wrap">
            <table className="venue-standings-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Club</th>
                  <th>Pts</th>
                  <th>P</th>
                  <th>W</th>
                  <th>D</th>
                  <th>L</th>
                  <th>GF</th>
                  <th>GA</th>
                  <th>GD</th>
                </tr>
              </thead>

              <tbody>
                {standings.map((club, index) => (
                  <tr key={club.id}>
                    <td>{index + 1}</td>
                    <td className="venue-club-cell">
                      {(
                        clubLogos[club.id] ||
                        club.logo
                      ) ? (
                        <img
                          src={
                            clubLogos[club.id] ||
                            club.logo
                          }
                          alt={`${club.name} logo`}
                          className="venue-club-logo"
                        />
                      ) : (
                        <span
                          className="venue-club-logo venue-club-logo-fallback"
                          aria-hidden="true"
                        >
                          ⚽
                        </span>
                      )}

                      <strong>{club.name}</strong>
                    </td>
                    <td>{club.points}</td>
                    <td>{club.played}</td>
                    <td>{club.won}</td>
                    <td>{club.drawn}</td>
                    <td>{club.lost}</td>
                    <td>{club.goalsFor}</td>
                    <td>{club.goalsAgainst}</td>
                    <td>{club.goalDifference}</td>
                  </tr>
                ))}

                {standings.length === 0 ? (
                  <tr>
                    <td colSpan="10">
                      No clubs have joined this Field season yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="venue-stats-next-stage">
            <strong>{activeTabLabel}</strong>
            <p>
              This Field League section will populate from
              completed fixture events.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
