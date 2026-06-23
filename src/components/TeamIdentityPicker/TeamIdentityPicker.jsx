import React, { useMemo, useState } from "react";
import {
  FANM_NATIONAL_TEAMS,
  FANM_PRO_CLUBS,
  groupBy,
} from "../../data/fanm/fanmTeamLibrary.js";
import "./TeamIdentityPicker.css";

export default function TeamIdentityPicker({ open, onClose, onSelect, selectedIdentity }) {
  const [tab, setTab] = useState("national");
  const [search, setSearch] = useState("");

  const source = tab === "national" ? FANM_NATIONAL_TEAMS : FANM_PRO_CLUBS;
  const groupKey = tab === "national" ? "region" : "leagueGroup";

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? source.filter(
          (team) =>
            team.name.toLowerCase().includes(q) ||
            team.abbr.toLowerCase().includes(q)
        )
      : source;

    return groupBy(filtered, groupKey);
  }, [source, groupKey, search]);

  if (!open) return null;

  return (
    <div className="fanm-team-picker-backdrop" onClick={onClose}>
      <div className="fanm-team-picker-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="fanm-team-picker-head">
          <div>
            <strong>Choose team identity</strong>
            <span>National flags or professional club badges.</span>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </div>

        <div className="fanm-team-picker-tabs">
          <button
            type="button"
            className={tab === "national" ? "active" : ""}
            onClick={() => setTab("national")}
          >
            National teams
          </button>
          <button
            type="button"
            className={tab === "club" ? "active" : ""}
            onClick={() => setTab("club")}
          >
            Club teams
          </button>
        </div>

        <input
          className="fanm-team-picker-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={
            tab === "national"
              ? "Search RSA, Brazil, France..."
              : "Search BAR, PSG, Liverpool..."
          }
        />

        <div className="fanm-team-picker-list">
          {Object.entries(groups).map(([group, teams]) => (
            <section key={group}>
              <h4>{group}</h4>
              <div className="fanm-team-picker-grid">
                {teams.map((team) => {
                  const isSelected =
                    selectedIdentity?.type === team.type &&
                    selectedIdentity?.abbr === team.abbr;

                  return (
                    <button
                      type="button"
                      key={`${team.type}-${team.abbr}`}
                      className={`fanm-team-picker-option${isSelected ? " is-selected" : ""}`}
                      onClick={() => onSelect(team)}
                    >
                      <span className="fanm-team-picker-badge">
                        {team.type === "club" ? (
                          <img src={team.logo32} alt="" />
                        ) : (
                          <span className="fanm-team-picker-flag">{team.flag}</span>
                        )}
                      </span>

                      <span className="fanm-team-picker-copy">
                        <strong>{team.abbr}</strong>
                        <em>{team.name}</em>
                      </span>

                      {isSelected ? <span className="fanm-team-picker-check">✓</span> : null}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
