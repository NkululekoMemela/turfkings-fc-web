// src/pages/PlayerMentalitiesPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";

import { db } from "../firebaseConfig.js";
import { FANM_PRO_CLUBS } from "../data/fanm/fanmTeamLibrary.js";
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

function getTacticalIdentity(player) {
  if (!player?.mentalityConfigured) {
    return {
      key: "unconfigured",
      label: "Not classified",
      icon: "○",
    };
  }

  const mentality = validValue(player.mentality);

  if (mentality <= 2) {
    return {
      key: "defensive",
      label: "Defensive",
      icon: "🛡️",
    };
  }

  if (mentality >= 4) {
    return {
      key: "attacking",
      label: "Attacking",
      icon: "🔥",
    };
  }

  return {
    key: "balanced",
    label: "Balanced",
    icon: "⚖️",
  };
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

function resolveTeamBadge(team = {}) {
  const embedded = team?.teamIdentity || {};

  const identityCandidates = new Set(
    [
      embedded?.id,
      embedded?.clubId,
      embedded?.teamId,
      embedded?.slug,
      embedded?.code,
      embedded?.abbr,
      embedded?.shortName,
      embedded?.name,
      team?.identityId,
      team?.clubId,
      team?.teamId,
      team?.slug,
      team?.code,
      team?.abbrev,
      team?.label,
      team?.name,
    ]
      .map(keyOf)
      .filter(Boolean)
  );

  const canonical = (FANM_PRO_CLUBS || []).find((club) => {
    const canonicalKeys = [
      club?.id,
      club?.clubId,
      club?.teamId,
      club?.slug,
      club?.code,
      club?.abbr,
      club?.shortName,
      club?.name,
    ];

    /*
     * Preserve recognition of previously stored long names after
     * shortening the canonical Manchester display names.
     */
    if (String(club?.abbr || "").toUpperCase() === "MUN") {
      canonicalKeys.push("Manchester United");
    }

    if (String(club?.abbr || "").toUpperCase() === "MCI") {
      canonicalKeys.push("Manchester City");
    }

    return canonicalKeys
      .map(keyOf)
      .filter(Boolean)
      .some((candidate) =>
        identityCandidates.has(candidate)
      );
  });

  const canonicalBadge =
    canonical?.fantasyLogo32 ||
    canonical?.logo32 ||
    canonical?.logoUrl ||
    canonical?.image ||
    "";

  if (canonicalBadge) return canonicalBadge;

  return (
    team?.logoUrl ||
    team?.badgeUrl ||
    team?.crestUrl ||
    team?.image ||
    team?.fantasyLogo32 ||
    team?.logo32 ||
    embedded?.logoUrl ||
    embedded?.badgeUrl ||
    embedded?.crestUrl ||
    embedded?.image ||
    embedded?.fantasyLogo32 ||
    embedded?.logo32 ||
    ""
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
  const [tacticalFilter, setTacticalFilter] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const activeRole = String(
    identity?.actingRole || identity?.role || ""
  ).toLowerCase();

  const canManagePlayerProfiles =
    activeRole === "admin" || activeRole === "captain";

  const canEdit =
    !isPracticeMode && canManagePlayerProfiles;

  /*
   * Do not retain an administrative Unseeded filter after changing
   * to a player or spectator profile.
   */
  useEffect(() => {
    if (
      !canManagePlayerProfiles &&
      teamFilter === "unseeded"
    ) {
      setTeamFilter("all");
    }
  }, [canManagePlayerProfiles, teamFilter]);

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
          badge: resolveTeamBadge(team),
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
    /*
     * Unseeded membership is an administrative view.
     * Players and spectators only see members assigned to a squad.
     */
    const roleVisiblePlayers = canManagePlayerProfiles
      ? players
      : players.filter(
          (player) =>
            (playerTeamMap.get(player.id) || []).length > 0
        );

    if (teamFilter === "all") return roleVisiblePlayers;

    if (
      teamFilter === "unseeded" &&
      canManagePlayerProfiles
    ) {
      return players.filter(
        (player) =>
          (playerTeamMap.get(player.id) || []).length === 0
      );
    }

    return roleVisiblePlayers.filter((player) =>
      (playerTeamMap.get(player.id) || []).some(
        (team) => team.id === teamFilter
      )
    );
  }, [
    players,
    playerTeamMap,
    teamFilter,
    canManagePlayerProfiles,
  ]);

  const completedCount = scopedPlayers.filter(
    (player) => player.profileComplete
  ).length;

  const progressPercent = scopedPlayers.length
    ? Math.round((completedCount / scopedPlayers.length) * 100)
    : 0;

  const visiblePlayers = useMemo(() => {
    const filtered = scopedPlayers.filter((player) => {
      if (
        profileFilter === "needs-setup" &&
        player.profileComplete
      ) {
        return false;
      }

      if (
        profileFilter === "complete" &&
        !player.profileComplete
      ) {
        return false;
      }

      if (
        tacticalFilter !== "all" &&
        getTacticalIdentity(player).key !== tacticalFilter
      ) {
        return false;
      }

      return true;
    });

    return filtered.sort((a, b) => {
      const aSeeded = (playerTeamMap.get(a.id) || []).length > 0;
      const bSeeded = (playerTeamMap.get(b.id) || []).length > 0;

      if (aSeeded !== bSeeded) return aSeeded ? -1 : 1;
      return a.fullName.localeCompare(b.fullName);
    });
  }, [
    scopedPlayers,
    profileFilter,
    tacticalFilter,
    playerTeamMap,
  ]);

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
            <strong>
              {title}
              <span className="pm-choice-arrow" aria-hidden="true">→</span>
            </strong>
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
    const tacticalIdentity = getTacticalIdentity(player);

    return (
      <article
        className={`pm-card ${
          player.profileComplete ? "is-complete" : "needs-setup"
        } tactical-${tacticalIdentity.key}`}
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
                    {team.badge ? (
                      <img
                        src={team.badge}
                        alt=""
                        className="pm-team-badge pm-team-badge-small"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                          const fallback =
                            event.currentTarget.nextElementSibling;
                          if (fallback) {
                            fallback.style.display = "inline-block";
                          }
                        }}
                      />
                    ) : null}

                    <i
                      className="pm-team-dot"
                      style={{
                        background: team.color,
                        display: team.badge ? "none" : "inline-block",
                      }}
                    />

                    {team.label}
                  </span>
                ))
              ) : (
                <span className="pm-unseeded">Unseeded player</span>
              )}
            </div>
          </div>

          <div className="pm-card-badges">
            <div
              className={`pm-tactical-badge ${tacticalIdentity.key}`}
              title={`${tacticalIdentity.label} player mentality`}
            >
              <span>{tacticalIdentity.icon}</span>
              {tacticalIdentity.label}
            </div>

            <div
              className={`pm-status ${
                player.profileComplete ? "complete" : "pending"
              }`}
            >
              {player.profileComplete ? "✓ Complete" : "Needs setup"}
            </div>
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
            rightIcon: "🔥",
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

        <button
          type="button"
          className="pm-filter-toggle"
          aria-expanded={filtersOpen}
          aria-controls="pm-filter-drawer"
          onClick={() => setFiltersOpen((current) => !current)}
        >
          <span className="pm-filter-toggle-icon" aria-hidden="true">
            ☷
          </span>

          <span className="pm-filter-toggle-copy">
            <strong>Quick filters</strong>
            <small>
              {selectedTeamName}
              {" · "}
              {profileFilter === "all"
                ? "All profiles"
                : profileFilter === "needs-setup"
                  ? "Needs setup"
                  : "Complete"}
              {" · "}
              {tacticalFilter === "all"
                ? "All styles"
                : titleCase(tacticalFilter)}
            </small>
          </span>

          <span
            className={`pm-filter-chevron ${
              filtersOpen ? "open" : ""
            }`}
            aria-hidden="true"
          >
            ▾
          </span>
        </button>

        {filtersOpen ? (
          <div id="pm-filter-drawer" className="pm-filter-drawer">
        <div className="pm-filter-group pm-team-group">
          <div className="pm-filter-label">
            <span className="pm-filter-symbol">👕</span>
            <div>
                           <strong>Team</strong>
              <small>Browse a saved squad</small>
            </div>
          </div>

          <div className="pm-team-filters" aria-label="Filter by team">
            <button
              type="button"
              className={teamFilter === "all" ? "active" : ""}
              onClick={() => setTeamFilter("all")}
            >
              <span className="pm-all-teams-icon" aria-hidden="true">
                ◈
              </span>
              All teams
            </button>

            {teamProfiles.map((team) => (
              <button
                key={team.id}
                type="button"
                className={teamFilter === team.id ? "active" : ""}
                onClick={() => setTeamFilter(team.id)}
              >
                {team.badge ? (
                  <img
                    src={team.badge}
                    alt=""
                    className="pm-team-badge"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                      const fallback =
                        event.currentTarget.nextElementSibling;
                      if (fallback) {
                        fallback.style.display = "inline-block";
                      }
                    }}
                  />
                ) : null}

                <i
                  className="pm-team-dot"
                  style={{
                    background: team.color,
                    display: team.badge ? "none" : "inline-block",
                  }}
                />

                {team.label}
              </button>
            ))}

            {canManagePlayerProfiles ? (
              <button
                type="button"
                className={
                  teamFilter === "unseeded" ? "active" : ""
                }
                onClick={() => setTeamFilter("unseeded")}
              >
                Unseeded
              </button>
            ) : null}
          </div>
        </div>

        <div className="pm-filter-group pm-progress-group">
          <div className="pm-filter-label">
            <span className="pm-filter-symbol">✓</span>
            <div>
              <strong>Setup progress</strong>
              <small>Focus on unfinished profiles</small>
            </div>
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
        </div>

        <div className="pm-filter-group pm-style-group">
          <div className="pm-filter-label">
            <span className="pm-filter-symbol">◇</span>
            <div>
              <strong>Playing style</strong>
              <small>Browse by tactical mentality</small>
            </div>
          </div>

          <div
            className="pm-tactical-filters"
            aria-label="Filter by player mentality"
          >
            {[
              ["all", "All styles", "◉"],
              ["defensive", "Defensive", "🛡️"],
              ["balanced", "Balanced", "⚖️"],
              ["attacking", "Attacking", "🔥"],
            ].map(([value, label, icon]) => (
              <button
                key={value}
                type="button"
                className={`${value} ${
                  tacticalFilter === value ? "active" : ""
                }`}
                onClick={() => setTacticalFilter(value)}
              >
                <span>{icon}</span>
                {label}
              </button>
            ))}
          </div>
        </div>
          </div>
        ) : null}
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

        .pm-team-badge {
          display: block;
          flex: 0 0 auto;
          width: 20px;
          height: 20px;
          object-fit: contain;
          filter: drop-shadow(0 2px 3px rgba(0,0,0,.3));
        }

        .pm-team-badge-small {
          width: 14px;
          height: 14px;
        }

        .pm-team-dot {
          flex: 0 0 auto;
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

        .pm-tactical-filters {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 5px;
          margin-top: 7px;
          padding-top: 7px;
          border-top: 1px solid rgba(148,163,184,.12);
        }

        .pm-tactical-filters button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          min-width: 0;
          min-height: 29px;
          padding: 4px;
          border: 1px solid rgba(148,163,184,.16);
          border-radius: 9px;
          background: rgba(4,14,29,.38);
          color: #8fa4bd;
          font-size: .56rem;
          font-weight: 850;
        }

        .pm-tactical-filters button > span {
          font-size: .68rem;
        }

        .pm-tactical-filters button.active {
          border-color: rgba(147,197,253,.66);
          background:
            linear-gradient(145deg, rgba(37,99,235,.5), rgba(79,70,229,.44));
          color: #fff;
          box-shadow: 0 4px 12px rgba(37,99,235,.18);
        }

        .pm-filter-group {
          position: relative;
          margin-top: 8px;
          padding: 8px;
          overflow: hidden;
          border-radius: 13px;
        }

        .pm-filter-group::before {
          content: "";
          position: absolute;
          top: 0;
          bottom: 0;
          left: 0;
          width: 3px;
          border-radius: 999px;
        }

        .pm-team-group {
          border: 1px solid rgba(56,189,248,.14);
          background:
            linear-gradient(90deg, rgba(14,165,233,.09), rgba(14,165,233,.015));
        }

        .pm-team-group::before {
          background: #38bdf8;
          box-shadow: 0 0 10px rgba(56,189,248,.5);
        }

        .pm-progress-group {
          border: 1px solid rgba(167,139,250,.15);
          background:
            linear-gradient(90deg, rgba(124,58,237,.1), rgba(124,58,237,.018));
        }

        .pm-progress-group::before {
          background: #a78bfa;
          box-shadow: 0 0 10px rgba(167,139,250,.48);
        }

        .pm-style-group {
          border: 1px solid rgba(244,114,182,.13);
          background:
            linear-gradient(90deg, rgba(190,24,93,.075), rgba(190,24,93,.012));
        }

        .pm-style-group::before {
          background: linear-gradient(
            180deg,
            #38bdf8,
            #a78bfa,
            #fb7185
          );
        }

        .pm-filter-label {
          display: flex;
          align-items: center;
          gap: 7px;
          margin: 0 0 6px 2px;
        }

        .pm-filter-symbol {
          display: grid;
          place-items: center;
          flex: 0 0 23px;
          width: 23px;
          height: 23px;
          border: 1px solid rgba(255,255,255,.11);
          border-radius: 8px;
          background: rgba(5,15,31,.38);
          color: #dbeafe;
          font-size: .69rem;
          font-weight: 900;
        }

        .pm-filter-label strong {
          display: block;
          color: #e5effc;
          font-size: .61rem;
          line-height: 1.05;
          letter-spacing: .035em;
          text-transform: uppercase;
        }

        .pm-filter-label small {
          display: block;
          margin-top: 2px;
          color: #758ba7;
          font-size: .5rem;
          line-height: 1;
        }

        .pm-team-group .pm-team-filters,
        .pm-progress-group .pm-workflow-filters,
        .pm-style-group .pm-tactical-filters {
          margin-top: 0;
        }

        .pm-all-teams-icon {
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          width: 20px;
          height: 20px;
          border: 1px solid rgba(125,211,252,.35);
          border-radius: 7px;
          background: rgba(14,165,233,.12);
          color: #7dd3fc;
          font-size: .66rem;
        }

        .pm-team-group .pm-team-filters button {
          border-radius: 999px;
          background: rgba(4,20,39,.58);
        }

        .pm-team-group .pm-team-filters button.active {
          border-color: rgba(125,211,252,.72);
          background:
            linear-gradient(145deg, #0878c9, #2563eb);
          box-shadow: 0 4px 13px rgba(14,165,233,.25);
        }

        .pm-progress-group .pm-workflow-filters {
          padding: 3px;
          border: 1px solid rgba(167,139,250,.11);
          border-radius: 11px;
          background: rgba(5,12,28,.32);
        }

        .pm-progress-group .pm-workflow-filters button {
          border-color: transparent;
          border-radius: 8px;
          background: transparent;
        }

        .pm-progress-group .pm-workflow-filters button.active {
          border-color: rgba(196,181,253,.46);
          background:
            linear-gradient(145deg, rgba(109,40,217,.88), rgba(67,56,202,.88));
          box-shadow: 0 4px 13px rgba(109,40,217,.25);
        }

        .pm-style-group .pm-tactical-filters {
          padding-top: 0;
          border-top: 0;
        }

        .pm-style-group .pm-tactical-filters button {
          border-radius: 10px;
          background: rgba(5,14,30,.5);
        }

        .pm-style-group .pm-tactical-filters button.defensive.active {
          border-color: rgba(125,211,252,.7);
          background:
            linear-gradient(145deg, rgba(3,105,161,.82), rgba(30,64,175,.78));
        }

        .pm-style-group .pm-tactical-filters button.balanced.active {
          border-color: rgba(196,181,253,.72);
          background:
            linear-gradient(145deg, rgba(109,40,217,.82), rgba(79,70,229,.78));
        }

        .pm-style-group .pm-tactical-filters button.attacking.active {
          border-color: rgba(253,164,175,.72);
          background:
            linear-gradient(145deg, rgba(190,24,93,.78), rgba(190,24,93,.56));
        }

        .pm-style-group .pm-tactical-filters button.all.active {
          border-color: rgba(203,213,225,.58);
          background:
            linear-gradient(145deg, rgba(71,85,105,.88), rgba(51,65,85,.82));
        }

        /*
         * Quiet glass filter console:
         * useful and distinct, but visually behind the player cards.
         */
        .pm-command-centre {
          padding: 9px;
          border-color: rgba(147,197,253,.18);
          background:
            linear-gradient(
              145deg,
              rgba(38,70,108,.72),
              rgba(25,49,82,.72)
            );
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.035),
            0 5px 14px rgba(2,6,23,.12);
          backdrop-filter: blur(10px);
        }

        .pm-filter-group {
          margin-top: 6px;
          padding: 6px 7px;
          border-radius: 11px;
          box-shadow: none;
        }

        .pm-team-group {
          border-color: rgba(125,211,252,.16);
          background: rgba(30,75,110,.3);
        }

        .pm-progress-group {
          border-color: rgba(196,181,253,.15);
          background: rgba(76,55,128,.24);
        }

        .pm-style-group {
          border-color: rgba(251,113,133,.13);
          background: rgba(104,48,91,.18);
        }

        .pm-filter-group::before {
          width: 2px;
          opacity: .82;
        }

        .pm-filter-label {
          gap: 6px;
          margin-bottom: 4px;
        }

        .pm-filter-symbol {
          width: 19px;
          height: 19px;
          flex-basis: 19px;
          border-radius: 6px;
          background: rgba(15,35,61,.6);
          font-size: .58rem;
        }

        .pm-filter-label strong {
          color: #dce9f7;
          font-size: .56rem;
        }

        .pm-filter-label small {
          margin-top: 1px;
          color: #9badc2;
          font-size: .46rem;
        }

        .pm-team-group .pm-team-filters button {
          min-height: 27px;
          background: rgba(18,42,70,.76);
        }

        .pm-progress-group .pm-workflow-filters {
          padding: 2px;
          background: rgba(20,35,65,.48);
        }

        .pm-progress-group .pm-workflow-filters button,
        .pm-style-group .pm-tactical-filters button {
          min-height: 27px;
        }

        .pm-style-group .pm-tactical-filters button {
          background: rgba(19,38,66,.68);
        }

        .pm-progress-copy > div span {
          color: #a9bbd0;
        }

        .pm-progress-copy strong,
        .pm-progress-copy b {
          color: #f0f6ff;
        }

        /*
         * The cards remain the strongest surface on the page.
         */
        .pm-card {
          box-shadow:
            0 10px 25px rgba(2,6,23,.28),
            inset 0 1px 0 rgba(255,255,255,.025);
        }

        .pm-choice-arrow {
          display: inline-block;
          margin-left: 5px;
          color: #7dd3fc;
          font-size: .78rem;
          font-weight: 1000;
          line-height: 1;
          transform: translateY(1px);
          text-shadow: 0 0 8px rgba(56,189,248,.42);
        }

        .pm-scale.needs-choice .pm-choice-arrow {
          color: #fbbf24;
          text-shadow: 0 0 8px rgba(251,191,36,.35);
        }

        @media (max-width: 520px) {
          .pm-filter-label small {
            display: none;
          }

          .pm-filter-label {
            align-items: center;
          }

          .pm-command-centre {
            padding: 8px;
          }
        }

        /*
         * Collapsible neutral filter console.
         * Graphite separates it from the blue application background.
         */
        .pm-command-centre {
          border: 1px solid rgba(218,190,128,.3);
          background:
            radial-gradient(
              circle at 100% 0,
              rgba(218,190,128,.075),
              transparent 38%
            ),
            linear-gradient(
              145deg,
              rgba(48,47,48,.98),
              rgba(30,31,35,.98)
            );
          box-shadow:
            0 8px 22px rgba(0,0,0,.23),
            inset 0 1px 0 rgba(255,255,255,.04);
          backdrop-filter: none;
        }

        .pm-progress-track {
          background: rgba(255,255,255,.13);
        }

        .pm-filter-toggle {
          display: flex;
          align-items: center;
          width: 100%;
          min-height: 42px;
          margin-top: 9px;
          padding: 6px 9px;
          border: 1px solid rgba(218,190,128,.27);
          border-radius: 12px;
          background:
            linear-gradient(
              145deg,
              rgba(73,68,60,.76),
              rgba(44,44,47,.9)
            );
          color: #f7f2e8;
          text-align: left;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.045);
        }

        .pm-filter-toggle-icon {
          display: grid;
          place-items: center;
          flex: 0 0 28px;
          width: 28px;
          height: 28px;
          border: 1px solid rgba(236,215,159,.28);
          border-radius: 9px;
          background: rgba(214,180,106,.11);
          color: #e5ca87;
          font-size: .9rem;
        }

        .pm-filter-toggle-copy {
          min-width: 0;
          flex: 1;
          margin-left: 8px;
        }

        .pm-filter-toggle-copy strong {
          display: block;
          color: #fffaf0;
          font-size: .64rem;
          letter-spacing: .05em;
          text-transform: uppercase;
        }

        .pm-filter-toggle-copy small {
          display: block;
          overflow: hidden;
          margin-top: 2px;
          color: #c0b9ad;
          font-size: .51rem;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .pm-filter-chevron {
          display: grid;
          place-items: center;
          flex: 0 0 25px;
          width: 25px;
          height: 25px;
          color: #e5ca87;
          font-size: .9rem;
          transition: transform .2s ease;
        }

        .pm-filter-chevron.open {
          transform: rotate(180deg);
        }

        .pm-filter-drawer {
          margin-top: 6px;
          animation: pm-filter-open .18s ease-out;
        }

        @keyframes pm-filter-open {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .pm-filter-drawer .pm-filter-group {
          background: rgba(58,57,59,.68);
          box-shadow: none;
        }

        .pm-filter-drawer .pm-team-group {
          border-color: rgba(218,190,128,.21);
          background: rgba(83,74,57,.38);
        }

        .pm-filter-drawer .pm-team-group::before {
          background: #d6b46a;
          box-shadow: 0 0 8px rgba(214,180,106,.35);
        }

        .pm-filter-drawer .pm-progress-group {
          border-color: rgba(196,181,253,.2);
          background: rgba(72,60,96,.37);
        }

        .pm-filter-drawer .pm-style-group {
          border-color: rgba(203,213,225,.16);
          background: rgba(59,59,65,.58);
        }

        .pm-filter-drawer .pm-team-filters button,
        .pm-filter-drawer .pm-tactical-filters button {
          background: rgba(28,29,33,.88);
        }

        .pm-filter-drawer .pm-team-filters button.active {
          border-color: #eed99f;
          background: linear-gradient(145deg, #dfc27d, #b68d40);
          color: #211c13;
          box-shadow: 0 4px 12px rgba(182,141,64,.25);
        }

        .pm-filter-drawer
          .pm-team-filters
          button.active
          .pm-all-teams-icon {
          border-color: rgba(33,28,19,.28);
          background: rgba(33,28,19,.1);
          color: #211c13;
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

        .pm-card.tactical-defensive {
          border-left: 3px solid #38bdf8;
          background:
            radial-gradient(circle at 0 50%, rgba(14,165,233,.12), transparent 30%),
            linear-gradient(145deg, rgba(16,30,53,.99), rgba(21,37,61,.97));
        }

        .pm-card.tactical-balanced {
          border-left: 3px solid #a78bfa;
          background:
            radial-gradient(circle at 0 50%, rgba(139,92,246,.11), transparent 30%),
            linear-gradient(145deg, rgba(16,30,53,.99), rgba(21,37,61,.97));
        }

        .pm-card.tactical-attacking {
          border-left: 3px solid #fb7185;
          background:
            radial-gradient(circle at 0 50%, rgba(244,63,94,.11), transparent 30%),
            linear-gradient(145deg, rgba(16,30,53,.99), rgba(21,37,61,.97));
        }

        .pm-card.tactical-unconfigured {
          border-left: 3px solid rgba(148,163,184,.3);
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

        .pm-card-badges {
          display: grid;
          flex: 0 0 auto;
          justify-items: end;
          gap: 3px;
        }

        .pm-tactical-badge {
          display: flex;
          align-items: center;
          gap: 3px;
          padding: 2px 5px;
          border: 1px solid rgba(148,163,184,.17);
          border-radius: 999px;
          color: #9cafc5;
          font-size: .48rem;
          font-weight: 900;
          letter-spacing: .025em;
          text-transform: uppercase;
        }

        .pm-tactical-badge span {
          font-size: .58rem;
        }

        .pm-tactical-badge.defensive {
          border-color: rgba(56,189,248,.28);
          background: rgba(14,165,233,.08);
          color: #7dd3fc;
        }

        .pm-tactical-badge.balanced {
          border-color: rgba(167,139,250,.3);
          background: rgba(139,92,246,.09);
          color: #c4b5fd;
        }

        .pm-tactical-badge.attacking {
          border-color: rgba(251,113,133,.3);
          background: rgba(244,63,94,.08);
          color: #fda4af;
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

          .pm-tactical-filters {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .pm-status,
          .pm-tactical-badge {
            font-size: .46rem;
          }
        }
      `}</style>
    </main>
  );
}
