import React from "react";
import { BOOKING_TERMS, BOOKING_TERMS_VERSION, BOOKING_SUPPORT } from "./bookingTerms.js";
import { LEGAL } from "./policies.js";

export default function PublicTerms() {
  return (
    <main style={{ maxWidth: "52rem", margin: "auto", padding: "2rem 1rem", lineHeight: 1.6 }}>
      <a href="/">5 Asides Near Me</a>
      <h1>Terms and Conditions</h1>
      <p>Bookings, cancellation, refunds and delivery · South Africa</p>
      <p>Policy version: {BOOKING_TERMS_VERSION}</p>
      {BOOKING_TERMS.map(([title, detail]) => (
        <section key={title}><h2>{title}</h2><p>{detail}</p></section>
      ))}
      <p><a href={`mailto:${BOOKING_SUPPORT}`}>Contact FANM support</a></p>
      {Object.values(LEGAL).map(policy => (
        <details key={policy.version}>
          <summary>{policy.title}</summary>
          {policy.sections.filter(section => !BOOKING_TERMS.includes(section)).map(([title, detail]) => (
            <section key={title}><h3>{title}</h3><p>{detail}</p></section>
          ))}
        </details>
      ))}
    </main>
  );
}
