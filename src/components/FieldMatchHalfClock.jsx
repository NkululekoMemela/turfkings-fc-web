import React, {useEffect, useState} from "react";
import {fieldHalfSecondsLeft} from "../core/fieldMatchClock.js";

const clock = seconds => {
  const value = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:` +
    String(value % 60).padStart(2, "0");
};

export default function FieldMatchHalfClock({state, canControl, onStartSecondHalf}) {
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (state?.clockPhase !== "halftime") return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [state?.clockPhase, state?.halftimeEndsAtMs]);
  if (state?.clockVersion !== 1) return null;
  const halftime = state.clockPhase === "halftime";
  const breakLeft = Math.max(0, (state.halftimeEndsAtMs - now) / 1000);
  const label = {
    first_half: "First half", halftime: "Halftime",
    second_half: "Second half", full_time: "Full time",
  }[state.clockPhase] || "Match";
  return (
    <section className="card" role="status"
      style={{marginBottom: 12, padding: 16, border: "1px solid rgba(251,191,36,.3)"}}>
      <strong style={{color: "#fbbf24"}}>
        {label} · {clock(halftime ? breakLeft : fieldHalfSecondsLeft(state))}
      </strong>
      {halftime && (
        <>
          <p>{breakLeft > 0
            ? "Halftime break. Playing time is paused."
            : "The break is complete. Waiting for the referee to start the second half."}</p>
          {canControl && (
            <button type="button" className="primary-btn"
              disabled={busy || breakLeft > 0}
              onClick={async () => {
                setBusy(true); setError("");
                try {await onStartSecondHalf();}
                catch (failure) {setError(failure.message || "Could not start the second half.");}
                finally {setBusy(false);}
              }}>{busy ? "Starting…" : "Start Second Half"}</button>
          )}
          {error && <p role="alert" className="error-text">{error}</p>}
        </>
      )}
    </section>
  );
}
