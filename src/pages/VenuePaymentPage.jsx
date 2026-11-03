import React, {useCallback, useEffect, useRef, useState} from "react";
import FieldTeamPaymentCard from "../components/FieldTeamPaymentCard.jsx";
import {fieldTeamPaymentRequest} from "../storage/fieldTeamPaymentRepository.js";

export default function VenuePaymentPage({venue, clubId = "", onBack}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const sequence = useRef(0);
  const acting = useRef(false);

  const load = useCallback(async (signal, currentGeneration) => {
    const currentSequence = ++sequence.current;
    try {
      const result = await fieldTeamPaymentRequest(
        venue.id, "paymentView", {clubId}, signal
      );
      if (signal?.aborted || generation.current !== currentGeneration ||
          sequence.current !== currentSequence) return;
      setData(result);
      setError("");
    } catch (failure) {
      if (!signal?.aborted && generation.current === currentGeneration &&
          sequence.current === currentSequence) setError(failure.message);
    }
  }, [venue.id, clubId]);

  useEffect(() => {
    const currentGeneration = ++generation.current;
    const controller = new AbortController();
    setData(null);
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

  async function act(action, booking, received) {
    if (acting.current) return;
    const currentGeneration = generation.current;
    acting.current = true;
    sequence.current++;
    setBusy(true);
    setError("");
    try {
      const details = {bookingId: booking.id};
      if (action === "verify") {
        const text = String(received).trim();
        if (!/^\d+(\.\d{1,2})?$/.test(text)) {
          throw new Error("Enter the received total with up to two decimal places.");
        }
        const [whole, fraction = ""] = text.split(".");
        details.receivedCents = Number(whole) * 100 +
          Number(fraction.padEnd(2, "0"));
      }
      await fieldTeamPaymentRequest(venue.id, action, details);
      if (generation.current === currentGeneration) {
        await load(undefined, currentGeneration);
      }
    } catch (failure) {
      if (generation.current === currentGeneration) setError(failure.message);
    } finally {
      acting.current = false;
      if (generation.current === currentGeneration) setBusy(false);
    }
  }

  return (
    <div className="page payment-page">
      <section className="card payment-hero-card">
        <div className="payment-hero-top">
          <div>
            <h2>Payment</h2>
            <p className="muted">Club payments to {venue.name}.</p>
          </div>
          <button type="button" className="secondary-btn"
            disabled={busy} onClick={onBack}>← Back</button>
        </div>
      </section>
      {error && <section className="card">
        <p role="alert">{error}</p>
        <button type="button" className="secondary-btn" disabled={busy}
          onClick={() => load(undefined, generation.current)}>Try again</button>
      </section>}
      {!data && !error && <section className="card">
        <p className="muted" role="status">Loading...</p>
      </section>}
      {data && !data.bookings.length && <section className="card">
        <p>No bookings yet. Select games on Signup before proceeding to payment.</p>
      </section>}
      {data?.bookings.map(booking => (
        <FieldTeamPaymentCard key={booking.id}
          booking={booking} isAdmin={data.isAdmin} busy={busy}
          onReport={item => act("report", item)}
          onVerify={(item, received) => act("verify", item, received)}
        />
      ))}
    </div>
  );
}
