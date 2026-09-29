import React, { useEffect, useState } from "react";
import { watchLeagueVenues } from "../storage/leagueVenueRepository.js";

export default function ClubFieldPortal({ clubId, onEnterField, onExploreFields }) {
  const [fields, setFields] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!clubId) {
      setFields([]);
      return undefined;
    }

    return watchLeagueVenues(
      (venues) => {
        setFields(venues.filter((venue) =>
          (venue.league?.activeSeason?.clubIds || []).includes(clubId)
        ));
        setError("");
      },
      () => setError("Could not load this club's Fields right now.")
    );
  }, [clubId]);

  if (!clubId || !fields.length) return null;

  return (
    <div
      aria-label="Enter your club's Field league"
      style={{ display: "grid", gap: ".6rem", marginBottom: "1rem" }}
    >
      {fields.map((field) => (
        <button
          key={field.id}
          type="button"
          onClick={() => onEnterField?.(field)}
          style={{
            width: "100%",
            minHeight: "82px",
            padding: ".8rem 1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: ".8rem",
            textAlign: "left",
            color: "#fff",
            border: "1px solid rgba(251,191,36,.65)",
            borderRadius: "20px",
            background:
              "radial-gradient(circle at 88% 50%, rgba(251,191,36,.3), transparent 30%), linear-gradient(110deg, #16172d, #35203e)",
            boxShadow: "inset 0 0 22px rgba(251,191,36,.08), 0 12px 28px rgba(0,0,0,.2)",
            cursor: "pointer",
          }}
        >
          <span style={{ display: "grid", gap: ".2rem" }}>
            <small style={{ color: "#fbbf24", fontWeight: 800, letterSpacing: ".12em" }}>
              FIELD PORTAL
            </small>
            <strong style={{ fontSize: "1.12rem" }}>{field.name}</strong>
          </span>
          <span aria-hidden="true" style={{ fontSize: "1.6rem", color: "#fbbf24" }}>
            ↗
          </span>
        </button>
      ))}
    </div>
  );
}
