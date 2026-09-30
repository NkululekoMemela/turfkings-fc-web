import React, { useEffect, useMemo, useState } from "react";
import {
  decideVenueCameraRequest,
  watchVenueCameraRequests,
} from "../storage/venueCameraApprovalRepository.js";

export default function VenueCameraApprovalPanel({
  venueId, seasonId, fixtureId,
}) {
  const [requests, setRequests] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!venueId || !seasonId || !fixtureId) return undefined;
    return watchVenueCameraRequests({
      venueId,
      seasonId,
      onData: setRequests,
      onError: (cause) => setError(
        cause?.message || "Could not load camera requests."
      ),
    });
  }, [venueId, seasonId, fixtureId]);

  const pending = useMemo(() =>
    requests.filter((request) =>
      request.fixtureId === fixtureId &&
      request.status === "pending"
    ).sort((a, b) =>
      Number(a.requestedAtMs || 0) - Number(b.requestedAtMs || 0)
    ), [requests, fixtureId]);

  const current = pending[0];
  if (!current) return null;

  const decide = async (approved) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await decideVenueCameraRequest({
        venueId,
        seasonId,
        fixtureId,
        uid: current.requestedByUid,
        approved,
      });
    } catch (cause) {
      setError(cause?.message || "Could not decide camera access.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <section className="modal" role="dialog" aria-modal="true"
        aria-labelledby="field-camera-request-title">
        <h3 id="field-camera-request-title">Camera access request</h3>
        <p>
          <strong>{current.requesterName || "A cameraman"}</strong>
          {" wants to save this match recording to the Field."}
        </p>
        <p>Approve only if you authorize this person to record the current match.</p>
        {pending.length > 1 && (
          <p>{pending.length - 1} more camera request(s) waiting.</p>
        )}
        {error && <p className="error-text" role="alert">{error}</p>}
        <div className="actions-row">
          <button type="button" className="secondary-btn"
            disabled={busy} onClick={() => decide(false)}>
            Deny
          </button>
          <button type="button" className="primary-btn"
            disabled={busy} onClick={() => decide(true)}>
            {busy ? "Saving…" : "Approve camera"}
          </button>
        </div>
      </section>
    </div>
  );
}
