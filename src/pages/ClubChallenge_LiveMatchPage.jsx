import React, { useMemo } from "react";
import "../styles/ClubChallenge_LiveMatchPage.css";

function cleanText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function clubInitials(name = "") {
  return cleanText(name, "Football Club")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function fixtureDateLabel(fixture = {}) {
  const rawDate = cleanText(
    fixture?.confirmedDate ||
      fixture?.proposedDate ||
      fixture?.matchDate
  );

  if (!rawDate) return "Date to be confirmed";

  const parsed = new Date(`${rawDate}T12:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return rawDate;
  }

  return parsed.toLocaleDateString("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fixtureTimeLabel(fixture = {}) {
  return cleanText(
    fixture?.confirmedKickoff ||
      fixture?.proposedKickoff ||
      fixture?.kickoff,
    "Time to be confirmed"
  );
}

function fixtureFormatLabel(fixture = {}) {
  const rawFormat = cleanText(
    fixture?.format || fixture?.gameFormat,
    "5v5"
  ).toUpperCase();

  if (rawFormat.includes("11")) return "11 v 11";
  if (rawFormat.includes("7")) return "7 v 7";
  if (rawFormat.includes("6")) return "6 v 6";

  return "5 v 5";
}

function ClubIdentity({ name, logo, side }) {
  return (
    <article className="club-challenge-live__club">
      <span className="club-challenge-live__side">
        {side}
      </span>

      <div className="club-challenge-live__badge">
        {logo ? (
          <img src={logo} alt={`${name} logo`} />
        ) : (
          <strong>{clubInitials(name)}</strong>
        )}
      </div>

      <h2>{name}</h2>
    </article>
  );
}

export default function ClubChallenge_LiveMatchPage({
  fixture,
  onBack,
}) {
  const match = fixture || {};

  const homeName = cleanText(
    match?.homeClubName ||
      match?.challengerClubName,
    "Home Club"
  );

  const awayName = cleanText(
    match?.awayClubName ||
      match?.targetClubName,
    "Away Club"
  );

  const homeLogo = cleanText(
    match?.homeClubLogo ||
      match?.challengerClubLogo ||
      match?.homeClubBadge ||
      match?.homeLogo
  );

  const awayLogo = cleanText(
    match?.awayClubLogo ||
      match?.targetClubLogo ||
      match?.awayClubBadge ||
      match?.awayLogo
  );

  const fixtureId = cleanText(
    match?.fixtureId || match?.id
  );

  const venue = cleanText(
    match?.venue || match?.proposedVenue,
    "Venue to be confirmed"
  );

  const matchStatus = cleanText(
    match?.matchStatus ||
      match?.fixtureStatus ||
      match?.status,
    "ready"
  );

  const controllerLabel = useMemo(() => {
    const refereeName = cleanText(
      match?.refereeName ||
        match?.appointedRefereeName
    );

    if (refereeName) {
      return refereeName;
    }

    return "Awaiting match controller";
  }, [match]);

  if (!fixtureId) {
    return (
      <main className="club-challenge-live-page">
        <section className="club-challenge-live__missing">
          <span>⚠️</span>
          <h1>No fixture selected</h1>
          <p>
            Return to Challenge Centre and select an accepted
            interclub fixture.
          </p>

          <button type="button" onClick={onBack}>
            Return to Challenge Centre
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="club-challenge-live-page">
      <div className="club-challenge-live-shell">
        <header className="club-challenge-live__topbar">
          <button type="button" onClick={onBack}>
            ← Challenge Centre
          </button>

          <span>5 Asides Near Me</span>
        </header>

        <section className="club-challenge-live__hero">
          <div>
            <span className="club-challenge-live__kicker">
              Global interclub match
            </span>

            <h1>Live Match Control</h1>

            <p>
              Official referee controls for this shared club
              challenge fixture.
            </p>
          </div>

          <span className="club-challenge-live__status">
            {matchStatus === "live" ||
            matchStatus === "in_progress"
              ? "● Match live"
              : "Ready for kickoff"}
          </span>
        </section>

        <section className="club-challenge-live__matchup">
          <ClubIdentity
            name={homeName}
            logo={homeLogo}
            side="Home club"
          />

          <div className="club-challenge-live__versus">
            <span>{fixtureFormatLabel(match)}</span>
            <strong>VS</strong>
          </div>

          <ClubIdentity
            name={awayName}
            logo={awayLogo}
            side="Away club"
          />
        </section>

        <section className="club-challenge-live__fixture-strip">
          <span>
            <small>Date</small>
            <strong>{fixtureDateLabel(match)}</strong>
          </span>

          <span>
            <small>Kickoff</small>
            <strong>{fixtureTimeLabel(match)}</strong>
          </span>

          <span>
            <small>Venue</small>
            <strong>{venue}</strong>
          </span>

          <span>
            <small>Match official</small>
            <strong>{controllerLabel}</strong>
          </span>
        </section>

        <section className="club-challenge-live__control-stage">
          <div className="club-challenge-live__control-heading">
            <span>Official controls</span>
            <h2>Match console</h2>
            <p>
              This global page now owns the selected shared
              fixture. The existing referee controls will be
              migrated here without using a club-scoped match
              document.
            </p>
          </div>

          <div className="club-challenge-live__scoreboard">
            <article>
              <small>{homeName}</small>
              <strong>0</strong>
            </article>

            <span>–</span>

            <article>
              <small>{awayName}</small>
              <strong>0</strong>
            </article>
          </div>

          <button
            type="button"
            className="club-challenge-live__kickoff"
            onClick={() => {
              console.log(
                "[ClubChallenge_LiveMatchPage] Kickoff requested",
                match
              );
            }}
          >
            Start Match
            <span>→</span>
          </button>
        </section>
      </div>
    </main>
  );
}
