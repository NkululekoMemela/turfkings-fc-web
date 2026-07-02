import React from "react";

function money(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "R0.00";
  return `R${number.toFixed(2)}`;
}

export default function HomePage_HUB_BankingForm({ bankingDraft, onChange }) {
  const normalMatchFee = Number(bankingDraft?.normalMatchFee || 0);

  function updateField(field, value) {
    onChange?.({
      ...(bankingDraft || {}),
      [field]: value,
      founderProgrammeActive: true,
      paymentCollectionMode: "founder_programme_free",
    });
  }

  return (
    <div className="hub-form-panel">
      <div className="hub-form-panel__head">
        <span>Step 4</span>
        <h3>Founder Launch Offer</h3>
        <p>
          Set your club&apos;s normal match fee. FANM platform fees are R0.00 during the launch offer.
        </p>
      </div>

      <div className="hub-payment-total-card">
        <span>TODAY</span>
        <strong>Platform Fee: R0.00</strong>
        <small>
          As one of our founding clubs, you&apos;ll enjoy 3 months of free access,
          which could be extended while we grow the FANM community together.
        </small>
      </div>

      <div className="hub-form-grid">
        <label className="hub-field hub-field--wide">
          <span>Weekly team match fee</span>
          <input
            type="number"
            min="0"
            step="0.50"
            value={bankingDraft?.normalMatchFee || ""}
            onChange={(event) => updateField("normalMatchFee", event.target.value)}
            placeholder="Example: 60"
          />
          <small className="hub-field-hint">
            This is the amount your players normally contribute to your club for each match.
          </small>
        </label>
      </div>

      <div className="hub-payment-total-card">
        <span>Your team match fee</span>
        <strong>{money(normalMatchFee)}</strong>
        <small>
          FANM platform fee remains R0.00 during the Founder Launch Offer.
        </small>
      </div>
    </div>
  );
}
