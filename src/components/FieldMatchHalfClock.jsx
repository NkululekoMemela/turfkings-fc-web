import React, {useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {fieldHalfSecondsLeft} from "../core/fieldMatchClock.js";
import "./FieldMatchHalfClock.css";

const clock = seconds => {
  const value = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:` +
    String(value % 60).padStart(2, "0");
};

export default function FieldMatchHalfClock({state, canControl, onStartSecondHalf}) {
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const audio = useRef(null);
  const reminded = useRef(null);
  const halftime = state?.clockVersion === 1 && state.clockPhase === "halftime";
  const deadline = Number(state?.halftimeEndsAtMs) || 0;
  const breakLeft = Math.max(0, (deadline - now) / 1000);

  // Unlock sound during a normal referee gesture, including on iOS.
  useEffect(() => {
    if (!canControl) return undefined;
    const unlock = () => {
      try {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (Context && !audio.current) audio.current = new Context();
        audio.current?.resume().catch(() => {});
      } catch { /* Vibration and the visible reminder remain available. */ }
    };
    window.addEventListener("pointerup", unlock, {passive: true});
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerup", unlock);
      window.removeEventListener("keydown", unlock);
      audio.current?.close().catch(() => {});
      audio.current = null;
    };
  }, [canControl]);

  useEffect(() => {
    if (!halftime) return undefined;
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 250);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [halftime, deadline]);

  useEffect(() => {
    if (!halftime || !canControl || busy || !deadline || breakLeft > 0 ||
        reminded.current === deadline) return;
    reminded.current = deadline;
    navigator.vibrate?.([200, 120, 200]);
    const context = audio.current;
    if (context?.state !== "running") return;
    for (const [offset, frequency] of [[0, 740], [.24, 988]]) {
      const tone = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + offset;
      tone.frequency.value = frequency;
      gain.gain.setValueAtTime(.16, start);
      gain.gain.exponentialRampToValueAtTime(.001, start + .18);
      tone.connect(gain).connect(context.destination);
      tone.start(start);
      tone.stop(start + .2);
    }
  }, [halftime, canControl, deadline, breakLeft, busy]);

  if (state?.clockVersion !== 1) return null;
  const label = {first_half: "First half", halftime: "Halftime",
    second_half: "Second half", full_time: "Full time"}[state.clockPhase] || "Match";
  if (!halftime || !canControl) return (
    <section className="card field-half-clock-status">
      <strong>{label} · {clock(halftime ? breakLeft : fieldHalfSecondsLeft(state))}</strong>
    </section>
  );

  return createPortal(
    <section className="field-half-clock-dock" aria-label="Half-time controls">
      <div><strong>Half-time · <span role="timer">{clock(breakLeft)}</span></strong>
        <small role="status">{breakLeft > 0 ? "Playing time paused" : "Break over. Start the second half."}</small>
      </div>
      <button type="button" className="primary-btn" disabled={busy}
        onClick={async () => {
          setBusy(true); setError("");
          try { await onStartSecondHalf(); }
          catch (failure) { setError(failure.message || "Could not start the second half."); }
          finally { setBusy(false); }
        }}>{busy ? "Starting…" : "Start second half"}</button>
      {error && <small role="alert" className="error-text">{error}</small>}
    </section>,
    document.body
  );
}
