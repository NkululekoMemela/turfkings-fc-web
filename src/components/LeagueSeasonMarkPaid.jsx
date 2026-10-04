import React, {useRef, useState} from "react";
import {confirmSeasonPayment} from "../storage/fieldSeasonSquadRepository.js";

export default function LeagueSeasonMarkPaid({
  scope, entries = [], seasonName, onConfirmed,
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const working = useRef(false);
  const money = cents => new Intl.NumberFormat("en-ZA", {
    style: "currency", currency: "ZAR",
  }).format(Number(cents) / 100);
  const available = entries.filter(entry =>
    entry.invitationStatus === "accepted" && entry.paymentStatus !== "paid");
  const chosen = available.filter(entry => selected.includes(entry.memberId));

  async function markPaid() {
    if (working.current || !chosen.length) return;
    const total = chosen.reduce((sum, entry) => sum + entry.contributionCents, 0);
    if (!window.confirm(
      `Confirm you received ${money(total)} in whole-season contributions ` +
      `from these ${chosen.length} players?`
    )) return;
    working.current = true;
    setBusy(true); setError("");
    const completed = [];
    const failed = [];
    try {
      for (const entry of chosen) {
        try {
          await confirmSeasonPayment({...scope, memberId: entry.memberId});
          completed.push(entry);
        } catch (failure) {
          failed.push(`${entry.fullName}: ${failure.message}`);
        }
      }
      if (!completed.length) {
        setError(failed.join("; "));
        return;
      }
      setSelected([]);
      setOpen(false);
      onConfirmed(
        `${completed.length} season payment${completed.length === 1 ? "" : "s"} confirmed.` +
        (failed.length ? ` Still unconfirmed: ${failed.join("; ")}` : "")
      );
    } finally {
      working.current = false; setBusy(false);
    }
  }

  return (
    <>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 12, margin: "14px 0",
      }}>
        <div>
          <strong>Manual payment confirmation</strong>
          <p className="muted small" style={{margin: "6px 0 0"}}>
            Confirm whole-season contributions received from your squad.
          </p>
        </div>
        <button type="button" className="primary-btn"
          disabled={busy} style={{touchAction: "manipulation"}}
          onClick={() => {setSelected([]); setError(""); setOpen(true);}}>
          Mark players paid
        </button>
      </div>
      {open && (
        <div className="modal-backdrop" style={{zIndex: 14000}}
          onClick={() => {if (!working.current) setOpen(false);}}>
          <div className="modal" role="dialog" aria-modal="true"
            aria-labelledby="league-mark-paid-title"
            onClick={event => event.stopPropagation()}
            style={{width: "min(94vw, 760px)", maxHeight: "92vh", overflowY: "auto"}}>
            <div style={{
              display: "flex", justifyContent: "space-between",
              alignItems: "flex-start", gap: 12, marginBottom: 14,
            }}>
              <div>
                <h3 id="league-mark-paid-title" style={{margin: 0}}>Mark players paid</h3>
                <p className="muted small" style={{margin: "6px 0 0"}}>{seasonName}</p>
              </div>
              <button type="button" className="secondary-btn"
                aria-label="Close payment confirmation"
                disabled={busy} onClick={() => setOpen(false)}>✕</button>
            </div>
            <p className="muted small">
              Select players whose whole-season cash, EFT or other manual
              payment you have received. Pending invitations must be accepted first.
            </p>
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 10, marginTop: 14,
            }}>
              {entries.map(entry => {
                const paid = entry.paymentStatus === "paid";
                const accepted = entry.invitationStatus === "accepted";
                const picked = selected.includes(entry.memberId);
                return (
                  <button key={entry.memberId} type="button"
                    className={picked ? "primary-btn" : "secondary-btn"}
                    disabled={busy || paid || !accepted}
                    aria-pressed={picked}
                    onClick={() => setSelected(previous =>
                      previous.includes(entry.memberId)
                        ? previous.filter(id => id !== entry.memberId)
                        : [...previous, entry.memberId])}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      justifyContent: "flex-start", minHeight: 64,
                      textAlign: "left", opacity: paid || !accepted ? .55 : 1,
                      touchAction: "manipulation", minWidth: 0,
                    }}>
                    <span aria-hidden="true" style={{
                      width: 44, height: 44, borderRadius: "50%",
                      flex: "0 0 44px", display: "grid", placeItems: "center",
                      background: "rgba(255,255,255,.08)", fontWeight: 800,
                    }}>
                      {entry.fullName?.split(/\s+/).slice(0, 2)
                        .map(part => part[0]).join("")}
                    </span>
                    <span style={{flex: 1, minWidth: 0, overflowWrap: "anywhere"}}>
                      <strong>{entry.fullName}</strong>
                      <small style={{display: "block", marginTop: 4}}>
                        {money(entry.contributionCents)} · {paid ? "Paid" :
                          accepted ? "Unpaid" : entry.invitationStatus}
                      </small>
                    </span>
                    <span aria-hidden="true">{paid || picked ? "✓" : "○"}</span>
                  </button>
                );
              })}
            </div>
            <div className="actions-row" style={{marginTop: 16}}>
              <span>{chosen.length} selected</span>
              <button type="button" className="secondary-btn" disabled={busy}
                onClick={() => setSelected(available.map(entry => entry.memberId))}>
                Select unpaid
              </button>
              <button type="button" className="secondary-btn" disabled={busy}
                onClick={() => setSelected([])}>Clear</button>
            </div>
            {error && <p className="error-text" role="alert">{error}</p>}
            <div className="actions-row" style={{marginTop: 18}}>
              <button type="button" className="secondary-btn"
                disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
              <button type="button" className="primary-btn"
                disabled={busy || !chosen.length} onClick={markPaid}>
                {busy ? "Marking paid…" : `Mark selected as paid (${chosen.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
