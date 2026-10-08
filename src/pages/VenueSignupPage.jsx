import {fieldPageKey, readFieldPage, saveFieldPage} from "../storage/fieldPageMemory.js";
import FieldLeagueEntryReceipts from "../components/FieldLeagueEntryReceipts.jsx";
import {fieldSeasonProjectedPrizes} from "../core/fieldSeasonLifecycle.js";
import React, {useEffect, useState} from "react";
import FieldBankingAdminPanel from "../components/FieldBankingAdminPanel.jsx";
import {fieldTeamPaymentRequest} from "../storage/fieldTeamPaymentRepository.js";

export default function VenueSignupPage({
  venue, clubId = "", canManageBanking = false, openBanking = false,
}) {
  const memoryKey = fieldPageKey("signup", venue.id, clubId, canManageBanking);
  const [data, setData] = useState(() => readFieldPage(memoryKey));
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(readFieldPage(memoryKey));
    setError("");
    fieldTeamPaymentRequest(
      venue.id, "signupView", {clubId}, controller.signal
    ).then(result => {
      if (!controller.signal.aborted) {
        saveFieldPage(memoryKey, result);
        setData(result);
      }
    }).catch(failure => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    return () => controller.abort();
  }, [venue.id, clubId, revision, memoryKey]);

  const leagueSeason = venue?.league?.activeSeason;
  const showLeague = Boolean(
    leagueSeason?.id &&
    leagueSeason.status === "active" &&
    leagueSeason.announcedAtMs
  );
  const registeredClubs = (leagueSeason?.clubIds || []).length;
  const projectedPrizes = showLeague
    ? fieldSeasonProjectedPrizes(leagueSeason, registeredClubs)
    : null;
  const money = value => new Intl.NumberFormat("en-ZA", {
    style: "currency", currency: "ZAR",
  }).format(Number(value || 0));

  return (
    <div className="page match-signup-page">

      {error && (
        <p role="alert">{error}
          <button type="button" className="secondary-btn"
            onClick={() => setRevision(value => value + 1)}>Try again</button>
        </p>
      )}
      {!data && !error && <p role="status">Loading league information…</p>}
      {showLeague && (
        <section className="card signup-summary-card"
          style={{
            border: "1px solid rgba(250,204,21,0.35)",
            background: "linear-gradient(135deg, rgba(30,41,59,0.96), rgba(15,23,42,0.98))",
          }}>
          <div className="signup-summary-header">
            <div style={{display: "flex", gap: 14, alignItems: "center"}}>
              <span aria-hidden="true" style={{fontSize: 36}}>🏆</span>
              <div>
                <p style={{margin: "0 0 4px", color: "#facc15",
                  fontSize: 11, fontWeight: 800, letterSpacing: "0.1em"}}>
                  THE SEASON IS ON
                </p>
                <h3 style={{margin: 0}}>{leagueSeason.name || "Field League"}</h3>
              </div>
            </div>
          </div>
          <p className="muted small">
            Bring your Club. Take on the competition. Chase the title.
          </p>
          <div className="signup-summary-rows">
            <div className="summary-row">
              <span>Club entry fee</span>
              <strong>{money(leagueSeason.entryFee)}</strong>
            </div>
            {["first", "second", "third"].map((place, index) => (
              <div className="summary-row" key={place}>
                <span>{["🥇 Champions", "🥈 Runners-up", "🥉 Third place"][index]}</span>
                <strong>{money(projectedPrizes[place])}</strong>
              </div>
            ))}
            <div className="summary-row">
              <span>Clubs registered</span>
              <strong>{registeredClubs}</strong>
            </div>
          </div>
          <p className="muted small">
            Accept your league invitation to commit your Club.
            Arrange payment directly with the Field.
            Acceptance does not require immediate payment.
          </p>
        </section>
      )}
      {showLeague && canManageBanking && data?.isAdmin && (
        <FieldLeagueEntryReceipts
          key={`${venue.id}:${leagueSeason.id}`}
          venueId={venue.id}
          seasonId={leagueSeason.id}
        />
      )}
      {canManageBanking && data?.canManageBanking && (
        <FieldBankingAdminPanel
          venueId={venue.id}
          defaultOpen={openBanking}
          onSaved={() => setRevision(value => value + 1)}
        />
      )}
      {data?.settings?.bank && (
        <section className="card signup-summary-card">
          <div className="signup-summary-header">
            <h3>Field banking details</h3>
          </div>
          {data.settings ? (
            <div className="signup-summary-rows">
              <div className="summary-row">
                <span>Field booking rate</span>
                <strong>{data.settings.matchDayPriceCents > 0
                  ? `${new Intl.NumberFormat("en-ZA", {
                      style: "currency", currency: "ZAR",
                    }).format(data.settings.matchDayPriceCents / 100)} / hour`
                  : "Contact the Field"}</strong>
              </div>
              {[
                ["Account holder", data.settings.bank.accountName],
                ["Bank", data.settings.bank.bankName],
                ["Account number", data.settings.bank.accountNumber],
                ["Branch code", data.settings.bank.branchCode],
              ].map(([label, value]) => (
                <div className="summary-row" key={label}>
                  <span>{label}</span>
                  <strong style={{overflowWrap: "anywhere"}}>{value}</strong>
                </div>
              ))}
            </div>
          ) : <p>Field banking has not been set up yet.</p>}
        </section>
      )}
    </div>
  );
}
