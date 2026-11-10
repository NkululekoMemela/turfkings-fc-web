import React, {useState} from "react";
import {clubChallengeRequest} from "../storage/clubChallengeGateway.js";
import "./ClubChallengeInbox.css";

const rand = (cents) => `R${(cents / 100).toFixed(2)}`;
const shortDate = (date) => new Intl.DateTimeFormat("en-ZA", {
  day: "numeric", month: "short", timeZone: "UTC",
}).format(new Date(`${date}T12:00:00Z`));

export function ExhibitionColumnHead({fixture}) {
  return <div className="matrix-week-head exhibition-column-head" title={`Exhibition vs ${fixture.opponentName}`}>
    <div className="matrix-week-date">{shortDate(fixture.proposedDate)}</div>
    <div className="matrix-week-status">{fixture.status === "live" ? "Live" : fixture.bookingOpen === false ? "Kickoff" : "Exhibition"}</div>
    <div className="matrix-week-count">{fixture.count} signed</div>
  </div>;
}

export function ExhibitionDetailsBubble({fixture, canManage, clubId, refresh}) {
  const [roster, setRoster] = useState(null);
  const [selected, setSelected] = useState([]);
  const [cashPaid, setCashPaid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const call = (data) => clubChallengeRequest("manageExhibitionBookings", {clubId, fixtureId: fixture.fixtureId, ...data});
  async function load() {
    setBusy(true);
    setNotice("");
    try { setRoster((await call()).players); }
    catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      await call({memberIds: selected, cashPaid});
      setNotice(`${selected.length} player${selected.length === 1 ? "" : "s"} saved.`);
      setRoster(null);
      setSelected([]);
      setCashPaid(false);
      await refresh();
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }
  return <details className="exhibition-details-bubble">
    <summary>
      <span className="exhibition-signup-crests" aria-hidden="true">
        {[fixture.home, fixture.away].map((club,index)=><React.Fragment key={club?.id||index}>
          {index===1 && <small>VS</small>}{club?.logoUrl ? <img src={club.logoUrl} alt=""/> : <span>⚽</span>}
        </React.Fragment>)}
      </span>
      <span><strong>vs {fixture.opponentName}</strong><small>{shortDate(fixture.proposedDate)} · {fixture.proposedKickoff} · {fixture.count}/{fixture.capacity} signed</small></span>
      <span aria-hidden="true" className="exhibition-signup-arrow">⌄</span>
    </summary>
    <div>
      <p><strong>{fixture.instigated ? "FANM exhibition" : "Club challenge"}</strong> · {fixture.format} · {fixture.count}/{fixture.capacity} signed</p>
      <p>{fixture.proposedDate} · {fixture.proposedKickoff} SAST · {fixture.venue}</p>
      {fixture.cancellationPending && <p role="status">A captain has requested cancellation. The match is still scheduled until a decision is made.</p>}
      <p>{fixture.cashPaid ? "Cash payment recorded" : fixture.priceCents ? `${rand(fixture.priceCents)} · Pay your captain directly` : "Free to play"}</p>
      {fixture.postponementPending && <p role="status">A new kickoff has been proposed. The date above still applies until both captains agree.</p>}
      {fixture.bookingOpen === false && <p>Signups closed. Existing bookings stay visible here.</p>}
      {canManage && fixture.bookingOpen !== false && !roster && <button type="button" className="primary-btn exhibition-select-players" disabled={busy} onClick={load}>
        <span aria-hidden="true">＋</span><span>{busy ? "Loading players…" : "Select players"}<small>Add signups or record cash payments</small></span>
      </button>}
      {roster && <form onSubmit={save} className="exhibition-bulk-picker">
        <fieldset disabled={busy}>
          <legend>Select Club players</legend>
          {roster.map((player) => <label key={player.memberId}>
            <input type="checkbox" checked={selected.includes(player.memberId)} disabled={player.cashPaid}
              onChange={(event) => {
                const checked = event.target.checked;
                setSelected((ids) => checked ? [...ids, player.memberId] : ids.filter((id) => id !== player.memberId));
              }} />
            {player.name}{player.cashPaid ? " · Cash paid" : player.signed ? " · Signed" : ""}
          </label>)}
        </fieldset>
        {fixture.priceCents > 0 && <label><input type="checkbox" checked={cashPaid} onChange={(event) => setCashPaid(event.target.checked)} /> Cash received from selected players</label>}
        <button type="submit" className="primary-btn" disabled={busy || !selected.length || selected.length > fixture.capacity}>Save selected players</button>
        <button type="button" className="secondary-btn" disabled={busy} onClick={() => {setRoster(null); setSelected([]); setCashPaid(false);}}>Close</button>
      </form>}
      {notice && <p role="status">{notice}</p>}
    </div>
  </details>;
}

export function ExhibitionBookingCell({fixture, player, ownRow, clubId, refresh}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!ownRow) return <div className="matrix-view-cell exhibition-cell">
    {fixture.signedMemberIds.includes(player.id) ? <span aria-label={fixture.cashPaidMemberIds?.includes(player.id) ? "Cash paid" : "Signed up"}>✓</span> : <span aria-hidden="true">·</span>}
  </div>;
  return <div className="matrix-view-cell exhibition-cell">
    {fixture.signed ? <span aria-label={fixture.cashPaid ? "Cash paid" : "Signed up"} title={fixture.cashPaid ? "Cash paid" : "Signed up"}>✓</span> :
      fixture.canBook ? <button type="button" disabled={busy} onClick={async () => {
        if (busy) return;
        setBusy(true);
        setError("");
        try {
          await clubChallengeRequest("bookExhibition", {clubId, fixtureId: fixture.fixtureId, expectedPriceCents: fixture.priceCents});
          await refresh();
        } catch (failure) {
          setError(failure.message);
          void refresh().catch(() => {});
        } finally { setBusy(false); }
      }}>{busy ? "…" : "Join"}</button> : <span>{fixture.bookingOpen === false ? "Closed" : fixture.count >= fixture.capacity ? "Full" : "·"}</span>}
    {error && <small role="alert">{error}</small>}
  </div>;
}
