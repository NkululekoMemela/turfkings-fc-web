// src/components/homeHub/HomePage_HUB_BankingForm.jsx

import React from "react";

const PLATFORM_CONTRIBUTION = 7.5;

function money(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "R0.00";
  return `R${number.toFixed(2)}`;
}

export default function HomePage_HUB_BankingForm({ bankingDraft, onChange }) {
  const normalMatchFee = Number(bankingDraft?.normalMatchFee || 0);
  const playerCharge = normalMatchFee + PLATFORM_CONTRIBUTION;

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
        <p>These details prepare your club for Peach Payments split payouts.</p>
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

      <div className="hub-payment-explainer">
        <strong>How player payments will work</strong>
        <p>
          Players will pay their normal match contribution plus a small R7.50 platform contribution per game.
          There are no extra monthly fees or hidden captain charges.
        </p>
      </div>

      <div className="hub-form-grid">
        <label className="hub-field hub-field--wide">
          <span>Normal player match fee</span>
          <input
            type="number"
            min="0"
            step="0.50"
            value={bankingDraft?.normalMatchFee || ""}
            onChange={(event) => updateField("normalMatchFee", event.target.value)}
            placeholder="Example: 60"
          />
        </label>
      </div>

      <div className="hub-payment-total-card">
        <span>Player charge preview</span>
        <strong>{money(playerCharge)}</strong>
        <small>
          {money(normalMatchFee)} team fee + R7.50 platform/data hosting contribution
        </small>
      </div>

      <div className="hub-soft-note hub-soft-note--warning">
        <strong>Important for captains</strong>
        <span>
          Changes here affect how much players pay and where Peach Payments sends club payouts.
          Only update banking and fee details when you are sure.
        </span>
      </div>
    </div>
  );
}
