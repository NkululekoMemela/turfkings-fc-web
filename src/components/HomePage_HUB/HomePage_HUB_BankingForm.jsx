// src/components/homeHub/HomePage_HUB_BankingForm.jsx

import React from "react";

export default function HomePage_HUB_BankingForm({ bankingDraft, onChange }) {
  function updateField(field, value) {
    onChange?.({
      ...(bankingDraft || {}),
      [field]: value,
    });
  }

  return (
    <div className="hub-form-panel">
      <div className="hub-form-panel__head">
        <span>Step 3</span>
        <h3>Payment details</h3>
        <p>These details help players pay directly into the club account.</p>
      </div>

      <div className="hub-form-grid">
        <label className="hub-field">
          <span>Bank name</span>
          <input
            value={bankingDraft?.bankName || ""}
            onChange={(event) => updateField("bankName", event.target.value)}
            placeholder="FNB, Capitec, Standard Bank..."
          />
        </label>

        <label className="hub-field">
          <span>Account holder</span>
          <input
            value={bankingDraft?.accountHolder || ""}
            onChange={(event) => updateField("accountHolder", event.target.value)}
            placeholder="Club or captain account name"
          />
        </label>

        <label className="hub-field">
          <span>Account number</span>
          <input
            value={bankingDraft?.accountNumber || ""}
            onChange={(event) => updateField("accountNumber", event.target.value)}
            placeholder="Account number"
          />
        </label>

        <label className="hub-field">
          <span>Branch code</span>
          <input
            value={bankingDraft?.branchCode || ""}
            onChange={(event) => updateField("branchCode", event.target.value)}
            placeholder="Optional"
          />
        </label>

        <label className="hub-field hub-field--wide">
          <span>Payment reference format</span>
          <input
            value={bankingDraft?.paymentReference || ""}
            onChange={(event) => updateField("paymentReference", event.target.value)}
            placeholder="Example: 5s-YourName"
          />
        </label>
      </div>

      <div className="hub-soft-note">
        <strong>Player payment note</strong>
        <span>
          This does not move money yet. It saves the club’s preferred payment details so players know where to pay.
        </span>
      </div>
    </div>
  );
}
