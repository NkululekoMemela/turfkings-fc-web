import { FANM_NATIONAL_TEAMS, FANM_PRO_CLUBS } from "../data/fanm/fanmTeamLibrary.js";
import React, { useState } from "react";
import "./MatchTeamChooser.css";

function TeamBadge({ team }) {
  const [failedUrl, setFailedUrl] = useState("");
  const name = String(team?.name || team?.label || "Team");
  const normalize = value => String(value || "").trim().toLowerCase();
  const library = [...FANM_NATIONAL_TEAMS, ...FANM_PRO_CLUBS];
  const identity = library.find(item =>
    normalize(item.name) === normalize(team?.label) ||
    normalize(item.name) === normalize(team?.name)
  );
  const logo = [
    team?.transparentLogoUrl, team?.logoUrl, team?.branding?.logoUrl,
    team?.fantasyLogo32, team?.logo32, team?.image, team?.logo,
    identity?.fantasyLogo32, identity?.logo32,
  ].find(value => typeof value === "string" && value.trim());
  const flag = team?.flag || identity?.flag;
  const initials = name.split(/\s+/).filter(Boolean)
    .slice(0, 2).map(word => word[0]).join("").toUpperCase();
  return (
    <span className="match-team-chooser__badge" aria-hidden="true">
      {logo && logo !== failedUrl
        ? <img src={logo} alt="" onError={() => setFailedUrl(logo)} />
        : flag
        ? <span className="match-team-chooser__flag">{flag}</span>
        : <svg viewBox="0 0 64 72" fill="none">
            <path d="M32 3 58 12v22c0 16-13 28-26 35C19 62 6 50 6 34V12L32 3Z"
              fill="currentColor" fillOpacity=".13"
              stroke="currentColor" strokeWidth="2" />
            <text x="32" y="42" textAnchor="middle" fill="currentColor"
              fontSize="18" fontWeight="800">{initials || "FC"}</text>
          </svg>}
    </span>
  );
}

export default function MatchTeamChooser({
  label, value, teams = [], renderLabel, onChange, disabled, side,
}) {
  const selected = teams.find(team => String(team.id) === String(value));
  const nameOf = team => renderLabel
    ? renderLabel(team)
    : team.label || team.name || "Team";
  const identity = (
    <>
      <TeamBadge team={selected} />
      <span className="match-team-chooser__identity">
        <small>{label}</small>
        <strong>{selected ? nameOf(selected) : "Choose team"}</strong>
        <span>{disabled ? "Match pairing" : "Tap to choose"}</span>
      </span>
      {!disabled && <span className="match-team-chooser__arrow" aria-hidden="true">⌄</span>}
    </>
  );
  return (
    <div className={`match-team-chooser match-team-chooser--${side}`}>
      {disabled ? (
        <div className="match-team-chooser__card">{identity}</div>
      ) : (
        <details className="match-team-chooser__details">
          <summary className="match-team-chooser__card">{identity}</summary>
          <div className="match-team-chooser__options"
            role="group" aria-label={`Choose ${label.toLowerCase()}`}>
            <p>Select your team</p>
            {teams.map(team => (
              <button key={team.id} type="button"
                aria-pressed={String(team.id) === String(value)}
                onClick={event => {
                  const details = event.currentTarget.closest("details");
                  onChange?.({ target: { value: String(team.id) } });
                  if (details) {
                    details.open = false;
                    details.querySelector("summary")?.focus();
                  }
                }}>
                <TeamBadge team={team} />
                <strong>{nameOf(team)}</strong>
                <span aria-hidden="true">
                  {String(team.id) === String(value) ? "✓" : "›"}
                </span>
              </button>
            ))}
            {!teams.length && <p>No teams available yet.</p>}
          </div>
        </details>
      )}
    </div>
  );
}
