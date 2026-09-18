import React, { useEffect, useState } from "react";
import { createVenueSeason, confirmVenueClubParticipation, inviteClubToVenueSeason, scheduleVenueFixture, startVenueFixture, watchVenueSeason } from "../storage/leagueSeasonRepository.js";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebaseConfig.js";
import { createPortal } from "react-dom";
import "./VenueEntryPage.css";
import VenueLandingHeader from "./VenueLandingHeader.jsx";
import { renderTileContent, tileButtonStyle } from "./VenueLandingTiles.jsx";

const areas = [
  { key: "home", icon: "🏠", title: "Home" },
  { key: "live", icon: "⚽", title: "Live Match" },
  { key: "stats", icon: "📊", title: "View Stats" },
  { key: "clubs", icon: "👥", title: "Clubs" },
  { key: "lineups", icon: "🗺️", title: "Lineups & Formations" },
  { key: "news", icon: "📰", title: "News & Highlights" },
  { key: "videos", icon: "🎬", title: "Video Highlights" },
];

const emptyContent = {
  live: ["Live Match", "Live scores and match events will appear when a venue league match starts."],
  stats: ["League Stats", "Standings and club statistics will appear once results are recorded."],
  clubs: ["Participating Clubs", "Clubs will appear when the field manager invites and confirms them for a season."],
  lineups: ["Lineups & Formations", "Match lineups will appear when participating clubs prepare their squads."],
  news: ["News & Highlights", "Field updates and league match stories will appear here."],
  videos: ["Video Highlights", "League match clips and highlights will appear here."],
};

