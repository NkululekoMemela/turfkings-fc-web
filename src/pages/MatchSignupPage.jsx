// src/pages/MatchSignupPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebaseConfig";

const MIN_PLAYERS = 10;
const MAX_PLAYERS = 18;
const DEFAULT_VISIBLE_SLOTS = 10;
const COST_PER_GAME = 65;

function toTitleCaseLoose(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function firstNameOf(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean)[0] || "";
}

function slugFromLooseName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function normKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function getNextMonthWednesdays() {
  const now = new Date();
  const year =
    now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
  const month = (now.getMonth() + 1) % 12;

  const dates = [];
  const d = new Date(year, month, 1);

  while (d.getMonth() === month) {
    if (d.getDay() === 3) dates.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }

  return dates.map((date) => ({
    id: `${year}-${String(month + 1).padStart(2, "0")}-${String(
      date.getDate()
    ).padStart(2, "0")}`,
    label: date.toLocaleDateString("en-ZA", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    shortLabel: date.toLocaleDateString("en-ZA", {
      day: "2-digit",
      month: "short",
    }),
    fullLabel: date.toLocaleDateString("en-ZA", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    }),
    date,
  }));
}

function getStatus(count) {
  if (count >= MAX_PLAYERS) {
    return { key: "full", label: "Full", shortLabel: "Full" };
  }
  if (count >= MIN_PLAYERS) {
    return { key: "viable", label: "Game on", shortLabel: "On" };
  }
  return { key: "low", label: "needs players", shortLabel: "not filled" };
}

function getEntryName(entry) {
  if (typeof entry === "string") return toTitleCaseLoose(entry);
  if (!entry || typeof entry !== "object") return "";
  return toTitleCaseLoose(
    entry.shortName ||
      entry.fullName ||
      entry.displayName ||
      entry.name ||
      entry.playerName ||
      ""
  );
}

function getEntryShortName(entry) {
  const full = getEntryName(entry);
  return firstNameOf(full) || full;
}

function getIdentityKeys(identity, displayName, shortName) {
  return [
    identity?.memberId,
    identity?.playerId,
    identity?.shortName,
    identity?.fullName,
    identity?.displayName,
    identity?.name,
    identity?.playerName,
    identity?.email,
    displayName,
    shortName,
    firstNameOf(displayName),
    slugFromLooseName(displayName),
    slugFromLooseName(shortName),
  ]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .map(normKey);
}

function findCurrentPlayersTeam(teams = [], identity, displayName, shortName) {
  const identityKeys = getIdentityKeys(identity, displayName, shortName);

  for (const team of teams) {
    const players = Array.isArray(team?.players) ? team.players : [];

    const found = players.some((entry) => {
      const candidates =
        typeof entry === "string"
          ? [entry, firstNameOf(entry), slugFromLooseName(entry)]
          : [
              entry?.playerId,
              entry?.memberId,
              entry?.id,
              entry?.uid,
              entry?.shortName,
              entry?.fullName,
              entry?.displayName,
              entry?.name,
              entry?.playerName,
              firstNameOf(
                entry?.shortName ||
                  entry?.fullName ||
                  entry?.displayName ||
                  entry?.name ||
                  entry?.playerName
              ),
              slugFromLooseName(
                entry?.shortName ||
                  entry?.fullName ||
                  entry?.displayName ||
                  entry?.name ||
                  entry?.playerName
              ),
            ];

      return candidates
        .map((x) => String(x || "").trim())
        .filter(Boolean)
        .map(normKey)
        .some((k) => identityKeys.includes(k));
    });

    if (found) return team;
  }

  return null;
}

