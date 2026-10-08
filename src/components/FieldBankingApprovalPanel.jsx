import React, {useCallback, useEffect, useRef, useState} from "react";
import {fieldTeamPaymentRequest} from "../storage/fieldTeamPaymentRepository.js";

export default function FieldBankingApprovalPanel({venueId, onReviewed}) {
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const acting = useRef(false);
  const generation = useRef(0);
  const sequence = useRef(0);

  const load = useCallback(async (signal, currentGeneration) => {
    const currentSequence = ++sequence.current;
    try {
      const result = await fieldTeamPaymentRequest(
        venueId, "bankingInbox", {}, signal
      );
      if (signal?.aborted || generation.current !== currentGeneration ||
          sequence.current !== currentSequence) return;
      setRequests(result.isManager ? result.requests || [] : []);
      setError("");
    } catch (failure) {
      if (!signal?.aborted && generation.current === currentGeneration &&
          sequence.current === currentSequence) setError(failure.message);
    }
  }, [venueId]);

  useEffect(() => {
    const currentGeneration = ++generation.current;
    const controller = new AbortController();
    setRequests([]);
    setError("");
    load(controller.signal, currentGeneration);
    const refresh = () => {
      if (!document.hidden && !acting.current) {
        load(controller.signal, currentGeneration);
      }
    };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      generation.current++;
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);

  async function review(requestId, decision) {
    if (acting.current) return;
    const currentGeneration = generation.current;
    acting.current = true;
    sequence.current++;
    setBusy(true);
    setError("");
    try {
      await fieldTeamPaymentRequest(
        venueId, "reviewSettings", {requestId, decision}
      );
      if (generation.current !== currentGeneration) return;
      await load(undefined, currentGeneration);
      if (generation.current === currentGeneration) onReviewed?.();
    } catch (failure) {
      if (generation.current === currentGeneration) setError(failure.message);
    } finally {
      acting.current = false;
      if (generation.current === currentGeneration) setBusy(false);
    }
  }

  if (!requests.length && !error) return null;
  return (
    <section className="card field-banking-approval-panel">
      <h3>Banking activation authorization</h3>
      {error && <p role="alert">{error}</p>}
      {requests.map(request => (
        <div key={request.id} style={{marginTop: 16, overflowWrap: "anywhere"}}>
          <p><strong>{request.submittedByName}</strong> has requested banking
            payment activation via 5 Asides Near Me. Authorize this Field account.</p>
          <dl>
            <dt>Account holder</dt><dd>{request.settings.bank.accountName}</dd>
            <dt>Bank</dt><dd>{request.settings.bank.bankName}</dd>
            <dt>Account number</dt><dd>{request.settings.bank.accountNumber}</dd>
            <dt>Branch code</dt><dd>{request.settings.bank.branchCode}</dd>
            <dt>Whole season price</dt>
            <dd>R {(request.settings.seasonPriceCents / 100).toFixed(2)}</dd>
            <dt>Match day price</dt>
            <dd>R {(request.settings.matchDayPriceCents / 100).toFixed(2)}</dd>
          </dl>
          <div className="actions-row" style={{flexWrap: "wrap"}}>
            <button type="button" className="primary-btn" disabled={busy}
              onClick={() => review(request.id, "authorize")}>
              Authorize banking activation
            </button>
            <button type="button" className="secondary-btn" disabled={busy}
              onClick={() => review(request.id, "reject")}>Reject</button>
          </div>
        </div>
      ))}
    </section>
  );
}
