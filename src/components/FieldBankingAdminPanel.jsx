import React, {useCallback, useEffect, useRef, useState} from "react";
import FieldBankingSettingsForm from "./FieldBankingSettingsForm.jsx";
import {fieldTeamPaymentRequest} from "../storage/fieldTeamPaymentRepository.js";

function BankingContent({venueId, onSaved}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const generation = useRef(0);
  const sequence = useRef(0);

  const load = useCallback(async (signal, currentGeneration) => {
    const currentSequence = ++sequence.current;
    try {
      const result = await fieldTeamPaymentRequest(venueId, "view", {}, signal);
      if (signal?.aborted || generation.current !== currentGeneration ||
          sequence.current !== currentSequence) return;
      setData(result);
      setError("");
    } catch (failure) {
      if (!signal?.aborted && generation.current === currentGeneration &&
          sequence.current === currentSequence) setError(failure.message);
    }
  }, [venueId]);

  useEffect(() => {
    const currentGeneration = ++generation.current;
    const controller = new AbortController();
    load(controller.signal, currentGeneration);
    return () => {
      generation.current++;
      controller.abort();
    };
  }, [load]);

  const refresh = () => load(undefined, generation.current);

  return (
    <>
      {error && <p role="alert">{error}
        <button type="button" className="secondary-btn"
          onClick={refresh}>Retry</button>
      </p>}
      {!data && !error && <p role="status">Loading banking settings…</p>}
      {message && <p role="status">{message}</p>}
      {data && (
        <>
          <FieldBankingSettingsForm
            key={`${venueId}:${data.settings.revision}`}
            venueId={venueId} settings={data.settings}
            isManager={data.isManager}
            onSaved={result => {
              setMessage("Banking details and prices saved.");
              refresh();
              onSaved?.(result);
            }}
          />
        </>
      )}
    </>
  );
}

export default function FieldBankingAdminPanel({venueId, defaultOpen = false, onSaved}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);
  return (
    <details className="card" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
      <summary style={{cursor: "pointer", fontWeight: 800}}>
        Banking details and hourly rate
      </summary>
      {open && <BankingContent key={venueId} venueId={venueId} onSaved={onSaved} />}
    </details>
  );
}
