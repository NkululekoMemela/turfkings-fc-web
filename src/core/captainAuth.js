// src/core/captainAuth.js

// Only these emails are allowed to act as Captains in the app.
const RAW_CAPTAIN_EMAILS = [
    "nmbulungeni@gmail.com",     // Enoch
    "Mduduzi933@gmail.com",      // Mdu (original casing from you)
    "nkululekolerato@gmail.com", // Nkululeko / NK
  ];
  
  // Normalise to lowercase so case differences don't matter.
  export const CAPTAIN_EMAILS = new Set(
    RAW_CAPTAIN_EMAILS.map((e) => e.toLowerCase())
  );
  
  /**
   * Returns true if this email is allowed to act as a Captain.
   */
  export function isCaptainEmail(email) {
    if (!email || typeof email !== "string") return false;
    return CAPTAIN_EMAILS.has(email.toLowerCase());
  }
  