// src/auth/AuthContext.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
} from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { auth, db } from "../firebaseConfig";
import { collection, getDocs, query, where } from "firebase/firestore";

// ---------- helpers ----------

function slugFromName(name) {
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

// Special TurfKings emails that are at least captains
const CAPTAIN_EMAILS = new Set([
  "nmbulungeni@gmail.com", // Enoch
  "mduduzi933@gmail.com",  // Mdu
  "nkululekolerato@gmail.com", // you
]);

// Your admin email (full powers)
const ADMIN_EMAIL = "nkululekolerato@gmail.com";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [authUser, setAuthUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Listen to Firebase auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setAuthUser(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const email = (firebaseUser.email || "").toLowerCase();

        let role = "player";
        let fullName = firebaseUser.displayName || "";
        let shortName =
          fullName && fullName.includes(" ")
            ? fullName.split(" ")[0]
            : fullName || "";
        let status = "active";
        let memberId = null;

        // 1) Try Firestore: members doc matching this email
        try {
          const membersRef = collection(db, "members");
          const q = query(membersRef, where("email", "==", email));
          const snap = await getDocs(q);

          if (!snap.empty) {
            const docSnap = snap.docs[0];
            const data = docSnap.data() || {};
            memberId = docSnap.id;
            role = data.role || role;
            fullName = data.fullName || fullName;
            shortName = data.shortName || shortName;
            status = data.status || status;
          } else {
            // 2) Fallback: known captain emails
            if (CAPTAIN_EMAILS.has(email)) {
              role = "captain";
            }
          }
        } catch (err) {
          console.error("[Auth] Failed to read members doc:", err);
          if (CAPTAIN_EMAILS.has(email)) {
            role = "captain";
          }
        }

        // 3) Hard override for you: admin
        if (email === ADMIN_EMAIL) {
          role = "admin";
        }

        const isAdmin = role === "admin";
        const isCaptain = role === "captain" || isAdmin;
        const playerId = shortName ? slugFromName(shortName) : null;

        setAuthUser({
          uid: firebaseUser.uid,
          email,
          firebaseUser,
          role,
          fullName,
          shortName,
          status,
          memberId,
          isAdmin,
          isCaptain,
          playerId,
        });
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  // ---- actions ----

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const signOutUser = async () => {
    await firebaseSignOut(auth);
  };

  /**
   * Can this logged-in user edit a specific player card?
   * - admin: everything
   * - captain: any player
   * - player: only their own card
   */
  const canEditPlayer = (targetPlayerId) => {
    if (!authUser) return false;

    if (authUser.isAdmin) return true;
    if (authUser.isCaptain) return true;

    if (!targetPlayerId) return false;
    return authUser.playerId && authUser.playerId === targetPlayerId;
  };

  const value = useMemo(
    () => ({
      authUser,
      loading,
      signInWithGoogle,
      signOut: signOutUser,
      canEditPlayer,
    }),
    [authUser, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}
