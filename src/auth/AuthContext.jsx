// src/auth/AuthContext.jsx
import React, { createContext, useContext, useState, useMemo } from "react";

/**
 * Captain accounts (special role, can edit any player)
 */
const CAPTAIN_EMAILS = {
  "nmbulungeni@gmail.com": "Enoch",
  "mduduzi933@gmail.com": "Mdu",
  "nkululekolerato@gmail.com": "NK",
};

/**
 * Map Gmail -> playerId in TurfKings.
 * playerId is a slug like "enoch", "nk", etc. (we'll use the same ids
 * when building player cards from names in PlayerCardPage).
 *
 * Add more rows here as you collect gmails.
 */
const PLAYER_EMAIL_MAP = {
  "nmbulungeni@gmail.com": "enoch",
  "mduduzi933@gmail.com": "mdu",
  "nkululekolerato@gmail.com": "nk",
  // "someoneelse@gmail.com": "barlo",
};

/**
 * Turn an email into an auth profile:
 * - role: "captain" | "player" | "guest"
 * - playerId: which card they own (if any)
 */
function deriveAuthProfileFromEmail(emailRaw) {
  if (!emailRaw) return null;
  const email = emailRaw.trim();
  const emailLower = email.toLowerCase();

  const isCaptain = Object.keys(CAPTAIN_EMAILS).some(
    (e) => e.toLowerCase() === emailLower
  );

  const mappedEntry = Object.entries(PLAYER_EMAIL_MAP).find(
    ([em]) => em.toLowerCase() === emailLower
  );
  const playerId = mappedEntry ? mappedEntry[1] : null;

  const role = isCaptain ? "captain" : playerId ? "player" : "guest";

  return {
    email,
    emailLower,
    displayName:
      CAPTAIN_EMAILS[email] ||
      email.split("@")[0] ||
      "TurfKings user",
    role,
    playerId, // which player card they own (if any)
  };
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [authUser, setAuthUser] = useState(null);

  /**
   * TEMP: fake Google sign-in
   * ----------------------------------
   * For now we just ask the user to type their Gmail.
   * Later this is where you plug in real Firebase Google Auth.
   */
  const signInWithGoogle = async () => {
    try {
      const email = window.prompt(
        "Enter your Gmail to verify your identity (this should match what Nkululeko has on record):"
      );
      if (!email) return null;

      const profile = deriveAuthProfileFromEmail(email);
      if (!profile) {
        alert(
          "Could not derive a profile from that email. Please check the address."
        );
        return null;
      }

      setAuthUser(profile);

      if (profile.role === "guest") {
        alert(
          "You are signed in, but your email is not yet linked to a specific player card.\n" +
            "Ask Nkululeko to map this Gmail to your player name so you can edit your own card."
        );
      }

      return profile;
    } catch (err) {
      console.error("signInWithGoogle error:", err);
      return null;
    }
  };

  const signOut = () => {
    setAuthUser(null);
  };

  /**
   * Permission check: can this logged-in user edit a specific player card?
   * - captains: yes, for all.
   * - players: only their own playerId.
   */
  const canEditPlayer = (playerId) => {
    if (!authUser) return false;
    if (authUser.role === "captain") return true;
    if (!authUser.playerId) return false;
    return authUser.playerId === playerId;
  };

  const value = useMemo(
    () => ({
      authUser,
      signInWithGoogle,
      signOut,
      canEditPlayer,
    }),
    [authUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
