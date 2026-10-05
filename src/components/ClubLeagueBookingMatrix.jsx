import React, { useEffect, useMemo, useState } from "react";
import { doc, getDocs, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebaseConfig.js";
import { getMembersCollection } from "../core/clubFirestorePaths.js";
import { canManageClubField } from "../storage/clubFieldMembershipRepository.js";
import {
  changeLeagueBooking, watchLeagueBooking,
} from "../storage/leagueBookingRepository.js";
import "./ClubLeagueBookingMatrix.css";

function LeagueMatrix({ clubId, club, venue, players, beneficiary }) {
  const season = venue.league?.activeSeason;
  const user = auth.currentUser;
  const administrator = canManageClubField(club, user);
  const [bookings, setBookings] = useState({});
  const [actorMemberId, setActorMemberId] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [limits, setLimits] = useState({});
  const days = (season?.matchDays || []).filter(day =>
    (season.fixtures || []).some(f =>
      f.matchDayId === day.id && [f.clubAId, f.clubBId].includes(clubId)));
  const dayKey = JSON.stringify(days.map(day => day.id));
  const scopes = useMemo(() => JSON.parse(dayKey).map(matchDayId => ({
    venueId: venue.id, seasonId: season.id, matchDayId, clubId,
  })), [dayKey, venue.id, season?.id, clubId]);

  useEffect(() => {
    setBookings({});
    const stops = scopes.map(scope => watchLeagueBooking(scope,
      booking => setBookings(previous => ({
        ...previous, [scope.matchDayId]: booking,
      })),
      error => setMessage(error.message)));
    return () => stops.forEach(stop => stop());
  }, [scopes]);

  useEffect(() => {
    let cancelled = false;
    setActorMemberId("");
    if (!user?.uid) return undefined;
    getDocs(getMembersCollection(db, clubId)).then(snapshot => {
      if (cancelled) return;
      const matches = snapshot.docs.filter(item => {
        const member = item.data();
        return member.status === "active" && (
          member.uid === user.uid ||
          (user.emailVerified && member.email === user.email)
        );
      });
      if (matches.length === 1) setActorMemberId(matches[0].id);
    }).catch(error => { if (!cancelled) setMessage(error.message); });
    return () => { cancelled = true; };
  }, [clubId, user?.uid, user?.email, user?.emailVerified]);

  const registered = players.filter(player => player.docId);
  const exact = registered.filter(player =>
    String(player.id) === String(beneficiary?.playerId));
  const named = registered.filter(player =>
    String(player.fullName).trim().toLowerCase() ===
    String(beneficiary?.fullName || "").trim().toLowerCase());
  const selected = exact.length === 1 ? exact[0] :
    named.length === 1 ? named[0] : null;
  const bookedIds = new Set(Object.values(bookings).flatMap(booking =>
    Object.keys(booking?.entries || {})));
  const rows = administrator ? registered : registered.filter(player =>
    bookedIds.has(String(player.id)) || player.id === selected?.id);
  const minimum = { "5_V_5": 5, "6_V_6": 6, "7_V_7": 7, "11_V_11": 11 }[
    season?.gameFormat
  ] || 5;
  const maximum = Number(season?.maxPlayersPerClubPerDay) || 30;

  async function act(day, action, player = null) {
    const key = `${day.id}-${player?.id || "limit"}`;
    if (busy) return;
    setBusy(key); setMessage("");
    try {
      await changeLeagueBooking({
        scope: { venueId: venue.id, seasonId: season.id, matchDayId: day.id, clubId },
        action, actorMemberId,
        player: player ? {
          playerId: String(player.id), sourcePlayerId: player.docId,
          fullName: player.fullName,
        } : null,
        limit: limits[day.id] ?? bookings[day.id]?.limit ?? Math.min(maximum, minimum * 2),
      });
      setMessage(action === "paid" ? "Payment confirmed. Player included in the league manifest." :
        action === "configure" ? "Player limit saved." : "League booking updated.");
    } catch (error) {
      setMessage(error.message || "Could not update this booking.");
    } finally { setBusy(""); }
  }

  if (!season?.schedulePublishedAtMs || !days.length ||
      !(season.clubIds || []).includes(clubId)) return null;

  return (
    <section className="card signup-grid-card league-booking-matrix">
      <div className="signup-grid-title-row">
        <div>
          <span className="league-booking-matrix__eyebrow">FIELD LEAGUE</span>
          <h3>{season.name}</h3>
        </div>
      </div>
      <p className="muted small">{venue.name} · Pick your league match days</p>
      {!selected && !administrator && (
        <p className="muted small">Choose a registered player under Booking owner to reserve a place.</p>
      )}
      <div className="signup-matrix-wrap league-booking-matrix__scroll">
        <div className="signup-matrix league-booking-matrix__grid"
          style={{"--league-days": days.length}}>
          <div className="matrix-corner-cell">Players</div>
          {days.map(day => {
            const booking = bookings[day.id];
            const fixture = season.fixtures.find(f =>
              f.matchDayId === day.id && [f.clubAId, f.clubBId].includes(clubId));
            const locked = day.status !== "scheduled" ||
              fixture.status !== "scheduled" || !!season.liveMatches?.[fixture.id];
            const count = Object.keys(booking?.entries || {}).length;
            const full = booking && count >= booking.limit;
            return (
              <div className="matrix-week-head" key={day.id}>
                <div className="matrix-week-date">
                  {new Intl.DateTimeFormat("en-GB", {
                    day: "numeric", month: "short", timeZone: "UTC",
                  }).format(new Date(`${day.dateLocal}T12:00:00Z`))}
                </div>
                <div className="matrix-week-count">
                  {fixture.scheduledLocal?.slice(11, 16)} SAST
                </div>
                <span className={`matrix-week-status ${locked ? "closed" : full ? "full" : "low"}`}>
                  {locked ? "Closed" : full ? "Full" : "Open"}
                </span>
                <div className="matrix-week-count">
                  {count} / {booking?.limit || "—"} booked
                </div>
                {administrator && !locked && (
                  <details className="league-booking-matrix__limit">
                    <summary>Player limit</summary>
                    <input type="number" min={minimum} max={maximum}
                      aria-label={`Player limit for match day ${day.roundNo}`}
                      value={limits[day.id] ?? booking?.limit ?? Math.min(maximum, minimum * 2)}
                      disabled={!!busy}
                      onChange={event => setLimits(previous => ({
                        ...previous, [day.id]: event.target.value,
                      }))} />
                    <button type="button" disabled={!!busy}
                      onClick={() => act(day, "configure")}>Save</button>
                  </details>
                )}
              </div>
            );
          })}
          {rows.map(player => {
            const current = selected?.id === player.id;
            return (
              <React.Fragment key={player.docId}>
                <div className={`matrix-player-cell ${current ? "is-current-player" : ""}`}
                  title={player.fullName}>
                  <div className="matrix-player-info">
                    <div className="matrix-player-avatar" aria-hidden="true">
                      <span>{String(player.shortName || player.fullName || "P")
                        .charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="matrix-player-text">
                      <div className="matrix-player-name">
                        {player.shortName || player.fullName}
                      </div>
                      {current && <div className="matrix-player-tag">Booking owner</div>}
                    </div>
                  </div>
                </div>
                {days.map(day => {
                  const booking = bookings[day.id];
                  const entry = booking?.entries?.[player.id];
                  const paid = entry?.paymentStatus === "paid";
                  const fixture = season.fixtures.find(f =>
                    f.matchDayId === day.id && [f.clubAId, f.clubBId].includes(clubId));
                  const locked = day.status !== "scheduled" ||
                    fixture.status !== "scheduled" || !!season.liveMatches?.[fixture.id];
                  const canBook = administrator || (current && !!actorMemberId);
                  const canCancel = administrator || entry?.bookedByUid === user?.uid;
                  const full = booking &&
                    Object.keys(booking.entries || {}).length >= booking.limit;
                  const label = `${player.fullName}, ${day.dateLocal}`;
                  if (!entry) {
                    return (
                      <button key={day.id} type="button"
                        className={`matrix-pick-cell ${current ? "is-current-row" : ""}`}
                        aria-label={`Book ${label}`}
                        disabled={!!busy || locked || !booking || !canBook || full}
                        onClick={() => act(day, "reserve", player)}>
                        <span className="matrix-pick-inner">
                          <span className="matrix-pick-mark">
                            {!locked && booking && canBook && !full ? "+" : ""}
                          </span>
                        </span>
                      </button>
                    );
                  }
                  return (
                    <div key={day.id}
                      className={`matrix-view-cell is-signed ${paid ? "is-paid" : "is-unpaid"} ${current ? "is-current-row" : ""}`}>
                      <div className="league-booking-matrix__booking">
                        <span className="matrix-view-inner" aria-hidden="true">
                          <span className="matrix-pick-mark">✓</span>
                        </span>
                        <span className="league-booking-matrix__state">
                          {paid ? "Paid" : "Unpaid"}
                        </span>
                        {!locked && (administrator || (!paid && canCancel)) && (
                          <details className="league-booking-matrix__actions">
                            <summary aria-label={`Manage booking for ${label}`}>Manage</summary>
                            {!paid && canCancel && (
                              <button type="button" disabled={!!busy}
                                onClick={() => act(day, "cancel", player)}>Remove</button>
                            )}
                            {administrator && (
                              <button type="button" disabled={!!busy}
                                onClick={() => {
                                  if (paid && !window.confirm("Reverse this league payment confirmation?")) return;
                                  act(day, paid ? "unpaid" : "paid", player);
                                }}>{paid ? "Reverse paid" : "Confirm paid"}</button>
                            )}
                          </details>
                        )}
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </div>
      <p className="muted small">Amber: booked, unpaid · Green: paid and eligible to play.</p>
      {message && <p role="status">{message}</p>}
    </section>
  );
}

export default function ClubLeagueBookingMatrix({ clubId, players = [], beneficiary }) {
  const [club, setClub] = useState(null);
  const [venue, setVenue] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setClub(null); setVenue(null); setError("");
    let disposed = false;
    let stopVenue = () => {};
    const stopClub = onSnapshot(doc(db, "clubs", clubId),
      snapshot => setClub(snapshot.data() || null),
      failure => setError(failure.message));
    const stopMembership = onSnapshot(doc(db, "clubFieldMemberships", clubId),
      snapshot => {
        stopVenue(); setVenue(null);
        const membership = snapshot.data();
        if (disposed || membership?.status !== "active" || !membership.venueId) return;
        stopVenue = onSnapshot(doc(db, "leagueVenues", membership.venueId),
          item => setVenue(item.exists() ? { ...item.data(), id: item.id } : null),
          failure => setError(failure.message));
      }, failure => setError(failure.message));
    return () => { disposed = true; stopClub(); stopMembership(); stopVenue(); };
  }, [clubId]);
  if (error) return <p role="alert">{error}</p>;
  if (!club || !venue) return null;
  return <LeagueMatrix key={`${clubId}-${venue.id}-${venue.league?.activeSeason?.id}`}
    clubId={clubId} club={club} venue={venue} players={players} beneficiary={beneficiary} />;
}
