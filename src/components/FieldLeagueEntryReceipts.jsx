import React, {useEffect, useRef, useState} from "react";
import {fieldTeamPaymentRequest} from "../storage/fieldTeamPaymentRepository.js";

const money = cents => new Intl.NumberFormat("en-ZA", {
  style: "currency", currency: "ZAR",
}).format(cents / 100);

export default function FieldLeagueEntryReceipts({venueId, seasonId}) {
  const [clubs, setClubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const lock = useRef(false);
  const refresh = useRef(null);

  useEffect(() => {
    let disposed = false;
    let sequence = 0;
    let controller;
    async function load() {
      const current = ++sequence;
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      try {
        const result = await fieldTeamPaymentRequest(
          venueId, "leagueEntryView", {seasonId}, signal
        );
        if (disposed || signal.aborted || current !== sequence) return;
        setClubs(result.clubs);
        setError("");
      } catch (failure) {
        if (!disposed && !signal.aborted && current === sequence) {
          setError(failure.message || "Could not load Club receipts.");
        }
      } finally {
        if (!disposed && current === sequence) setLoading(false);
      }
    }
    refresh.current = load;
    load();
    const interval = window.setInterval(() => {
      if (!lock.current) load();
    }, 15000);
    return () => {
      disposed = true;
      controller?.abort();
      window.clearInterval(interval);
      refresh.current = null;
    };
  }, [venueId, seasonId]);

  async function markPaid(club) {
    if (lock.current || club.paid) return;
    if (!window.confirm(
      `Confirm the Field has received ${money(club.amountCents)} ` +
      `for ${club.clubName}'s league entry? ` +
      "Confirm only after receiving their cash, EFT or other agreed payment."
    )) return;
    lock.current = true;
    setBusyId(club.clubId);
    setError("");
    try {
      await fieldTeamPaymentRequest(venueId, "confirmLeagueEntry", {
        seasonId, clubId: club.clubId,
        expectedAmountCents: club.amountCents,
      });
      await refresh.current?.();
    } catch (failure) {
      setError(failure.message || "Could not record receipt.");
    } finally {
      lock.current = false;
      setBusyId("");
    }
  }

  return (
    <section className="card signup-summary-card">
      <div className="signup-summary-header">
        <h3>Participating league clubs</h3>
      </div>
      <p className="muted small">
        Acceptance reserves their place in preparation. Confirm entry payment
        received through your existing arrangement before they play.
      </p>
      {loading && <p role="status">Loading accepted Clubs…</p>}
      {!loading && !clubs.length && !error && (
        <p className="muted small">No Clubs have accepted yet.</p>
      )}
      <div style={{display: "grid", gap: 8, marginTop: 12}}>
        {clubs.map(club => (
          <div key={club.clubId} style={{
            display: "flex", alignItems: "center", flexWrap: "wrap",
            gap: 10, padding: "10px 12px", borderRadius: 12,
            background: "rgba(255,255,255,.035)",
            border: `1px solid ${club.paid
              ? "rgba(74,222,128,.3)" : "rgba(250,204,21,.22)"}`,
          }}>
            <span aria-hidden="true" style={{
              width: 36, height: 36, flex: "0 0 36px",
              borderRadius: "50%", overflow: "hidden",
              display: "grid", placeItems: "center",
              background: "rgba(255,255,255,.08)",
              border: "1px solid rgba(255,255,255,.12)",
            }}>
              {club.logoUrl ? (
                <img src={club.logoUrl} alt=""
                  style={{width: "100%", height: "100%", objectFit: "contain"}}
                  onError={event => {
                    event.currentTarget.style.display = "none";
                  }} />
              ) : "⚽"}
            </span>
            <div style={{flex: "1 1 110px", minWidth: 0}}>
              <strong style={{overflowWrap: "anywhere"}}>{club.clubName}</strong>
              <p className="muted small" style={{margin: "3px 0 0"}}>{money(club.amountCents)} entry</p>
              {club.paid ? (
                <p className="muted small" style={{margin: "3px 0 0"}}>
                  Recorded by {club.confirmedByName} · {new Intl.DateTimeFormat(
                    "en-ZA", {
                      timeZone: "Africa/Johannesburg",
                      dateStyle: "medium", timeStyle: "short",
                    }
                  ).format(new Date(club.confirmedAtMs))}
                </p>
              ) : (
                <p className="muted small" style={{margin: "3px 0 0"}}>
                  Payment outstanding
                </p>
              )}
            </div>
            {club.paid ? (
              <strong role="status" style={{color: "#4ade80"}}>✓ Paid</strong>
            ) : (
              <button type="button" className="primary-btn"
                style={{minHeight: 44, padding: "8px 14px", fontSize: 13}}
                disabled={Boolean(busyId)}
                onClick={() => markPaid(club)}>
                {busyId === club.clubId ? "Recording…" : "Mark paid"}
              </button>
            )}
          </div>
        ))}
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
    </section>
  );
}