export default function MatchSignupPage({
  identity,
  currentUser,
  teams = [],
  onBack,
  onProceedToPayment,
}) {
  const [viewportWidth, setViewportWidth] = useState(() => {
    if (typeof window === "undefined") return 390;
    return window.innerWidth;
  });

  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= 480;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => {
      setViewportWidth(window.innerWidth);
      setIsMobile(window.innerWidth <= 480);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const displayName =
    identity?.shortName ||
    identity?.fullName ||
    identity?.displayName ||
    currentUser?.displayName ||
    currentUser?.email ||
    "Player";

  const shortName =
    identity?.shortName || firstNameOf(displayName) || "Player";

  const weeks = useMemo(() => getNextMonthWednesdays(), []);
  const [selectedWeeks, setSelectedWeeks] = useState([]);
  const [playerPhotos, setPlayerPhotos] = useState({});

  useEffect(() => {
    let cancelled = false;

    async function loadPhotos() {
      try {
        const snap = await getDocs(collection(db, "playerPhotos"));
        if (cancelled) return;

        const loaded = {};
        snap.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const photoData = data?.photoData || "";
          const rawName = data?.name || docSnap.id || "";
          if (!photoData) return;

          const title = toTitleCaseLoose(rawName);
          const first = firstNameOf(rawName);
          const slug = slugFromLooseName(rawName);

          [rawName, title, first, slug]
            .map((x) => String(x || "").trim())
            .filter(Boolean)
            .forEach((key) => {
              loaded[key] = photoData;
            });
        });

        setPlayerPhotos(loaded);
      } catch (err) {
        console.error("Failed to load player photos in MatchSignupPage:", err);
      }
    }

    loadPhotos();
    return () => {
      cancelled = true;
    };
  }, []);

  const getPlayerPhoto = useMemo(() => {
    return (playerName = "") => {
      const raw = String(playerName || "").trim();
      if (!raw) return null;

      const title = toTitleCaseLoose(raw);
      const first = firstNameOf(raw);
      const slug = slugFromLooseName(raw);

      const candidates = [raw, title, first, slug]
        .map((x) => String(x || "").trim())
        .filter(Boolean);

      for (const key of candidates) {
        if (playerPhotos[key]) return playerPhotos[key];

        const matchedKey = Object.keys(playerPhotos).find(
          (k) => normKey(k) === normKey(key)
        );
        if (matchedKey && playerPhotos[matchedKey]) {
          return playerPhotos[matchedKey];
        }
      }

      return null;
    };
  }, [playerPhotos]);

  const photoData = getPlayerPhoto(displayName) || getPlayerPhoto(shortName);

  const currentTeam = useMemo(
    () => findCurrentPlayersTeam(teams, identity, displayName, shortName),
    [teams, identity, displayName, shortName]
  );

  const allRows = useMemo(() => {
    const players = Array.isArray(currentTeam?.players)
      ? currentTeam.players
      : [];

    const mapped = players
      .map((entry, index) => {
        const fullName = getEntryName(entry);
        const short = getEntryShortName(entry);

        return {
          id:
            (typeof entry === "object" &&
              (entry?.playerId ||
                entry?.memberId ||
                entry?.id ||
                entry?.uid)) ||
            `${slugFromLooseName(fullName)}_${index}`,
          fullName,
          shortName: short,
          isCurrent:
            normKey(fullName) === normKey(displayName) ||
            normKey(fullName) === normKey(shortName) ||
            normKey(short) === normKey(shortName),
          isEmpty: false,
        };
      })
      .filter((p) => p.fullName);

    const alreadyHasCurrent = mapped.some((p) => p.isCurrent);

    if (!alreadyHasCurrent) {
      mapped.unshift({
        id:
          identity?.playerId ||
          identity?.memberId ||
          slugFromLooseName(displayName) ||
          "current_player",
        fullName: displayName,
        shortName,
        isCurrent: true,
        isEmpty: false,
      });
    }

    mapped.sort((a, b) => {
      if (a.isCurrent) return -1;
      if (b.isCurrent) return 1;
      return a.shortName.localeCompare(b.shortName);
    });

    while (mapped.length < MAX_PLAYERS) {
      mapped.push({
        id: `empty_slot_${mapped.length + 1}`,
        fullName: "",
        shortName: `Slot ${mapped.length + 1}`,
        isCurrent: false,
        isEmpty: true,
      });
    }

    return mapped.slice(0, MAX_PLAYERS);
  }, [currentTeam, identity, displayName, shortName]);

  const weekSelectionsAll = useMemo(() => {
    const out = {};

    weeks.forEach((week, weekIndex) => {
      const signedIds = new Set();

      allRows.forEach((player, playerIndex) => {
        if (player.isEmpty) return;

        if (player.isCurrent) {
          if (selectedWeeks.includes(week.id)) {
            signedIds.add(player.id);
          }
          return;
        }

        let shouldBeSigned = false;

        if (weekIndex % 4 === 0) shouldBeSigned = playerIndex <= 5;
        else if (weekIndex % 4 === 1) shouldBeSigned = playerIndex <= 8;
        else if (weekIndex % 4 === 2) shouldBeSigned = playerIndex <= 11;
        else shouldBeSigned = playerIndex <= 6;

        if (shouldBeSigned) signedIds.add(player.id);
      });

      out[week.id] = signedIds;
    });

    return out;
  }, [weeks, allRows, selectedWeeks]);

  const visibleRowCount = useMemo(() => {
    let lastVisibleIndex = DEFAULT_VISIBLE_SLOTS - 1;

    for (let i = DEFAULT_VISIBLE_SLOTS; i < MAX_PLAYERS; i += 1) {
      const previousRow = allRows[i - 1];
      if (!previousRow || previousRow.isEmpty) break;

      const previousRowTakenSomewhere = weeks.some((week) =>
        weekSelectionsAll[week.id]?.has(previousRow.id)
      );

      if (previousRowTakenSomewhere) {
        lastVisibleIndex = i;
      } else {
        break;
      }
    }

    return Math.min(
      MAX_PLAYERS,
      Math.max(DEFAULT_VISIBLE_SLOTS + 1, lastVisibleIndex + 1)
    );
  }, [allRows, weeks, weekSelectionsAll]);

  const displayRows = useMemo(() => {
    return allRows.slice(0, visibleRowCount);
  }, [allRows, visibleRowCount]);

  const weekSelections = useMemo(() => {
    const out = {};

    weeks.forEach((week) => {
      const signedIds = weekSelectionsAll[week.id] || new Set();
      out[week.id] = new Set(
        displayRows
          .filter((player) => signedIds.has(player.id))
          .map((player) => player.id)
      );
    });

    return out;
  }, [weeks, weekSelectionsAll, displayRows]);

  const weekMeta = useMemo(() => {
    return weeks.map((week) => {
      const fullCount = weekSelectionsAll[week.id]?.size || 0;
      return {
        ...week,
        count: fullCount,
        status: getStatus(fullCount),
      };
    });
  }, [weeks, weekSelectionsAll]);

  const toggleWeek = (week) => {
    const meta = weekMeta.find((w) => w.id === week.id);
    if (meta?.status?.key === "full") return;

    setSelectedWeeks((prev) =>
      prev.includes(week.id)
        ? prev.filter((id) => id !== week.id)
        : [...prev, week.id]
    );
  };

  const totalAmount = selectedWeeks.length * COST_PER_GAME;
  const selectedCount = selectedWeeks.length;
  const signupStatusText =
    selectedCount > 0
      ? `${selectedCount} week${selectedCount > 1 ? "s" : ""} selected`
      : "tick a box";

  const firstColWidth = isMobile ? 108 : 220;

  const weekColWidth = useMemo(() => {
    if (!isMobile) return 135;

    const safeWeeks = Math.max(weeks.length, 1);
    const appSidePadding = 20;
    const cardInnerPadding = 18;
    const borderAllowance = 8;

    const availableForWeeks =
      viewportWidth -
      appSidePadding -
      cardInnerPadding -
      firstColWidth -
      borderAllowance;

    const fitted = Math.floor(availableForWeeks / safeWeeks);

    const minWidth = safeWeeks >= 5 ? 44 : 52;
    const maxWidth = 62;

    return Math.max(minWidth, Math.min(maxWidth, fitted));
  }, [isMobile, weeks.length, viewportWidth, firstColWidth]);

  const denseMobileWeeks = isMobile && weeks.length >= 5;

  return (
    <div className="page match-signup-page">
      <section className="card signup-hero-card">
        <div className="signup-hero-compact">
          <div className="signup-hero-left">
            <div className="signup-player-avatar signup-player-avatar-hero">
              {photoData ? (
                <img
                  src={photoData}
                  alt={displayName}
                  className="signup-player-avatar-img"
                />
              ) : (
                <span className="signup-player-avatar-fallback">
                  {String(shortName || "P").charAt(0).toUpperCase()}
                </span>
              )}
            </div>

            <div className="signup-hero-copy">
              <div className="signup-hero-title-row">
                <h2>Pay for next month games</h2>

              </div>

              <p className="muted signup-hero-subtext">
                Select every Wednesday you are available for next month.
              </p>

              <div className="signup-top-meta">

                {currentTeam?.label ? (
                  <div className="signup-team-pill">
                    <span className="muted">Team</span>
                    <strong>{currentTeam.label}</strong>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <button
            type="button"
            className="secondary-btn signup-back-btn"
            onClick={onBack}
          >
            ← Back
          </button>
        </div>
      </section>

      <section className="card signup-grid-card">
      <div className="signup-grid-title-row">
        <h3>Choose your Wednesdays</h3>
        <div
          className={`signup-top-status ${
            selectedCount > 0 ? "is-active" : "is-idle"
          }`}
        >
          {signupStatusText}
        </div>
      </div>
        <div className="signup-matrix-wrap">
          <div
            className={`signup-matrix ${isMobile ? "is-mobile-matrix" : ""} ${
              denseMobileWeeks ? "is-dense-weeks" : ""
            }`}
            style={{
              gridTemplateColumns: `${firstColWidth}px repeat(${weekMeta.length}, minmax(${weekColWidth}px, 1fr))`,
            }}
          >
            <div className="matrix-corner-cell">Players</div>

            {weekMeta.map((week) => (
              <div
                key={`head-${week.id}`}
                className={`matrix-week-head status-${week.status.key}`}
                title={week.fullLabel}
              >
                <div className="matrix-week-date">
                  {isMobile ? week.shortLabel : week.label}
                </div>
                <div className={`matrix-week-status ${week.status.key}`}>
                  {isMobile ? week.status.shortLabel : week.status.label}
                </div>
                <div className="matrix-week-count">{week.count} signed</div>
              </div>
            ))}

            {displayRows.map((player, rowIndex) => {
              const playerPhoto =
                !player.isEmpty &&
                (getPlayerPhoto(player.fullName) ||
                  getPlayerPhoto(player.shortName));

              return (
                <React.Fragment key={player.id}>
                  <div
                    className={`matrix-player-cell ${
                      player.isCurrent ? "is-current-player" : ""
                    } ${player.isEmpty ? "is-empty-player" : ""}`}
                  >
                    {player.isEmpty ? (
                      <div className="matrix-player-empty">
                        {isMobile
                          ? `Slot ${rowIndex + 1}`
                          : `Empty slot ${rowIndex + 1}`}
                      </div>
                    ) : (
                      <div className="matrix-player-info">
                        <div className="matrix-player-avatar">
                          {playerPhoto ? (
                            <img src={playerPhoto} alt={player.fullName} />
                          ) : (
                            <span>
                              {String(player.shortName || "P")
                                .charAt(0)
                                .toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="matrix-player-text">
                          <div className="matrix-player-name">
                            {player.shortName}
                          </div>
                          {player.isCurrent && (
                            <div className="matrix-player-tag">You</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {weekMeta.map((week) => {
                    const signed = weekSelections[week.id]?.has(player.id);
                    const isCurrentCell = player.isCurrent;
                    const status = week.status;

                    if (player.isEmpty) {
                      return (
                        <div
                          key={`${player.id}-${week.id}`}
                          className={`matrix-view-cell matrix-empty-slot ${
                            signed ? "is-signed" : ""
                          }`}
                        >
                          <div className="matrix-view-inner">
                            <span className="matrix-pick-mark">
                              {signed
                                ? "✓"
                                : rowIndex === DEFAULT_VISIBLE_SLOTS
                                ? "+"
                                : ""}
                            </span>
                          </div>
                        </div>
                      );
                    }

                    if (isCurrentCell) {
                      return (
                        <button
                          key={`${player.id}-${week.id}`}
                          type="button"
                          className={[
                            "matrix-pick-cell",
                            `status-${status.key}`,
                            signed ? "is-selected" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={() => toggleWeek(week)}
                          disabled={status.key === "full"}
                        >
                          <div className="matrix-pick-inner">
                            <span className="matrix-pick-mark">
                              {signed ? "✓" : ""}
                            </span>
                          </div>
                        </button>
                      );
                    }

                    return (
                      <div
                        key={`${player.id}-${week.id}`}
                        className={`matrix-view-cell ${
                          signed ? "is-signed" : ""
                        }`}
                      >
                        <div className="matrix-view-inner">
                          <span className="matrix-pick-mark">
                            {signed ? "✓" : ""}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </section>

      <section className="card signup-summary-card">
        <div className="signup-summary-header">
          <div className="signup-summary-player">
            <div className="signup-summary-avatar">
              {photoData ? (
                <img src={photoData} alt={displayName} />
              ) : (
                <span>{String(shortName || "P").charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div>
              <h3>Selection summary</h3>
              <p className="muted small">{shortName}</p>
            </div>
          </div>
        </div>

        <div className="signup-summary-rows">
          <div className="summary-row">
            <span>Selected match days</span>
            <strong>{selectedWeeks.length}</strong>
          </div>

          <div className="summary-row">
            <span>Cost per game</span>
            <strong>R{COST_PER_GAME}</strong>
          </div>

          <div className="summary-row total">
            <span>Total due</span>
            <strong>R{totalAmount}</strong>
          </div>
        </div>

        <button
          type="button"
          className="primary-btn signup-pay-btn"
          disabled={selectedWeeks.length === 0}
          onClick={() =>
            onProceedToPayment?.({
              selectedWeeks,
              totalAmount,
              costPerGame: COST_PER_GAME,
            })
          }
        >
          💳 Continue to payment
        </button>
      </section>
    </div>
  );
}