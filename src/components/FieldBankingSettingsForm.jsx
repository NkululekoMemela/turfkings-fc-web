import React, {useEffect, useRef, useState} from "react";
import "./FieldBankingSettingsForm.css";
import {fieldTeamPaymentRequest} from "../storage/fieldTeamPaymentRepository.js";

const bankFields = [
  ["accountName", "Account holder"],
  ["bankName", "Bank"],
  ["accountNumber", "Account number"],
  ["branchCode", "Branch code"],
  ["accountType", "Account type"],
];

function priceCents(value) {
  const text = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    throw new Error("Enter prices with no more than two decimal places.");
  }
  const [whole, fraction = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > 100000000) {
    throw new Error("Enter a valid price.");
  }
  return cents;
}

export default function FieldBankingSettingsForm({
  venueId, settings, isManager, onSaved,
}) {
  const [bank, setBank] = useState({...settings.bank});
  const [dayPrice, setDayPrice] = useState(
    (settings.matchDayPriceCents / 100).toFixed(2)
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const acting = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {mounted.current = false;};
  }, []);

  async function save(event) {
    event.preventDefault();
    if (acting.current) return;
    acting.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const proposed = {
        bank,
        seasonPriceCents: settings.seasonPriceCents,
        matchDayPriceCents: priceCents(dayPrice),
      };
      const result = await fieldTeamPaymentRequest(
        venueId, "saveSettings", {
          settings: proposed, expectedRevision: settings.revision,
        }
      );
      if (!mounted.current) return;
      setMessage("Banking details and prices saved.");
      onSaved?.(result);
    } catch (failure) {
      if (mounted.current) setError(failure.message);
    } finally {
      acting.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <section className="card field-banking-form">
      <div className="field-banking-form__heading">
        <span className="field-banking-form__icon" aria-hidden="true">🏦</span>
        <div>
          <p className="field-banking-form__eyebrow">FIELD INFORMATION</p>
          <h3>Banking and hourly rate</h3>
        </div>
      </div>
      <p className="muted small">
        Provide your Field banking details and prices. Clubs arrange payment directly with the Field.
      </p>
      <form onSubmit={save}>
        <fieldset disabled={busy} style={{border: 0, padding: 0, minWidth: 0}}>
          {bankFields.map(([key, label]) => (
            <div className="form-row" key={key}>
              <label htmlFor={`field-bank-${key}`}>{label}</label>
              <input id={`field-bank-${key}`} value={bank[key] || ""}
                required={key !== "accountType"}
                maxLength={key === "branchCode" ? 6 : key === "accountNumber" ? 25 : 100}
                inputMode={["accountNumber", "branchCode"].includes(key) ? "numeric" : "text"}
                onChange={event => setBank({...bank, [key]: event.target.value})} />
            </div>
          ))}
          <div className="form-row field-banking-form__rate">
            <label htmlFor="field-day-price">Hourly field booking rate (R)</label>
            <input id="field-day-price" inputMode="decimal"
              required value={dayPrice}
              onChange={event => setDayPrice(event.target.value)} />
          </div>
          <button type="submit" className="primary-btn field-banking-form__save">
            {busy ? "Saving…" : "Save banking and hourly rate"}
          </button>
        </fieldset>
      </form>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
