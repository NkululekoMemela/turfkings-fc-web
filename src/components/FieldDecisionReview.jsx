import React, {useEffect, useState} from "react";
import {
  watchFieldDecisions, reviewFieldDecision,
} from "../storage/fieldDecisionRepository.js";

const actionLabel = action => ({
  reschedule_day: "Change match-day date and kickoffs",
  delay_remaining: "Move remaining kickoff times",
  cancel_season: "Cancel season",
  delete_day_results: "Delete match-day results",
}[action] || action);

const timeLabel = value => String(value || "Time not published").replace("T", " · ");

export default function FieldDecisionReview({scope = null, venueId, seasonId, isCreator}) {
  const [requests, setRequests] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [dismissed, setDismissed] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setRequests([]);
    setSelectedId("");
    setDismissed([]);
    setError("");
    return watchFieldDecisions({
      scope, venueId, isCreator,
      onData: setRequests,
      onError: failure => setError(failure.message || "Could not load Field requests."),
    });
  }, [venueId, isCreator, seasonId, scope?.environment, scope?.practiceSessionId]);

  const current = requests.filter(item => item.seasonId === seasonId);
  const pending = current.filter(item => item.status === "pending");
  const selected = pending.find(item => item.id === selectedId);

  useEffect(() => {
    if (!isCreator || selectedId) return;
    const next = pending.find(item => !dismissed.includes(item.id));
    if (next) setSelectedId(next.id);
  }, [isCreator, pending, dismissed, selectedId]);

  function later() {
    setDismissed(previous => [...previous, selectedId]);
    setSelectedId("");
    setError("");
  }

  async function respond(response) {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      await reviewFieldDecision({scope, venueId, requestId: selected.id, response});
      setDismissed(previous => [...previous, selected.id]);
      setSelectedId("");
    } catch (failure) {
      setError(failure.message || "Could not review this request.");
    } finally {
      setBusy(false);
    }
  }

  if (!current.length && !error) return null;

  return (
    <>
      <details className="card" style={{
        padding: 14, marginBottom: 14,
        border: "1px solid rgba(192,132,252,.5)",
      }}>
        <summary style={{cursor: "pointer", fontWeight: 800}}>
          {isCreator ? "Manager approvals" : "Your Field requests"}
          {pending.length ? ` · ${pending.length} pending` : ""}
        </summary>
        {current.map(item => (
          <div key={item.id} style={{
            padding: "10px 0", borderTop: "1px solid rgba(148,163,184,.2)",
          }}>
            <strong>{actionLabel(item.decision?.action)}</strong>
            <p style={{margin: "5px 0"}}>{item.decision?.reason}</p>
            <span className="muted small">
              {item.status === "pending" && item.expiresAtMs <= Date.now()
                ? "Expired · submit a new request" : item.status}
            </span>
            {isCreator && item.status === "pending" && (
              <button type="button" className="secondary-btn"
                style={{marginLeft: 10}} onClick={() => {
                  setError(""); setSelectedId(item.id);
                }}>Review</button>
            )}
          </div>
        ))}
        {!selected && error && <p role="alert">{error}</p>}
      </details>

      {isCreator && selected && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 2000,
          background: "rgba(2,6,23,.85)", display: "grid",
          placeItems: "center", padding: 16,
        }}>
          <section role="dialog" aria-modal="true"
            aria-labelledby="field-decision-title" className="card"
            style={{
              width: "100%", maxWidth: 520, maxHeight: "85vh",
              overflowY: "auto", padding: 20,
              background: "#21152f", color: "#faf5ff",
              border: "2px solid #c084fc",
            }}>
            <h3 id="field-decision-title">Manager approval required</h3>
            <strong>{actionLabel(selected.decision?.action)}</strong>
            <p>{selected.decision?.reason}</p>
            <p className="muted small">
              South African time. Approval applies the exact proposal below.
            </p>
            {(selected.summary?.before || []).map(item => {
              const after = selected.summary?.after?.find(next => next.id === item.id);
              return (
                <p key={item.id}>
                  {timeLabel(item.scheduledLocal)}
                  {" → "}
                  <strong>{timeLabel(after?.scheduledLocal)}</strong>
                </p>
              );
            })}
            {selected.expiresAtMs <= Date.now() && (
              <p role="status">This request has expired. Reject it and ask for a new request.</p>
            )}
            {error && <p role="alert">{error}</p>}
            <div style={{display: "flex", flexWrap: "wrap", gap: 10}}>
              <button autoFocus type="button" className="primary-btn"
                disabled={busy || selected.expiresAtMs <= Date.now()}
                onClick={() => respond("approve")}>
                {busy ? "Saving…" : "Approve change"}
              </button>
              <button type="button" className="secondary-btn" disabled={busy}
                onClick={() => respond("reject")}>Reject</button>
              <button type="button" className="secondary-btn" disabled={busy}
                onClick={later}>Review later</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
