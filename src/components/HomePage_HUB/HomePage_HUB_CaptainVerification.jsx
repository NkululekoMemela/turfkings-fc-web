import React, { useMemo } from "react";

function normaliseSouthAfricanPhone(value = "") {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return { ok: false, value: "", pretty: "", error: "" };

  if (digits.startsWith("27") && digits.length === 11) {
    return { ok: true, value: `+${digits}`, pretty: `+27 ${digits.slice(2, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`, error: "" };
  }

  if (digits.startsWith("0") && digits.length === 10) {
    const local = digits.slice(1);
    return { ok: true, value: `+27${local}`, pretty: `+27 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`, error: "" };
  }

  if (digits.length === 9) {
    return { ok: true, value: `+27${digits}`, pretty: `+27 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`, error: "" };
  }

  return { ok: false, value: "", pretty: "", error: "Please enter a valid South African WhatsApp number." };
}

export default function HomePage_HUB_CaptainVerification({
  clubDraft,
  onClubDraftChange,
  verificationConfirmed,
  onVerificationConfirmed,
}) {
  const captainName = [clubDraft?.founderFirstName, clubDraft?.founderSurname]
    .filter(Boolean)
    .join(" ")
    .trim();

  const whatsappNumber = clubDraft?.captainWhatsApp || "";
  const phoneCheck = useMemo(() => normaliseSouthAfricanPhone(whatsappNumber), [whatsappNumber]);

  function updateWhatsAppNumber(value) {
    onClubDraftChange?.({
      ...(clubDraft || {}),
      captainWhatsApp: value,
      captainWhatsAppNormalised: normaliseSouthAfricanPhone(value).value,
    });
    onVerificationConfirmed?.(false);
  }

  const whatsappMessage = encodeURIComponent(
`⚽ FANM Captain Verification

Club: ${clubDraft?.clubName || ""}

Captain: ${captainName || "Captain name to be confirmed"}

WhatsApp: ${phoneCheck.value || whatsappNumber}

I confirm that I am the captain or authorised organiser of this club.`
  );

  const whatsappUrl = `https://wa.me/27762849740?text=${whatsappMessage}`;

  return (
    <div className="hub-form-panel">
      <div className="hub-form-panel__head">
        <span>Step 2</span>
        <h3>Verify captain</h3>
        <p>Verify now, or continue and complete this later.</p>
      </div>

      <div className="hub-form-grid">
        <label className="hub-field hub-field--wide">
          <span>WhatsApp number</span>
          <input
            value={whatsappNumber}
            onChange={(event) => updateWhatsAppNumber(event.target.value)}
            placeholder="+27 76 123 4567"
          />
          {phoneCheck.ok ? (
            <small className="hub-field-hint">Saved as {phoneCheck.pretty}</small>
          ) : phoneCheck.error ? (
            <small className="hub-field-hint">{phoneCheck.error}</small>
          ) : null}
        </label>

        <div className="hub-field hub-field--wide hub-captain-verify-card">
          <strong>Captain verification</strong>
          <p>Send the prepared message from your WhatsApp.</p>

          <a
            className="hub-primary-button hub-captain-verify-button"
            href={phoneCheck.ok ? whatsappUrl : undefined}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!phoneCheck.ok}
          >
            Verify on WhatsApp
          </a>

          <div className="hub-captain-return-panel">
            <small>
              You can continue and complete verification later.
            </small>

            <button
              type="button"
              className={
                verificationConfirmed
                  ? "hub-return-button is-confirmed"
                  : "hub-return-button"
              }
              onClick={() => onVerificationConfirmed?.(!verificationConfirmed)}
            >
              {verificationConfirmed ? "✓ Returned to FANM" : "I'm back"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
