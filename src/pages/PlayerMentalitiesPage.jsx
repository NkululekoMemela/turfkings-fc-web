// src/pages/PlayerMentalitiesPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";

import { db } from "../firebaseConfig.js";
import {
  getPlayerDoc,
  getPlayersCollection,
} from "../core/clubFirestorePaths.js";

const MENTALITY_OPTIONS = [
  { value: 1, label: "Very Defensive" },
  { value: 2, label: "Defensive" },
  { value: 3, label: "Balanced" },
  { value: 4, label: "Attacking" },
  { value: 5, label: "Very Attacking" },
];

const SHOOTING_OPTIONS = [
  { value: 1, label: "Rarely Shoots" },
  { value: 2, label: "Low" },
  { value: 3, label: "Moderate" },
  { value: 4, label: "Shoots Often" },
  { value: 5, label: "Very High" },
];

function titleCase(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function keyOf(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function hasSavedValue(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 5;
}

function validValue(value) {
  return hasSavedValue(value) ? Number(value) : 3;
}

function initials(name) {
  return String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function playerKeys(player) {
  return new Set(
    [
      player?.id,
      player?.fullName,
      player?.shortName,
      ...(Array.isArray(player?.aliases) ? player.aliases : []),
    ]
      .map(keyOf)
      .filter(Boolean)
  );
}

function squadEntryKeys(entry) {
  if (typeof entry === "string") {
    return [keyOf(entry)].filter(Boolean);
  }

  return [
    entry?.id,
    entry?.playerId,
    entry?.memberId,
    entry?.fullName,
    entry?.displayName,
    entry?.shortName,
    entry?.name,
  ]
    .map(keyOf)
    .filter(Boolean);
}

export function PlayerMentalitiesPage({
  activeClubId = "turf-kings",
  activeClub = null,
  identity = null,
  isPracticeMode = false,
  playerPhotosByName = {},
  teams = [],
  matchType = "FRIENDLY",
  onBack,
}) {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [savingKey, setSavingKey] = useState("");
  const [message, setMessage] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");
  const [profileFilter, setProfileFilter] = useState("all");

  const activeRole = String(
    identity?.actingRole || identity?.role || ""
  ).toLowerCase();

  const canEdit =
    !isPracticeMode &&
    (activeRole === "admin" || activeRole === "captain");

  useEffect(() => {
    setLoading(true);
    setLoadError("");

    return onSnapshot(
      getPlayersCollection(db, activeClubId),
      (snapshot) => {
        const nextPlayers = snapshot.docs
          .map((playerDoc) => {
            const data = playerDoc.data() || {};
            const fullName = titleCase(
              data.fullName ||
                data.displayName ||
                data.name ||
                data.playerName ||
                playerDoc.id
            );

            const mentalityConfigured = hasSavedValue(data.mentality);
            const shootingConfigured = hasSavedValue(data.shooting);

            return {
              id: playerDoc.id,
              fullName,
              shortName: titleCase(
                data.shortName ||
                  data.name ||
                  data.displayName ||
                  fullName
              ),
              aliases: Array.isArray(data.aliases) ? data.aliases : [],
              status: data.status || "active",
              mentality: validValue(data.mentality),
              shooting: validValue(data.shooting),
              mentalityConfigured,
              shootingConfigured,
              profileComplete:
                mentalityConfigured && shootingConfigured,
            };
          })
          .filter(
            (player) =>
              String(player.status || "active").toLowerCase() === "active"
          )
          .sort((a, b) => a.fullName.localeCompare(b.fullName));

        setPlayers(nextPlayers);
        setLoading(false);
      },
      (error) => {
        console.error("Failed to load player behaviour profiles:", error);
        setLoadError("Could not load the player profiles.");
        setLoading(false);
      }
    );
  }, [activeClubId]);

  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setMessage(""), 2400);
    return () => window.clearTimeout(timer);
  }, [message]);

  const teamProfiles = useMemo(() => {
    return (Array.isArray(teams) ? teams : [])
      .filter((team) => !team?.isGuestOpponent && !team?.temporaryGuestOpponent)
      .map((team, index) => {
        const keys = new Set();

        (Array.isArray(team?.players) ? team.players : []).forEach((entry) => {
          squadEntryKeys(entry).forEach((key) => keys.add(key));
        });

        return {
          id: String(team?.id || `team-${index}`),
          label: String(
            team?.label ||
              team?.teamName ||
              team?.name ||
              `Team ${index + 1}`
          ).trim(),
          color:
            team?.teamColorHex ||
            team?.colorHex ||
            "#60a5fa",
          keys,
        };
      })
      .filter((team) => team.keys.size > 0);
  }, [teams]);

  const playerTeamMap = useMemo(() => {
    const result = new Map();

    players.forEach((player) => {
      const keys = playerKeys(player);
      const matches = teamProfiles.filter((team) =>
        Array.from(keys).some((key) => team.keys.has(key))
      );

      result.set(player.id, matches);
    });

    return result;
  }, [players, teamProfiles]);

  const scopedPlayers = useMemo(() => {
    if (teamFilter === "all") return players;

    if (teamFilter === "unseeded") {
      return players.filter(
        (player) => (playerTeamMap.get(player.id) || []).length === 0
      );
    }

    return players.filter((player) =>
      (playerTeamMap.get(player.id) || []).some(
        (team) => team.id === teamFilter
      )
    );
  }, [players, playerTeamMap, teamFilter]);

  const completedCount = scopedPlayers.filter(
    (player) => player.profileComplete
  ).length;

  const progressPercent = scopedPlayers.length
    ? Math.round((completedCount / scopedPlayers.length) * 100)
    : 0;

  const visiblePlayers = useMemo(() => {
    const filtered = scopedPlayers.filter((player) => {
      if (profileFilter === "needs-setup") {
        return !player.profileComplete;
      }

      if (profileFilter === "complete") {
        return player.profileComplete;
      }

      return true;
    });

    return filtered.sort((a, b) => {
      const aSeeded = (playerTeamMap.get(a.id) || []).length > 0;
      const bSeeded = (playerTeamMap.get(b.id) || []).length > 0;

      if (aSeeded !== bSeeded) return aSeeded ? -1 : 1;
      return a.fullName.localeCompare(b.fullName);
    });
  }, [scopedPlayers, profileFilter, playerTeamMap]);

  const photoEntries = useMemo(
    () => Object.entries(playerPhotosByName || {}),
    [playerPhotosByName]
  );

  const getPhoto = (player) => {
    const candidates = playerKeys(player);
    const match = photoEntries.find(([name]) =>
      candidates.has(keyOf(name))
    );
    return match?.[1] || null;
  };

  const saveProfileValue = async (player, field, value) => {
    if (!canEdit || !player?.id) return;

    const nextValue = validValue(value);
    const operationKey = `${player.id}:${field}`;

    setSavingKey(operationKey);
    setMessage("");

    try {
      await setDoc(
        getPlayerDoc(db, player.id, activeClubId),
        {
          [field]: nextValue,
          [`${field}UpdatedAt`]: serverTimestamp(),
          [`${field}UpdatedByEmail`]:
            String(identity?.email || "").trim() || null,
        },
        { merge: true }
      );

      const options =
        field === "mentality"
          ? MENTALITY_OPTIONS
          : SHOOTING_OPTIONS;

      const label =
        options.find((option) => option.value === nextValue)?.label || "";

      setMessage(`✓ ${player.shortName || player.fullName}: ${label}`);
    } catch (error) {
      console.error(`Failed to save player ${field}:`, error);
      setMessage("Could not save the change. Please try again.");
    } finally {
      setSavingKey("");
    }
  };

  const renderScale = ({
    player,
    field,
    options,
    title,
    leftIcon,
    leftLabel,
    rightLabel,
    rightIcon,
  }) => {
    const selected = validValue(player[field]);
    const configured =
      field === "mentality"
        ? player.mentalityConfigured
        : player.shootingConfigured;
    const busy = savingKey === `${player.id}:${field}`;

    return (
      <div className={`pm-scale ${configured ? "" : "needs-choice"}`}>
        <div className="pm-scale-copy">
          <div>
            <strong>{title}</strong>
            {!configured ? <i>Choose</i> : null}
          </div>
          <span>
            {options.find((option) => option.value === selected)?.label}
          </span>
        </div>

        <div className="pm-scale-control">
          <div className="pm-scale-ends">
            <span>{leftIcon} {leftLabel}</span>
            <span>{rightLabel} {rightIcon}</span>
          </div>

          <div className="pm-points">
            {options.map((option) => (
              <button
                key={`${player.id}-${field}-${option.value}`}
                type="button"
                className={
                  selected === option.value && configured
                    ? "is-selected"
                    : ""
                }
                disabled={!canEdit || busy}
                title={option.label}
                aria-label={`${player.fullName} ${field}: ${option.label}`}
                aria-pressed={selected === option.value && configured}
                onClick={() =>
                  saveProfileValue(player, field, option.value)
                }
              >
                <span>{option.value}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderPlayer = (player) => {
    const photo = getPhoto(player);
    const assignedTeams = playerTeamMap.get(player.id) || [];

    return (
      <article
        className={`pm-card ${
          player.profileComplete ? "is-complete" : "needs-setup"
        }`}
        key={player.id}
      >
        <div className="pm-player-head">
          <div
            className={`pm-avatar ${photo ? "has-photo" : ""}`}
            style={photo ? { backgroundImage: `url(${photo})` } : undefined}
          >
            {!photo ? initials(player.fullName) : null}
          </div>

          <div className="pm-player-copy">
            <h2>{player.fullName}</h2>

            <div className="pm-team-line">
              {assignedTeams.length ? (
                assignedTeams.map((team) => (
                  <span key={`${player.id}-${team.id}`}>
                    <i style={{ background: team.color }} />
                    {team.label}
                  </span>
                ))
              ) : (
                <span className="pm-unseeded">Unseeded player</span>
              )}
            </div>
          </div>

          <div
            className={`pm-status ${
              player.profileComplete ? "complete" : "pending"
            }`}
          >
            {player.profileComplete ? "✓ Complete" : "Needs setup"}
          </div>
        </div>

        <div className="pm-profile-controls">
          {renderScale({
            player,
            field: "mentality",
            options: MENTALITY_OPTIONS,
            title: "Mentality",
            leftIcon: "🛡️",
            leftLabel: "Defensive",
            rightLabel: "Attacking",
            rightIcon: "⚔️",
          })}

          {renderScale({
            player,
            field: "shooting",
            options: SHOOTING_OPTIONS,
            title: "Shooting",
            leftIcon: "🤝",
            leftLabel: "Pass-first",
            rightLabel: "Shoot-first",
            rightIcon: "🎯",
          })}
        </div>
      </article>
    );
  };

  const clubName = String(
    activeClub?.name || activeClub?.clubName || "the club"
  ).trim();

  const selectedTeamName =
    teamFilter === "all"
      ? "All teams"
      : teamFilter === "unseeded"
        ? "Unseeded"
        : teamProfiles.find((team) => team.id === teamFilter)?.label ||
          "Selected team";

  return (
    <main className="pm-page">
      <header className="pm-header">
        <button type="button" className="pm-back" onClick={onBack}>
          ← Back
        </button>

        <div className="pm-heading">
          <div className="pm-title-icon" aria-hidden="true">🧠</div>

          <div>
            <p>Player behaviour profiles</p>
            <h1>Mentality &amp; Shooting</h1>
            <span>
              Shape how every player naturally fits into the formation.
            </span>
          </div>
        </div>
      </header>

      <section className="pm-command-centre">
        <div className="pm-progress-copy">
          <div>
            <span>Profile progress</span>
            <strong>{selectedTeamName}</strong>
          </div>

          <b>
            {completedCount}/{scopedPlayers.length}
            <small> complete</small>
          </b>
        </div>

        <div
          className="pm-progress-track"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={progressPercent}
        >
          <span style={{ width: `${progressPercent}%` }} />
        </div>

        <div className="pm-team-filters" aria-label="Filter by team">
          <button
            type="button"
            className={teamFilter === "all" ? "active" : ""}
            onClick={() => setTeamFilter("all")}
          >
            All teams
          </button>

          {teamProfiles.map((team) => (
            <button
              key={team.id}
              type="button"
              className={teamFilter === team.id ? "active" : ""}
              onClick={() => setTeamFilter(team.id)}
            >
              <i style={{ background: team.color }} />
              {team.label}
            </button>
          ))}

          <button
            type="button"
            className={teamFilter === "unseeded" ? "active" : ""}
            onClick={() => setTeamFilter("unseeded")}
          >
            Unseeded
          </button>
        </div>

        <div className="pm-workflow-filters">
          {[
            ["all", "All profiles"],
            ["needs-setup", "Needs setup"],
            ["complete", "Complete"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={profileFilter === value ? "active" : ""}
              onClick={() => setProfileFilter(value)}
            >
              {label}
              {value === "needs-setup" ? (
                <span>{scopedPlayers.length - completedCount}</span>
              ) : value === "complete" ? (
                <span>{completedCount}</span>
              ) : null}
            </button>
          ))}
        </div>
      </section>

      <div className="pm-access">
        <i />
        {isPracticeMode
          ? "Official profiles · read-only in Practice"
          : canEdit
            ? `Editing ${clubName}`
            : "View only · captains and admins can edit"}
      </div>

      {message ? (
        <div className="pm-toast" role="status" aria-live="polite">
          {message}
        </div>
      ) : null}

      {loading ? (
        <div className="pm-empty">Loading player profiles…</div>
      ) : loadError ? (
        <div className="pm-empty error">{loadError}</div>
      ) : visiblePlayers.length === 0 ? (
        <div className="pm-empty">
          <span>✓</span>
          <strong>
            {profileFilter === "needs-setup"
              ? "Every visible profile is complete"
              : "No players match these filters"}
          </strong>
          <p>Choose another team or profile filter.</p>
        </div>
      ) : (
        <section className="pm-list">
          {visiblePlayers.map(renderPlayer)}
        </section>
      )}

      <style>{`
        .pm-page {
          width: min(760px, calc(100% - 18px));
          margin: 0 auto;
          padding: 9px 0 34px;
          color: #edf5ff;
        }

        .pm-header {
          padding: 13px 15px 15px;
          border: 1px solid rgba(96,165,250,.3);
          border-radius: 20px;
          background:
            radial-gradient(circle at 90% 0%, rgba(37,99,235,.34), transparent 46%),
            linear-gradient(145deg, #1e3f88, #162c52 64%, #10233f);
          box-shadow: 0 14px 34px rgba(2,6,23,.3);
        }

        .pm-back {
          min-height: 30px;
          padding: 4px 10px;
          border: 1px solid rgba(191,219,254,.22);
          border-radius: 999px;
          background: rgba(7,18,38,.38);
          color: #edf6ff;
          font-size: .72rem;
          font-weight: 850;
        }

        .pm-heading {
          display: flex;
          align-items: center;
          gap: 11px;
          margin-top: 8px;
        }

        .pm-title-icon {
          display: grid;
          place-items: center;
          flex: 0 0 46px;
          width: 46px;
          height: 46px;
          border-radius: 15px;
          background: linear-gradient(145deg, #3867ff, #7846ee);
          box-shadow: 0 8px 20px rgba(67,56,202,.34);
          font-size: 24px;
        }

        .pm-heading > div:last-child {
          min-width: 0;
        }

        .pm-heading p {
          margin: 0 0 2px;
          color: #9bc7ff;
          font-size: .58rem;
          font-weight: 900;
          letter-spacing: .1em;
          text-transform: uppercase;
        }

        .pm-heading h1 {
          margin: 0;
          font-size: clamp(1.18rem, 5vw, 1.55rem);
          line-height: 1.12;
        }

        .pm-heading span {
          display: block;
          margin-top: 4px;
          color: #b9c9df;
          font-size: .69rem;
          line-height: 1.3;
        }

        .pm-command-centre {
          margin-top: 9px;
          padding: 11px;
          border: 1px solid rgba(96,165,250,.18);
          border-radius: 17px;
          background:
            radial-gradient(circle at 0 0, rgba(37,99,235,.13), transparent 42%),
            rgba(12,27,49,.92);
          box-shadow: 0 9px 24px rgba(2,6,23,.2);
        }

        .pm-progress-copy {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 10px;
        }

        .pm-progress-copy > div span {
          display: block;
          color: #7591b5;
          font-size: .55rem;
          font-weight: 900;
          letter-spacing: .08em;
          text-transform: uppercase;
        }

        .pm-progress-copy strong {
          color: #e4efff;
          font-size: .78rem;
        }

        .pm-progress-copy b {
          color: #8ab7ff;
          font-size: .84rem;
        }

        .pm-progress-copy small {
          color: #8398b4;
          font-size: .56rem;
          font-weight: 700;
        }

        .pm-progress-track {
          height: 5px;
          margin-top: 7px;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(148,163,184,.13);
        }

        .pm-progress-track span {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #2563eb, #22d3ee, #34d399);
          box-shadow: 0 0 12px rgba(52,211,153,.48);
          transition: width .35s ease;
        }

        .pm-team-filters {
          display: flex;
          gap: 6px;
          margin-top: 10px;
          overflow-x: auto;
          padding-bottom: 2px;
          scrollbar-width: none;
        }

        .pm-team-filters::-webkit-scrollbar {
          display: none;
        }

        .pm-team-filters button,
        .pm-workflow-filters button {
          flex: 0 0 auto;
          border: 1px solid rgba(148,163,184,.18);
          border-radius: 999px;
          background: rgba(4,14,29,.46);
          color: #91a5be;
          font-size: .63rem;
          font-weight: 800;
        }

        .pm-team-filters button {
          display: flex;
          align-items: center;
          gap: 5px;
          min-height: 29px;
          padding: 4px 9px;
        }

        .pm-team-filters button i,
        .pm-team-line i {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          box-shadow: 0 0 7px currentColor;
        }

        .pm-team-filters button.active,
        .pm-workflow-filters button.active {
          border-color: rgba(96,165,250,.7);
          background: linear-gradient(145deg, rgba(37,99,235,.68), rgba(79,70,229,.58));
          color: #fff;
          box-shadow: 0 5px 14px rgba(37,99,235,.2);
        }

        .pm-workflow-filters {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 6px;
          margin-top: 8px;
        }

        .pm-workflow-filters button {
          min-width: 0;
          min-height: 30px;
          padding: 4px 6px;
        }

        .pm-workflow-filters button span {
          display: inline-grid;
          place-items: center;
          min-width: 17px;
          height: 17px;
          margin-left: 4px;
          padding: 0 4px;
          border-radius: 999px;
          background: rgba(255,255,255,.12);
          font-size: .54rem;
        }

        .pm-access {
          display: flex;
          align-items: center;
          gap: 7px;
          margin: 8px 4px 5px;
          color: #879bb5;
          font-size: .62rem;
        }

        .pm-access i {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #34d399;
          box-shadow: 0 0 9px rgba(52,211,153,.7);
        }

        .pm-list {
          display: grid;
          gap: 7px;
        }

        .pm-card {
          min-width: 0;
          padding: 9px 10px 10px;
          border: 1px solid rgba(148,163,184,.16);
          border-radius: 16px;
          background:
            linear-gradient(145deg, rgba(16,30,53,.99), rgba(21,37,61,.97));
          box-shadow: 0 8px 21px rgba(2,6,23,.2);
        }

        .pm-card.needs-setup {
          border-color: rgba(245,158,11,.23);
        }

        .pm-player-head {
          display: flex;
          align-items: center;
          gap: 9px;
          min-width: 0;
          margin-bottom: 7px;
        }

        .pm-avatar {
          display: grid;
          place-items: center;
          flex: 0 0 47px;
          width: 47px;
          height: 47px;
          border: 2px solid rgba(96,165,250,.64);
          border-radius: 50%;
          background:
            linear-gradient(145deg, rgba(37,99,235,.82), rgba(124,58,237,.8));
          background-position: center;
          background-size: cover;
          box-shadow: 0 5px 14px rgba(2,6,23,.32);
          color: #fff;
          font-size: .68rem;
          font-weight: 900;
        }

        .pm-player-copy {
          min-width: 0;
          flex: 1;
        }

        .pm-player-copy h2 {
          overflow: hidden;
          margin: 0 0 3px;
          color: #f8fbff;
          font-size: .82rem;
          line-height: 1.1;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .pm-team-line {
          display: flex;
          flex-wrap: wrap;
          gap: 3px 8px;
        }

        .pm-team-line span {
          display: flex;
          align-items: center;
          gap: 4px;
          color: #8299b7;
          font-size: .56rem;
        }

        .pm-team-line .pm-unseeded {
          color: #72849d;
        }

        .pm-status {
          flex: 0 0 auto;
          padding: 3px 6px;
          border-radius: 999px;
          font-size: .5rem;
          font-weight: 900;
          letter-spacing: .03em;
          text-transform: uppercase;
        }

        .pm-status.complete {
          border: 1px solid rgba(52,211,153,.3);
          background: rgba(16,185,129,.1);
          color: #7ce6b8;
        }

        .pm-status.pending {
          border: 1px solid rgba(245,158,11,.3);
          background: rgba(245,158,11,.09);
          color: #fbc66b;
        }

        .pm-profile-controls {
          display: grid;
          gap: 7px;
        }

        .pm-scale {
          display: grid;
          grid-template-columns: minmax(76px, .72fr) minmax(180px, 1.28fr);
          align-items: center;
          gap: 8px;
        }

        .pm-scale-copy {
          min-width: 0;
        }

        .pm-scale-copy > div {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .pm-scale-copy strong {
          color: #dce9f8;
          font-size: .63rem;
        }

        .pm-scale-copy i {
          padding: 2px 4px;
          border-radius: 4px;
          background: rgba(245,158,11,.12);
          color: #f7bd59;
          font-size: .47rem;
          font-style: normal;
          font-weight: 900;
          text-transform: uppercase;
        }

        .pm-scale-copy > span {
          display: block;
          overflow: hidden;
          margin-top: 2px;
          color: #83b1ef;
          font-size: .56rem;
          font-weight: 800;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .pm-scale.needs-choice .pm-scale-copy > span {
          color: #d9a84f;
        }

        .pm-scale-ends {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 3px;
          color: #718aa8;
          font-size: .46rem;
          font-weight: 750;
        }

        .pm-points {
          position: relative;
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 5px;
        }

        .pm-points::before {
          content: "";
          position: absolute;
          top: 50%;
          left: 8%;
          right: 8%;
          height: 2px;
          transform: translateY(-50%);
          background: linear-gradient(90deg, #3b82f6, #64748b, #f97316);
          opacity: .34;
        }

        .pm-points button {
          position: relative;
          z-index: 1;
          display: grid;
          place-items: center;
          width: 100%;
          height: 28px;
          min-width: 0;
          min-height: 0;
          padding: 0;
          border: 1px solid rgba(148,163,184,.22);
          border-radius: 9px;
          background: #09192e;
          color: #8ca2bd;
          font-size: .63rem;
          font-weight: 900;
        }

        .pm-points button.is-selected {
          border-color: #8bb6ff;
          background: linear-gradient(145deg, #2871ed, #5147e9);
          color: #fff;
          box-shadow:
            0 0 0 1px rgba(147,197,253,.18),
            0 5px 12px rgba(37,99,235,.32);
        }

        .pm-points button:disabled {
          cursor: default;
        }

        .pm-toast {
          position: fixed;
          left: 50%;
          bottom: 92px;
          z-index: 11000;
          max-width: calc(100vw - 28px);
          transform: translateX(-50%);
          padding: 9px 13px;
          border: 1px solid rgba(52,211,153,.4);
          border-radius: 999px;
          background: rgba(6,24,34,.97);
          box-shadow: 0 12px 30px rgba(0,0,0,.42);
          color: #b7f7dc;
          font-size: .7rem;
          font-weight: 850;
          white-space: nowrap;
        }

        .pm-empty {
          display: grid;
          place-items: center;
          margin-top: 10px;
          padding: 22px 14px;
          border: 1px solid rgba(148,163,184,.17);
          border-radius: 16px;
          background: rgba(15,23,42,.82);
          color: #91a6c0;
          text-align: center;
        }

        .pm-empty > span {
          display: grid;
          place-items: center;
          width: 35px;
          height: 35px;
          margin-bottom: 7px;
          border-radius: 50%;
          background: rgba(16,185,129,.12);
          color: #5ee2ad;
          font-weight: 900;
        }

        .pm-empty strong {
          color: #dce8f7;
          font-size: .78rem;
        }

        .pm-empty p {
          margin: 3px 0 0;
          font-size: .64rem;
        }

        .pm-empty.error {
          color: #fecaca;
        }

        @media (min-width: 760px) {
          .pm-list {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 390px) {
          .pm-page {
            width: calc(100% - 12px);
          }

          .pm-command-centre,
          .pm-card {
            padding-left: 8px;
            padding-right: 8px;
          }

          .pm-scale {
            grid-template-columns: minmax(70px, .66fr) minmax(172px, 1.34fr);
            gap: 5px;
          }

          .pm-points {
            gap: 3px;
          }

          .pm-status {
            font-size: .46rem;
          }
        }
      `}</style>
    </main>
  );
}
