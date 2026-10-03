import React, { useState } from "react";
import { rescheduleRemainingVenueKickoffs, rescheduleVenueMatchDay, setVenueScheduleTesting, prepareVenueSeasonForMatch } from "../storage/leagueSeasonRepository.js";

function RemainingKickoffEditor({venueId, season, day, fixtures}) {
  const remaining = fixtures.filter(item =>
    item.status === "scheduled" && !season.liveMatches?.[item.id]);
  const [time, setTime] = useState(
    remaining[0]?.scheduledLocal?.slice(11, 16) || "18:00");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (!remaining.length || (season.matchDayHistory || []).some(item =>
      (item.scheduledMatchDayId || item.id) === day.id)) return null;
  return (
    <form style={{display: "grid", gap: 10}} onSubmit={async event => {
      event.preventDefault();
      setBusy(true); setMessage("");
      try {
        await rescheduleRemainingVenueKickoffs({
          venueId, seasonId: season.id, matchDayId: day.id, startTime: time,
        });
        setMessage("Remaining kickoff times updated.");
      } catch (error) {
        setMessage(error.message || "Could not move the remaining games.");
      } finally {setBusy(false);}
    }}>
      <label>Next unplayed game · SAST
        <input type="time" className="text-input" required disabled={busy}
          value={time} onChange={event => setTime(event.target.value)} />
      </label>
      <button type="submit" className="secondary-btn" disabled={busy}>
        {busy ? "Saving…" : "Move remaining kickoffs"}
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}

function MatchDayEditor({ venueId, season, day }) {
  const fixtures = (season.fixtures || [])
    .filter(item => item.matchDayId === day.id)
    .sort((a, b) => String(a.scheduledLocal).localeCompare(String(b.scheduledLocal)));
  const [date, setDate] = useState(day.dateLocal);
  const [time, setTime] = useState(
    fixtures[0]?.scheduledLocal?.slice(11, 16) || "18:00"
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const locked = day.status !== "scheduled" || fixtures.some(item =>
    item.status !== "scheduled" || season.liveMatches?.[item.id]);

  return (
    <details style={{ padding: "12px 0", borderTop: "1px solid rgba(148,163,184,.15)" }}>
      <summary style={{ cursor: "pointer", fontWeight: 700 }}>
        Match day {day.roundNo} · {new Intl.DateTimeFormat("en-GB", {
          day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
        }).format(new Date(`${day.dateLocal}T12:00:00Z`))}
      </summary>
      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {fixtures.map(item => (
          <div key={item.id} style={{ display: "flex", gap: 12 }}>
            <strong style={{ color: "#fbbf24" }}>
              {item.scheduledLocal?.slice(11, 16)}
            </strong>
            <span>{item.clubAName} vs {item.clubBName}</span>
          </div>
        ))}
        {!!day.byeClubIds?.length && (
          <small className="muted">Bye: {day.byeClubIds.map(id =>
            season.invitations?.[id]?.clubName || id).join(", ")}</small>
        )}
        {locked ? (
          <>
            <small className="muted">Played and live fixture times are preserved.</small>
            <RemainingKickoffEditor venueId={venueId} season={season}
              day={day} fixtures={fixtures} />
          </>
        ) : (
          <form onSubmit={async event => {
            event.preventDefault();
            if (busy) return;
            setBusy(true); setMessage("");
            try {
              await rescheduleVenueMatchDay({
                venueId, seasonId: season.id, matchDayId: day.id,
                dateLocal: date, startTime: time,
              });
              setMessage("Schedule updated.");
            } catch (error) {
              setMessage(error.message || "Could not update the schedule.");
            } finally { setBusy(false); }
          }} style={{ display: "grid", gap: 10 }}>
            <label>Match date
              <input className="text-input" type="date" required
                value={date} disabled={busy}
                onChange={event => setDate(event.target.value)} />
            </label>
            <label>First kickoff · SAST
              <input className="text-input" type="time" required
                value={time} disabled={busy}
                onChange={event => setTime(event.target.value)} />
            </label>
            <button className="secondary-btn" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save this match day"}
            </button>
          </form>
        )}
        {message && <p role="status" style={{ margin: 0 }}>{message}</p>}
      </div>
    </details>
  );
}

export default function FieldMatchDaySchedule({
  venueId, season, isCreator = false, readOnly = true,
}) {
  const [savingTesting, setSavingTesting] = useState(false);
  const [testingError, setTestingError] = useState("");
  if (readOnly) {
    const days = season?.matchDays || [];
    const fixtures = season?.fixtures || [];
    const dateLabel = value => {
      const date = new Date(`${value}T12:00:00Z`);
      return Number.isFinite(date.getTime())
        ? new Intl.DateTimeFormat("en-GB", {
            day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
          }).format(date)
        : "Date to be announced";
    };
    return (
      <details style={{
        marginBottom: "0.9rem", padding: "14px",
        border: "2px solid rgba(56,189,248,.65)", borderRadius: "1rem",
      }}>
        <summary style={{cursor: "pointer", fontWeight: 800}}>
          League settings
        </summary>
        <p className="muted small">Kickoff times are shown in South African time.</p>
        {days.length ? days.map(day => (
          <section key={day.id} style={{
            padding: "12px 0", borderTop: "1px solid rgba(148,163,184,.2)",
          }}>
            <strong>Match day {day.roundNo} · {dateLabel(day.dateLocal)}</strong>
            {fixtures.filter(item => item.matchDayId === day.id)
              .sort((a, b) => String(a.scheduledLocal).localeCompare(
                String(b.scheduledLocal)))
              .map(item => (
                <p key={item.id} style={{margin: "8px 0"}}>
                  <strong style={{color: "#fbbf24"}}>
                    {item.scheduledLocal?.slice(11, 16) || "Time TBC"}
                  </strong>
                  {" · "}{item.clubAName || item.clubAId}
                  {" vs "}{item.clubBName || item.clubBId}
                  {item.status === "completed" ? " · Completed" :
                    season.liveMatches?.[item.id]?.status === "live" ? " · Live" : ""}
                </p>
              ))}
            {!!day.byeClubIds?.length && (
              <p className="muted small">
                Not playing this day: {day.byeClubIds.map(id =>
                  season.invitations?.[id]?.clubName || id).join(", ")}
              </p>
            )}
          </section>
        )) : fixtures.length ? (
          <>
            <p className="muted small">Dates and kickoff times have not been published.</p>
            {fixtures.map(item => (
              <p key={item.id}>
                {item.clubAName || item.clubAId}
                {" vs "}{item.clubBName || item.clubBId}
                {item.status === "completed" ? " · Completed" : ""}
              </p>
            ))}
          </>
        ) : (
          <p className="muted small">The Field has not published the schedule yet.</p>
        )}
      </details>
    );
  }
  if (!season) return null;
  if (season.scheduleVersion !== 1) {
    return (
      <details style={{ padding: "12px 14px" }}>
        <summary style={{ cursor: "pointer", fontWeight: 800 }}>
          League settings
        </summary>
        <p className="muted small">
          This season uses the older schedule. Weekly dates and kickoff
          controls are available for seasons created with the new schedule.
          Existing results have been kept.
        </p>
      </details>
    );
  }
  if (!season.matchDays?.length) {
    return (
      <details style={{ padding: "12px 14px" }}>
        <summary style={{ cursor: "pointer", fontWeight: 800 }}>League settings</summary>
        <p className="muted small">
          Publish dated fixtures when Club registration is complete.
          Publishing closes registration for this season.
        </p>
        {isCreator && (
          <button type="button" className="secondary-btn" disabled={savingTesting}
            onClick={async () => {
              if (!window.confirm("Publish fixtures and close Club registration?")) return;
              setSavingTesting(true);
              setTestingError("");
              try {
                await prepareVenueSeasonForMatch({ venueId });
              } catch (error) {
                setTestingError(error.message || "Could not publish fixtures.");
              } finally { setSavingTesting(false); }
            }}>
            {savingTesting ? "Publishing…" : "Publish fixtures"}
          </button>
        )}
        {testingError && <p role="alert">{testingError}</p>}
      </details>
    );
  }
  return (
    <details style={{ padding: "12px 14px" }}>
      <summary style={{ cursor: "pointer", fontWeight: 800 }}>League settings</summary>
      <small className="muted">Kickoff times shown in South African time.</small>
      {season.allowEarlyStarts === true && (
        <p role="status" style={{ color: "#fbbf24", fontWeight: 700 }}>
          Testing mode · early match starts allowed
        </p>
      )}
      {isCreator && (
        <label style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0" }}>
          <input type="checkbox" checked={season.allowEarlyStarts === true}
            disabled={savingTesting}
            onChange={async event => {
              const enabled = event.target.checked;
              setSavingTesting(true);
              setTestingError("");
              try {
                await setVenueScheduleTesting({
                  venueId, seasonId: season.id, enabled,
                });
              } catch (error) {
                setTestingError(error.message || "Could not change testing mode.");
              } finally { setSavingTesting(false); }
            }} />
          Allow early starts for testing
        </label>
      )}
      {testingError && <p role="alert">{testingError}</p>}
      {season.matchDays.map(day => (
        <MatchDayEditor key={`${season.id}-${day.id}-${day.dateLocal}-${
          day.startTime || season.fixtures?.find(f => f.matchDayId === day.id)?.scheduledLocal
        }`} venueId={venueId} season={season} day={day} />
      ))}
    </details>
  );
}