export default function VenueLandingPage({
  venue, role, club, managerVerified, onBack,
}) {
  const [area, setArea] = useState("home");
  const [season, setSeason] = useState(null);
  const [seasonName, setSeasonName] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [seasonError, setSeasonError] = useState("");
  const [seasonLoading, setSeasonLoading] = useState(false);
  const [savingSeason, setSavingSeason] = useState(false);
  const [availableClubs, setAvailableClubs] = useState([]);
  const [inviteClubId, setInviteClubId] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviting, setInviting] = useState(false);
  const [confirmingClubId, setConfirmingClubId] = useState("");
  const [fixtureClubAId, setFixtureClubAId] = useState("");
  const [fixtureClubBId, setFixtureClubBId] = useState("");
  const [fixtureDate, setFixtureDate] = useState("");
  const [fixtureError, setFixtureError] = useState("");
  const [savingFixture, setSavingFixture] = useState(false);
  const [startingMatch, setStartingMatch] = useState(false);
  const [matchError, setMatchError] = useState("");

  useEffect(() => {
    if (!venue?.id) return undefined;
    setSeasonLoading(true);
    return watchVenueSeason(
      venue.id,
      (value) => {
        setSeason(value);
        setSeasonError("");
        setSeasonLoading(false);
      },
      (error) => {
        setSeasonError(error?.message || "Could not load this venue's season.");
        setSeasonLoading(false);
      }
    );
  }, [venue?.id]);

  useEffect(() => {
    if (!managerVerified || role !== "manager") return undefined;
    let active = true;
    getDocs(collection(db, "clubs")).then((snapshot) => {
      if (active) setAvailableClubs(snapshot.docs
        .map((item) => ({ ...item.data(), id: item.id }))
        .filter((item) => item.name)
        .sort((a, b) => a.name.localeCompare(b.name)));
    }).catch(() => {
      if (active) setInviteError("Could not load existing clubs.");
    });
    return () => { active = false; };
  }, [managerVerified, role]);

  async function startMatch() {
    if (!nextFixture?.id) return;
    setStartingMatch(true);
    setMatchError("");
    try {
      await startVenueFixture({
        venueId: venue.id,
        fixtureId: nextFixture.id,
      });
      setArea("live");
    } catch (error) {
      setMatchError(error?.message || "Could not start this match.");
    } finally {
      setStartingMatch(false);
    }
  }

  async function saveFixture(event) {
    event.preventDefault();
    setSavingFixture(true);
    setFixtureError("");
    try {
      await scheduleVenueFixture({
        venueId: venue.id,
        clubAId: fixtureClubAId,
        clubBId: fixtureClubBId,
        scheduledLocal: fixtureDate,
      });
      setFixtureClubAId("");
      setFixtureClubBId("");
      setFixtureDate("");
    } catch (error) {
      setFixtureError(error?.message || "Could not schedule the fixture.");
    } finally {
      setSavingFixture(false);
    }
  }

  async function confirmClub(clubId) {
    setConfirmingClubId(clubId);
    setInviteError("");
    try {
      await confirmVenueClubParticipation({ venueId: venue.id, clubId });
    } catch (error) {
      setInviteError(error?.message || "Could not confirm this club.");
    } finally {
      setConfirmingClubId("");
    }
  }

  async function sendInvitation(event) {
    event.preventDefault();
    setInviting(true);
    setInviteError("");
    try {
      await inviteClubToVenueSeason({
        venueId: venue.id,
        clubId: inviteClubId,
      });
      setInviteClubId("");
    } catch (error) {
      setInviteError(error?.message || "Could not invite the club.");
    } finally {
      setInviting(false);
    }
  }

  async function saveSeason(event) {
    event.preventDefault();
    setSavingSeason(true);
    setSeasonError("");
    try {
      await createVenueSeason({
        venueId: venue.id,
        name: seasonName,
        startsOn,
        endsOn,
      });
      setSeasonName("");
      setStartsOn("");
      setEndsOn("");
    } catch (error) {
      setSeasonError(error?.message || "Could not save the season.");
    } finally {
      setSavingSeason(false);
    }
  }
  if (!venue) return null;

  const place = [venue.location?.suburb, venue.location?.city]
    .filter(Boolean).join(", ");
  const activeMatch = Object.values(season?.liveMatches || {})
    .find((item) => item.status === "live") || null;
  const confirmedClubs = (season?.clubIds || []).map((id) => ({
    id,
    name: season.invitations?.[id]?.clubName || id,
  }));
  const nextFixture = [...(season?.fixtures || [])]
    .filter((fixture) => fixture.status === "scheduled" &&
      !season?.liveMatches?.[fixture.id])
    .sort((a, b) => a.scheduledLocal.localeCompare(b.scheduledLocal))[0] || null;
  const identity = role === "manager" && managerVerified
    ? "Field manager"
    : role === "club" && club
      ? `${club.name} representative`
      : "Visitor";

  function tile(item, compact = false) {
    return (
      <button
        key={item.key}
        type="button"
        style={compact ? undefined : tileButtonStyle(false)}
        className={[
          compact ? "venue-landing__nav-tile" : "venue-landing__tile",
          area === item.key ? "is-active" : "",
        ].join(" ")}
        onClick={() => setArea(item.key)}
        aria-current={area === item.key ? "page" : undefined}
      >
        {compact ? (
          <>
            <span aria-hidden="true">{item.icon}</span>
            <strong>{item.title}</strong>
          </>
        ) : renderTileContent({
          isMobile: false,
          icon: item.icon,
          desktopLines: [item.title],
          mobileLines: [item.title],
        })}
      </button>
    );
  }

  return createPortal(
    <main className="venue-landing venue-landing--platform">
      <div className="venue-landing__platform">
        <header className="venue-landing__platform-header">
          <VenueLandingHeader venue={venue} />
          <p>{place || "Location to be announced"}</p>
          <div className="venue-landing__viewing">
            <span>Viewing as <strong>{identity}</strong></span>
            <button type="button" onClick={onBack}>👤 Change profile</button>
          </div>
        </header>

        {area === "home" ? (
          <>
            <section className="card landing-first-card venue-landing__match-card">
              <h2>
                {season
                  ? `Upcoming ${season.name} Club League Match`
                  : "Upcoming Club League Match"}
              </h2>

              <div className="on-field-selects venue-landing__on-field">
                <div className="team-select">
                  <label>On-field Club 1</label>
                  <select value="" disabled aria-label="On-field Club 1">
                    <option value="">{nextFixture?.clubAName || "Awaiting first fixture"}</option>
                  </select>
                </div>
                <span className="vs-label">vs</span>
                <div className="team-select">
                  <label>On-field Club 2</label>
                  <select value="" disabled aria-label="On-field Club 2">
                    <option value="">{nextFixture?.clubBName || "Awaiting first fixture"}</option>
                  </select>
                </div>
              </div>

              <p className="muted small venue-landing__fixture-status">
                {managerVerified && role === "manager"
                  ? season
                    ? "Invite clubs and publish a fixture to fill this match card."
                    : "Create a season, then invite clubs and publish the first fixture."
                  : nextFixture
                    ? `Scheduled ${nextFixture.scheduledLocal.replace("T", " at ")} · South Africa time`
                    : "The field manager has not published the first fixture yet."}
              </p>

              <div className="actions-row landing-actions venue-landing__tiles">
                {managerVerified && role === "manager" && nextFixture &&
                  !activeMatch && (
                    <button type="button"
                      className="venue-landing__start-match"
                      disabled={startingMatch}
                      onClick={startMatch}>
                      {startingMatch ? "Starting…" : "Start venue match"}
                    </button>
                  )}
                {matchError && <p role="alert">{matchError}</p>}
                {areas.filter((item) => item.key !== "home")
                  .map((item) => tile(item))}
              </div>
            </section>
            <div className="venue-landing__ticker">
              <span>{venue.name} · Club league</span>
              <span>{season ? `${season.name} · Fixtures to be announced` : "First season and fixtures to be announced"}</span>
            </div>
            <section className="venue-landing__story">
              <div className="venue-landing__story-image"
                role="img" aria-label="Five-a-side football at the field" />
              <div className="venue-landing__story-caption">
                <span>THE FIELD</span>
                <h2>A home for the clubs who play here</h2>
                <p>
                  Follow {venue.name} as its manager brings the participating
                  clubs and upcoming seasons together.
                </p>
                {venue.websiteUrl && (
                  <a href={venue.websiteUrl} target="_blank" rel="noreferrer">
                    Visit the venue website ↗
                  </a>
                )}
              </div>
            </section>
            {managerVerified && role === "manager" && (
              <section className="venue-landing__manager">
                <span>FIELD MANAGER</span>
                <h2>Your venue workspace</h2>
                {season ? (
                  <p>
                    {season.name} starts {season.startsOn}
                    {season.endsOn ? ` and ends ${season.endsOn}` : ""}.
                    Club invitations and fixtures are the next controls to connect.
                  </p>
                ) : (
                  <form className="venue-landing__season-form" onSubmit={saveSeason}>
                    <p>Create your venue's first season. Clubs and fixtures come next.</p>
                    <label>
                      Season name
                      <input
                        required
                        maxLength={80}
                        value={seasonName}
                        onChange={(event) => setSeasonName(event.target.value)}
                        placeholder="e.g. Spring Club League"
                      />
                    </label>
                    <label>
                      Starts on
                      <input
                        required
                        type="date"
                        value={startsOn}
                        onChange={(event) => setStartsOn(event.target.value)}
                      />
                    </label>
                    <label>
                      Ends on
                      <input
                        type="date"
                        min={startsOn || undefined}
                        value={endsOn}
                        onChange={(event) => setEndsOn(event.target.value)}
                      />
                    </label>
                    <button type="submit" disabled={savingSeason}>
                      {savingSeason ? "Creating season…" : "Create season"}
                    </button>
                  </form>
                )}
                {season && (
                  <form className="venue-landing__season-form" onSubmit={sendInvitation}>
                    <h3>Invite an existing FANM club</h3>
                    <p>The invitation stays pending until the club accepts.</p>
                    <label>
                      Club to invite
                      <select
                        required
                        value={inviteClubId}
                        onChange={(event) => setInviteClubId(event.target.value)}
                      >
                        <option value="">Select a club…</option>
                        {availableClubs
                          .filter((item) => !season.invitations?.[item.id])
                          .map((item) => (
                            <option key={item.id} value={item.id}>{item.name}</option>
                          ))}
                      </select>
                    </label>
                    <button type="submit" disabled={inviting || !inviteClubId}>
                      {inviting ? "Sending invitation…" : "Invite club"}
                    </button>
                    {inviteError && <p role="alert">{inviteError}</p>}
                  </form>
                )}
                {season && confirmedClubs.length >= 2 && (
                  <form className="venue-landing__season-form" onSubmit={saveFixture}>
                    <h3>Schedule a club league fixture</h3>
                    <label>
                      Club 1
                      <select required value={fixtureClubAId}
                        onChange={(event) => setFixtureClubAId(event.target.value)}>
                        <option value="">Select participating club…</option>
                        {confirmedClubs.map((item) => (
                          <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Club 2
                      <select required value={fixtureClubBId}
                        onChange={(event) => setFixtureClubBId(event.target.value)}>
                        <option value="">Select participating club…</option>
                        {confirmedClubs.map((item) => (
                          <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Date and time (South Africa)
                      <input required type="datetime-local" value={fixtureDate}
                        onChange={(event) => setFixtureDate(event.target.value)} />
                    </label>
                    <button type="submit" disabled={savingFixture}>
                      {savingFixture ? "Scheduling…" : "Schedule fixture"}
                    </button>
                    {fixtureError && <p role="alert">{fixtureError}</p>}
                  </form>
                )}
                {seasonLoading && <p role="status">Loading season…</p>}
                {seasonError && <p role="alert">{seasonError}</p>}
              </section>
            )}
          </>
        ) : (
          <section className="venue-landing__match-card venue-landing__section">
            {area === "live" && activeMatch && (
              <div className="venue-landing__live-score" role="status">
                <span>LIVE · {season?.name}</span>
                <h2>{activeMatch.clubAName} {activeMatch.scoreA}
                  <span className="venue-landing__versus"> – </span>
                  {activeMatch.scoreB} {activeMatch.clubBName}</h2>
              </div>
            )}
            {area === "clubs" && season && (
              <div className="venue-landing__invited-clubs">
                <h2>Season invitations</h2>
                {Object.values(season.invitations || {}).length ? (
                  <ul>
                    {Object.values(season.invitations).map((invitation) => (
                      <li key={invitation.clubId}>
                        <strong>{invitation.clubName}</strong>
                        <span>
                          {invitation.status === "pending"
                            ? "Invitation pending"
                            : invitation.status === "accepted"
                              ? "Participating"
                              : invitation.status}
                          {managerVerified && role === "manager" &&
                            invitation.status === "pending" && (
                              <button
                                type="button"
                                disabled={confirmingClubId === invitation.clubId}
                                onClick={() => confirmClub(invitation.clubId)}
                                title="Use only after this club has agreed to participate"
                              >
                                {confirmingClubId === invitation.clubId
                                  ? "Confirming…" : "Confirm club agreement"}
                              </button>
                            )}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : <p>No clubs have been invited yet.</p>}
                {managerVerified && role === "manager" && (
                  <p>
                    Confirm a club here only after its admin has agreed.
                    In-app acceptance and notifications are not connected yet.
                  </p>
                )}
                {inviteError && <p role="alert">{inviteError}</p>}
              </div>
            )}
            <button type="button" onClick={() => setArea("home")}>← Venue home</button>
            <span className="venue-landing__section-icon" aria-hidden="true">
              {areas.find((item) => item.key === area)?.icon}
            </span>
            <h1>{emptyContent[area]?.[0]}</h1>
            <p>{emptyContent[area]?.[1]}</p>
          </section>
        )}
      </div>

      <nav className="venue-landing__bottom" aria-label="Venue navigation">
        {areas.map((item) => tile(item, true))}
      </nav>
    </main>,
    document.body
  );
}
