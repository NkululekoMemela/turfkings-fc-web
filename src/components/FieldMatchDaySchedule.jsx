import {fieldConfirm,fieldAlert,fieldPrompt} from './FieldDialog.jsx';
import FieldScheduleFixtures, {FieldFixtureCard} from "./FieldScheduleFixtures.jsx";
import React, { useState } from "react";
import { prepareVenueSeasonForMatch } from "../storage/leagueSeasonRepository.js";
import {submitFieldDecision} from "../storage/fieldDecisionRepository.js";

function RemainingKickoffEditor({scope, venueId, season, day, fixtures}) {
  const remaining = fixtures.filter(item =>
    item.status === "scheduled" && !season.liveMatches?.[item.id]);
  const [time, setTime] = useState(
    remaining[0]?.scheduledLocal?.slice(11, 16) || "18:00");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");
  if (!remaining.length || (season.matchDayHistory || []).some(item =>
      (item.scheduledMatchDayId || item.id) === day.id)) return null;
  return (
    <form style={{display: "grid", gap: 10}} onSubmit={async event => {
      event.preventDefault();
      setBusy(true); setMessage("");
      try {
        await submitFieldDecision({
          scope, venueId, seasonId: season.id, action: "delay_remaining", reason,
          parameters: {matchDayId: day.id, startTime: time},
        });
        setMessage("Request sent. Times change after the Field creator approves.");
        setReason("");
      } catch (error) {
        setMessage(error.message || "Could not move the remaining games.");
      } finally {setBusy(false);}
    }}>
      <label>Next unplayed game · SAST
        <input type="time" className="text-input" required disabled={busy}
          value={time} onChange={event => setTime(event.target.value)} />
      </label>
      <label>Reason for changing the schedule
        <textarea className="text-input" required minLength={10} maxLength={500}
          disabled={busy} value={reason}
          placeholder="For example: heavy rain has made the pitch unsafe."
          onChange={event => setReason(event.target.value)} />
      </label>
      <button type="submit" className="secondary-btn" disabled={busy}>
        {busy ? "Sending…" : "Request new kickoff times"}
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}

function ParallelKickoffEditor({scope, venueId, season, day, fixtures}) {
  const available = fixtures.filter(f => f.status === "scheduled" && !season.liveMatches?.[f.id] && !f.pitchNumber);
  const [selected, setSelected] = useState([]);
  const [time, setTime] = useState(available[0]?.scheduledLocal?.slice(11,16) || "18:00");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (available.length < 2) return null;
  return <details>
    <summary>Schedule on separate pitches</summary>
    <form style={{display:"grid",gap:8}} onSubmit={async event => {
      event.preventDefault();
      if (busy || selected.length < 2) return;
      setBusy(true);
      try {
        await submitFieldDecision({scope,venueId,seasonId:season.id,action:"parallel_kickoff",
          reason,parameters:{matchDayId:day.id,startTime:time,fixtureIds:selected}});
        setMessage("Request sent. The Field creator must approve the shared kickoff.");
        setSelected([]);setReason("");
      } catch (error) { setMessage(error.message || "Could not request a shared kickoff."); }
      finally { setBusy(false); }
    }}>
      <small>Choose fixtures in pitch order. The first selection is Pitch 1.</small>
      {available.map(f => <label key={f.id}>
        <input type="checkbox" disabled={busy || (!selected.includes(f.id) && selected.length >= 8)}
          checked={selected.includes(f.id)}
          onChange={event => setSelected(previous => event.target.checked ? [...previous,f.id] : previous.filter(id => id !== f.id))}/>
        {f.clubAName || f.clubAId} vs {f.clubBName || f.clubBId}
        {selected.includes(f.id) && ` · Pitch ${selected.indexOf(f.id)+1}`}
      </label>)}
      <label>Shared kickoff · SAST <input type="time" className="text-input" required value={time}
        onChange={event => setTime(event.target.value)} disabled={busy}/></label>
      <label>Reason <textarea className="text-input" required minLength={10} maxLength={500}
        value={reason} onChange={event => setReason(event.target.value)} disabled={busy}/></label>
      <button type="submit" className="secondary-btn" disabled={busy || selected.length < 2}>Request parallel kickoff</button>
      {message && <p role="status">{message}</p>}
    </form>
  </details>;
}

function MatchDayEditor({ scope, venueId, season, day, teams }) {
  const fixtures = (season.fixtures || [])
    .filter(item => item.matchDayId === day.id)
    .sort((a, b) => String(a.scheduledLocal).localeCompare(String(b.scheduledLocal)));
  const [date, setDate] = useState(day.dateLocal);
  const [time, setTime] = useState(
    fixtures[0]?.scheduledLocal?.slice(11, 16) || "18:00"
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");
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
          <FieldFixtureCard key={item.id} fixture={item} teams={teams} season={season} />
        ))}
        {!!day.byeClubIds?.length && (
          <small className="muted">Bye: {day.byeClubIds.map(id =>
            season.invitations?.[id]?.clubName || id).join(", ")}</small>
        )}
        {day.status === "scheduled" && <ParallelKickoffEditor scope={scope} venueId={venueId}
          season={season} day={day} fixtures={fixtures} />}
        {locked ? (
          <>
            <small className="muted">Played and live fixture times are preserved.</small>
            <RemainingKickoffEditor scope={scope} venueId={venueId} season={season}
              day={day} fixtures={fixtures} />
          </>
        ) : (
          <form onSubmit={async event => {
            event.preventDefault();
            if (busy) return;
            setBusy(true); setMessage("");
            try {
              await submitFieldDecision({
                scope, venueId, seasonId: season.id, action: "reschedule_day", reason,
                parameters: {
                  matchDayId: day.id, dateLocal: date, startTime: time,
                },
              });
              setMessage("Request sent. The schedule changes after the Field creator approves.");
              setReason("");
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
            <label>Reason for changing the schedule
        <textarea className="text-input" required minLength={10} maxLength={500}
          disabled={busy} value={reason}
          placeholder="For example: heavy rain has made the pitch unsafe."
          onChange={event => setReason(event.target.value)} />
      </label>
      <button className="secondary-btn" type="submit" disabled={busy}>
              {busy ? "Sending…" : "Request schedule change"}
            </button>
          </form>
        )}
        {message && <p role="status" style={{ margin: 0 }}>{message}</p>}
      </div>
    </details>
  );
}

export default function FieldMatchDaySchedule({
  scope = null, onPublish = null,
  venueId, season, isCreator = false, readOnly = true, teams = [], myClubId = "",
}) {
  const [savingTesting, setSavingTesting] = useState(false);
  const [testingError, setTestingError] = useState("");
  if (readOnly) {
    return (
      <details style={{
        marginBottom: "0.9rem", padding: "14px",
        border: "2px solid rgba(56,189,248,.65)", borderRadius: "1rem",
      }}>
        <summary style={{cursor: "pointer", fontWeight: 800}}>
          League fixtures
        </summary>
        <p className="muted small">Kickoff times are shown in South African time.</p>
        <FieldScheduleFixtures season={season} teams={teams} myClubId={myClubId} />
      </details>
    );
  }
  if (!season) return null;
  if (season.scheduleVersion !== 1) {
    return (
      <details style={{
      padding: "14px",
      border: "2px solid rgba(56,189,248,.65)",
      borderRadius: "1rem",
      marginBottom: "0.9rem",
    }}>
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
      <details open style={{
      padding: "14px",
      border: "2px solid rgba(56,189,248,.65)",
      borderRadius: "1rem",
      marginBottom: "0.9rem",
    }}>
        <summary style={{ cursor: "pointer", fontWeight: 800 }}>Publish league fixtures</summary>
        <p className="muted small">
          Publish dated fixtures when Club registration is complete.
          Publishing closes registration for this season.
        </p>
        {isCreator && (
          <button type="button" className="secondary-btn" disabled={savingTesting}
            onClick={async () => {
              if (!(await fieldConfirm("Publish fixtures and close Club registration?"))) return;
              setSavingTesting(true);
              setTestingError("");
              try {
                if (scope?.environment === "practice") {
                  if (!onPublish) throw new Error("Practice publishing adapter required.");
                  await onPublish();
                } else {
                  await prepareVenueSeasonForMatch({ venueId });
                }
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
    <details style={{
      padding: "14px",
      border: "2px solid rgba(56,189,248,.65)",
      borderRadius: "1rem",
      marginBottom: "0.9rem",
    }}>
      <summary style={{ cursor: "pointer", fontWeight: 800 }}>League settings</summary>
      <p className="muted small">View the published games using Fixtures on Field Home.</p>
      <small className="muted">Schedule change requests</small>
      <p className="muted small">Starting outside fixture time asks you to choose Practice or confirm Official play.</p>
      {season.matchDays.map(day => (
        <MatchDayEditor key={`${season.id}-${day.id}-${day.dateLocal}-${
          day.startTime || season.fixtures?.find(f => f.matchDayId === day.id)?.scheduledLocal
        }`} scope={scope} venueId={venueId} season={season} day={day} teams={teams} />
      ))}
    </details>
  );
}
