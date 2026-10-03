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
    <section className="card league-booking-matrix">
      <header>
        <div>
          <span className="league-booking-matrix__eyebrow">FIELD LEAGUE</span>
          <h3>{season.name}</h3>
          <p>{venue.name} · Bookings separate from ordinary Club games</p>
        </div>
      </header>
      {!selected && !administrator && (
        <p className="muted small">Choose a registered player under Booking owner to reserve a place.</p>
      )}
      <div className="league-booking-matrix__scroll">
        <table>
          <thead>
            <tr>
              <th>Player</th>
              {days.map(day => {
                const booking = bookings[day.id];
                const fixture = season.fixtures.find(f =>
                  f.matchDayId === day.id && [f.clubAId, f.clubBId].includes(clubId));
                const locked = day.status !== "scheduled" ||
                  fixture.status !== "scheduled" || !!season.liveMatches?.[fixture.id];
                return (
                  <th key={day.id}>
                    <strong>{new Intl.DateTimeFormat("en-GB", {
                      day: "numeric", month: "short", timeZone: "UTC",
                    }).format(new Date(`${day.dateLocal}T12:00:00Z`))}</strong>
                    <small>{fixture.scheduledLocal?.slice(11, 16)} SAST</small>
                    <small>{Object.keys(booking?.entries || {}).length} / {booking?.limit || "—"} booked</small>
                    {administrator && !locked && (
                      <div className="league-booking-matrix__limit">
                        <input type="number" min={minimum} max={maximum}
                          aria-label={`Player limit for match day ${day.roundNo}`}
                          value={limits[day.id] ?? booking?.limit ?? Math.min(maximum, minimum * 2)}
                          disabled={!!busy}
                          onChange={event => setLimits(previous => ({
                            ...previous, [day.id]: event.target.value,
                          }))} />
                        <button type="button" disabled={!!busy}
                          onClick={() => act(day, "configure")}>Set limit</button>
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map(player => (
              <tr key={player.docId}>
                <th>{player.fullName}</th>
                {days.map(day => {
                  const booking = bookings[day.id];
                  const entry = booking?.entries?.[player.id];
                  const paid = entry?.paymentStatus === "paid";
                  const fixture = season.fixtures.find(f =>
                    f.matchDayId === day.id && [f.clubAId, f.clubBId].includes(clubId));
                  const locked = day.status !== "scheduled" ||
                    fixture.status !== "scheduled" || !!season.liveMatches?.[fixture.id];
                  const canBook = administrator ||
                    (selected?.id === player.id && !!actorMemberId);
                  const canCancel = administrator || entry?.bookedByUid === user?.uid;
                  return (
                    <td key={day.id}>
                      <span className={paid ? "league-booking-matrix__paid" : "muted"}>
                        {paid ? "Paid" : entry ? "Booked · unpaid" : "—"}
                      </span>
                      {!locked && booking && (
                        <div className="league-booking-matrix__cell-actions">
                          {!entry && canBook && (
                            <button type="button" disabled={!!busy}
                              onClick={() => act(day, "reserve", player)}>Book</button>
                          )}
                          {entry && !paid && canCancel && (
                            <button type="button" disabled={!!busy}
                              onClick={() => act(day, "cancel", player)}>Remove</button>
                          )}
                          {entry && administrator && (
                            <button type="button" disabled={!!busy}
                              onClick={() => {
                                if (paid && !window.confirm("Reverse this league payment confirmation?")) return;
                                act(day, paid ? "unpaid" : "paid", player);
                              }}>{paid ? "Reverse paid" : "Confirm paid"}</button>
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">Only confirmed paid players are eligible for the Field manifest.</p>
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
