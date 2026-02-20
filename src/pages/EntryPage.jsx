// src/pages/EntryPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import TurfKingsLogo from "../assets/TurfKings_logo.jpg";
import TeamPhoto from "../assets/TurfKings.jpg";

import { auth, signInWithGoogle } from "../firebaseConfig";
import { db } from "../firebaseConfig";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  setDoc,
  query,
  orderBy,
  limit,          // ⬅️ NEW: for withdrawal popup subscription
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { isCaptainEmail } from "../core/captainAuth.js";

const MEMBERS_COLLECTION = "members";
const PLAYERS_COLLECTION = "players";

// ===== shared bright primary button style (same as Start Match) =====
const brightPrimaryStyle = {
  background:
    "radial-gradient(circle at 0% 0%, rgba(56,189,248,0.25), transparent 55%), radial-gradient(circle at 100% 100%, rgba(59,130,246,0.35), transparent 55%), linear-gradient(90deg, #22d3ee, #38bdf8, #6366f1)",
  color: "#020617", // dark text for contrast
  boxShadow:
    "0 0 0 1px rgba(148, 255, 255, 0.35), 0 0 24px rgba(56,189,248,0.50)",
  border: "none",
};

// ---------- helpers ----------
function toTitleCase(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function slugFromName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/**
 * Sync an approved member into the `players` collection so:
 *  - they appear in the Unseeded pool on SquadsPage
 *  - they appear in the 11-a-side photo dropdown
 *  - we can reliably map email → player for identity
 */
async function upsertPlayerFromMember(member) {
  if (!member) return;

  const shortName = (member.shortName || "").trim();
  const fullName = (member.fullName || "").trim();
  const displayName = toTitleCase(shortName || fullName);

  if (!displayName) {
    console.warn("[EntryPage] upsertPlayerFromMember: empty name, skipping");
    return;
  }

  const playerId = slugFromName(displayName);

  try {
    console.log("[EntryPage] Syncing member into players:", {
      playerId,
      displayName,
      fullName,
      email: member.email || "",
    });

    await setDoc(
      doc(db, PLAYERS_COLLECTION, playerId),
      {
        name: displayName,
        fullName: fullName || displayName,
        email: member.email || "",
        roles: {
          player: true,
          captain: member.role === "captain",
          coach: member.role === "coach",
          admin: member.role === "admin",
        },
        sourceMemberId: member.id,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.error(
      "[EntryPage] Failed to sync member into players collection:",
      err
    );
  }
}

export function EntryPage({ identity, onComplete, onDevSkipToLanding }) {
  // ---------- AUTH ----------
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user || null);
    });
    return () => unsub();
  }, []);

  const isAdmin =
    currentUser && currentUser.email && isCaptainEmail(currentUser.email);

  // 🔔 NEW: withdrawal popup state
  const [withdrawalAlert, setWithdrawalAlert] = useState(null);

  // Listen for latest withdrawal docs (admin only)
  useEffect(() => {
    if (!isAdmin) return; // only captains/admins see this popup

    const q = query(
      collection(db, "yearEndRSVP_withdrawals"),
      orderBy("withdrawnAt", "desc"),
      limit(1)
    );

    const unsub = onSnapshot(q, (snap) => {
      if (snap.empty) return;
      const docSnap = snap.docs[0];
      const data = docSnap.data() || {};
      if (!data.withdrawnAt) return;

      const lastSeen = Number(
        window.localStorage.getItem("tk_lastSeenWithdrawal_ts") || 0
      );

      // Only show if this is newer than what this device has already seen
      if (data.withdrawnAt > lastSeen) {
        setWithdrawalAlert({
          name: data.name || "Unknown player",
          friends: data.friends || 0,
          withdrawnAt: data.withdrawnAt,
        });
        window.localStorage.setItem(
          "tk_lastSeenWithdrawal_ts",
          String(data.withdrawnAt)
        );
      }
    });

    return () => unsub();
  }, [isAdmin]);

  // ---------- IDENTITY CHOICE ----------
  const [mode, setMode] = useState(() => {
    if (identity?.role === "spectator") return "spectator";
    return "player";
  });

  // ---------- MEMBERS FROM FIRESTORE ----------
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [membersError, setMembersError] = useState("");

  useEffect(() => {
    setLoadingMembers(true);
    setMembersError("");

    const colRef = collection(db, MEMBERS_COLLECTION);

    const unsub = onSnapshot(
      colRef,
      (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data() || {};
          return {
            id: d.id,
            fullName: data.fullName || "",
            shortName: data.shortName || data.fullName?.split(" ")[0] || "",
            email: data.email || "",
            role: data.role || "player",
            status: data.status || "active",
            createdAt: data.createdAt || null,
          };
        });
        list.sort((a, b) => a.fullName.localeCompare(b.fullName));
        setMembers(list);
        setLoadingMembers(false);
      },
      (err) => {
        console.error("Error loading members:", err);
        setMembersError("Could not load TurfKings members.");
        setLoadingMembers(false);
      }
    );

    return () => unsub();
  }, []);

  const activeMembers = useMemo(
    () => members.filter((m) => m.status === "active"),
    [members]
  );
  const pendingMembers = useMemo(
    () => members.filter((m) => m.status === "pending"),
    [members]
  );

  // ---------- PLAYER SELECTION ----------
  const [selectedMemberId, setSelectedMemberId] = useState(() => {
    if (identity?.memberId) return identity.memberId;
    return "";
  });
  const [verifyError, setVerifyError] = useState("");
  const [verifyStatus, setVerifyStatus] = useState("");

  const selectedMember = useMemo(
    () => members.find((m) => m.id === selectedMemberId) || null,
    [members, selectedMemberId]
  );

  // ---------- NEW PLAYER REQUEST ----------
  const [showNewPlayerForm, setShowNewPlayerForm] = useState(false);
  const [newFullName, setNewFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newReqStatus, setNewReqStatus] = useState("");
  const [newReqError, setNewReqError] = useState("");

  const handleSubmitNewPlayer = async () => {
    setNewReqError("");
    setNewReqStatus("");

    const fullName = newFullName.trim();
    const email = newEmail.trim();

    if (!fullName) {
      setNewReqError("Please enter your full name.");
      return;
    }
    if (!email || !email.includes("@")) {
      setNewReqError("Please enter a valid email address.");
      return;
    }

    const exists = members.some(
      (m) =>
        m.fullName.toLowerCase() === fullName.toLowerCase() ||
        (m.email && m.email.toLowerCase() === email.toLowerCase())
    );
    if (exists) {
      setNewReqError(
        "This name or email already exists on the TurfKings list."
      );
      return;
    }

    const shortName = fullName.split(" ")[0];

    try {
      await addDoc(collection(db, MEMBERS_COLLECTION), {
        fullName,
        shortName,
        email,
        role: "player",
        status: "pending",
        createdAt: serverTimestamp(),
      });
      setNewReqStatus(
        "Request captured. An admin will approve you and you’ll appear on the list."
      );
      setNewFullName("");
      setNewEmail("");
    } catch (err) {
      console.error("Error creating new member:", err);
      setNewReqError("Could not send request. Please try again.");
    }
  };

  // ---------- VERIFY PLAYER (GOOGLE + MATCH EMAIL) ----------
  const handleVerifyPlayer = async () => {
    setVerifyError("");
    setVerifyStatus("");

    if (!selectedMember) {
      setVerifyError("Please select your name on the TurfKings list.");
      return;
    }

    if (selectedMember.status === "pending") {
      setVerifyError(
        "This player is still pending approval. Ask a captain to approve you."
      );
      return;
    }
    if (selectedMember.status === "rejected") {
      setVerifyError(
        "This request was rejected. Please speak to a captain if this is a mistake."
      );
      return;
    }

    let u = auth.currentUser;
    if (!u) {
      try {
        await signInWithGoogle();
        u = auth.currentUser;
      } catch (err) {
        console.error("Sign in cancelled/failed:", err);
        setVerifyError("Sign-in was cancelled or failed. Please try again.");
        return;
      }
    }

    if (!u || !u.email) {
      setVerifyError(
        "Could not read your Google email. Please try again or contact admin."
      );
      return;
    }

    const googleEmail = u.email.toLowerCase().trim();
    const memberEmail = (selectedMember.email || "").toLowerCase().trim();

    if (memberEmail && googleEmail !== memberEmail) {
      setVerifyError(
        `This Google account’s email doesn’t match the one on record for ${selectedMember.fullName}.`
      );
      return;
    }

    // If member had no email saved yet, link this Google email as their official email.
    if (!memberEmail) {
      try {
        await updateDoc(doc(db, MEMBERS_COLLECTION, selectedMember.id), {
          email: googleEmail,
        });
      } catch (err) {
        console.error("Failed to update member email:", err);
      }
    }

    // 🔥 Ensure this verified member exists in `players` collection too
    await upsertPlayerFromMember({
      ...selectedMember,
      id: selectedMember.id,
      email: googleEmail,
    });

    setVerifyStatus(
      `Welcome, ${selectedMember.shortName}! Your email has been verified.`
    );

    onComplete({
      role: "player",
      memberId: selectedMember.id,
      fullName: selectedMember.fullName,
      shortName: selectedMember.shortName,
      email: googleEmail,
      status: selectedMember.status || "active",
    });
  };

  // ---------- SPECTATOR CONTINUE ----------
  const handleContinueAsSpectator = () => {
    onComplete({
      role: "spectator",
    });
  };

  // ---------- ADMIN: APPROVE / REJECT PENDING ----------
  const handleApproveMember = async (memberId) => {
    const member = members.find((m) => m.id === memberId) || null;

    try {
      await updateDoc(doc(db, MEMBERS_COLLECTION, memberId), {
        status: "active",
      });

      await upsertPlayerFromMember({
        ...member,
        id: memberId,
        status: "active",
      });
    } catch (err) {
      console.error("Approve failed:", err);
      alert("Could not approve member. Check console for details.");
    }
  };

  const handleRejectMember = async (memberId) => {
    try {
      await updateDoc(doc(db, MEMBERS_COLLECTION, memberId), {
        status: "rejected",
      });
    } catch (err) {
      console.error("Reject failed:", err);
      alert("Could not reject member. Check console for details.");
    }
  };

  // ---------- RENDER ----------
  return (
    <div className="page entry-page">
      <header className="header">
        <div className="header-title">
          <img src={TurfKingsLogo} alt="Turf Kings logo" className="tk-logo" />
          <h1>Turf Kings 5-A-Side</h1>
        </div>

        {!currentUser && (
          <p className="muted small">
            Not signed in yet. We&apos;ll ask Google for your email when you
            verify as a player.
          </p>
        )}
        {currentUser && (
          <p className="muted small">
            Currently signed in as{" "}
            <strong>{currentUser.displayName || currentUser.email}</strong>.
          </p>
        )}
      </header>

      {/* WHO ARE YOU? */}
      <section className="card">
        <h2>Who are you?</h2>

        <div className="pill-toggle-group" style={{ marginTop: "0.75rem" }}>
          <button
            type="button"
            className={
              "pill-toggle" + (mode === "player" ? " pill-toggle-active" : "")
            }
            onClick={() => setMode("player")}
          >
            🏃‍♂️ TurfKings player
          </button>
          <button
            type="button"
            className={
              "pill-toggle" +
              (mode === "spectator" ? " pill-toggle-active" : "")
            }
            onClick={() => setMode("spectator")}
          >
            👁️ I&apos;m a spectator
          </button>
        </div>
      </section>

      {/* PLAYER FLOW */}
      {mode === "player" && (
        <section className="card">
          <h2>Confirm your player identity</h2>
          <div className="field-column" style={{ marginTop: "1rem" }}>
            <label>Select your name (Turf Kings player list)</label>
            <p className="muted small" style={{ marginTop: "0.25rem" }}>
              There are {activeMembers.length} players on the list – scroll or look for
              your number.
            </p>
              <select
              className="text-input"
              value={selectedMemberId}
              onChange={(e) => {
                setSelectedMemberId(e.target.value);
                setVerifyError("");
                setVerifyStatus("");
              }}
            >
              <option value="">Select your name...</option>

              {/* Active players, numbered 1, 2, 3, ... */}
              {activeMembers.map((m, idx) => (
                <option key={m.id} value={m.id}>
                  {idx + 1}. {m.fullName}
                </option>
              ))}

              {/* Pending players, continue numbering after active list */}
              {pendingMembers.map((m, idx) => (
                <option key={m.id} value={m.id}>
                  {activeMembers.length + idx + 1}. {m.fullName} (pending approval)
                </option>
              ))}
            </select>
          </div>




          <div className="actions-row" style={{ marginTop: "1rem" }}>
            <button
              type="button"
              className="primary-btn"
              style={brightPrimaryStyle}
              onClick={handleVerifyPlayer}
            >
              Sign in with Gmail
            </button>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => {
                setShowNewPlayerForm((prev) => !prev);
                setNewReqError("");
                setNewReqStatus("");
              }}
            >
              {showNewPlayerForm
                ? "Close new player request"
                : "My name is not on the list"}
            </button>
          </div>

          {verifyError && (
            <p className="error-text" style={{ marginTop: "0.5rem" }}>
              {verifyError}
            </p>
          )}
          {verifyStatus && (
            <p className="success-text" style={{ marginTop: "0.5rem" }}>
              {verifyStatus}
            </p>
          )}

          {membersError && (
            <p className="error-text" style={{ marginTop: "0.5rem" }}>
              {membersError}
            </p>
          )}
          {loadingMembers && (
            <p className="muted small" style={{ marginTop: "0.5rem" }}>
              Loading players…
            </p>
          )}

          {/* NEW PLAYER REQUEST FORM */}
          {showNewPlayerForm && (
            <div
              style={{
                marginTop: "1.25rem",
                paddingTop: "1rem",
                borderTop: "1px solid rgba(148,163,184,0.4)",
              }}
            >
              <h3 style={{ marginBottom: "0.5rem" }}>
                Request to join player list
              </h3>
              <div className="field-column">
                <label>Full name</label>
                <input
                  type="text"
                  className="text-input"
                  placeholder="e.g. Nkululeko Memela"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                />
              </div>
              <div className="field-column">
                <label>Gmail address</label>
                <input
                  type="email"
                  className="text-input"
                  placeholder="e.g. yourname@gmail.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="primary-btn"
                style={{ marginTop: "0.75rem" }}
                onClick={handleSubmitNewPlayer}
              >
                Request to join player list
              </button>
              {newReqError && (
                <p className="error-text" style={{ marginTop: "0.5rem" }}>
                  {newReqError}
                </p>
              )}
              {newReqStatus && (
                <p className="success-text" style={{ marginTop: "0.5rem" }}>
                  {newReqStatus}
                </p>
              )}
              <p className="muted small" style={{ marginTop: "0.4rem" }}>
                Your request will go to the TurfKings admin. Once approved
                you&apos;ll appear under the Unseeded tab and can be placed
                into a squad.
              </p>
            </div>
          )}
        </section>
      )}

      {/* SPECTATOR FLOW */}
      {mode === "spectator" && (
        <section className="card">
          <h2>Spectator access</h2>
          <p className="muted">
            You&apos;ll be able to view live games, stats and player cards but
            you won&apos;t be able to change match settings or vote on peers.
          </p>
          <button
            type="button"
            className="primary-btn"
            style={{ ...brightPrimaryStyle, marginTop: "1rem" }}
            onClick={handleContinueAsSpectator}
          >
            Continue as spectator
          </button>
        </section>
      )}

      {/* TEAM PHOTO */}
      <section className="card team-photo-card">
        <img src={TeamPhoto} alt="Turf Kings team" className="team-photo" />
      </section>

      {/* ADMIN: PENDING APPROVALS */}
      {isAdmin && (
        <section className="card">
          <h2>Pending player requests (admin only)</h2>
          {pendingMembers.length === 0 ? (
            <p className="muted">No pending requests at the moment.</p>
          ) : (
            <ul className="news-list">
              {pendingMembers.map((m) => (
                <li key={m.id} className="news-list-item">
                  <div style={{ flex: 1 }}>
                    <strong>{m.fullName}</strong>{" "}
                    {m.email && (
                      <span className="muted small">({m.email})</span>
                    )}
                  </div>
                  <div className="actions-row" style={{ gap: "0.5rem" }}>
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={() => handleApproveMember(m.id)}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => handleRejectMember(m.id)}
                    >
                      Reject
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="muted small" style={{ marginTop: "0.5rem" }}>
            Approved players will immediately appear as <strong>active</strong>{" "}
            in the dropdown above.
          </p>
        </section>
      )}

      {/* 🔔 WITHDRAWAL POPUP (ADMIN ONLY, bottom of screen) */}
      {isAdmin && withdrawalAlert && (
        <div
          style={{
            position: "fixed",
            bottom: "1rem",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 2000,
            padding: "0.9rem 1rem",
            borderRadius: "0.75rem",
            background:
              "linear-gradient(135deg, rgba(248,113,113,0.15), #111827)",
            border: "1px solid rgba(248,113,113,0.8)",
            color: "#f9fafb",
            boxShadow: "0 14px 40px rgba(15,23,42,0.9)",
            maxWidth: "420px",
            width: "calc(100% - 2rem)",
            fontSize: "0.85rem",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>
            Player pulled out
          </div>
          <div>
            <strong>{withdrawalAlert.name}</strong> has pulled out of the
            year-end function
            {withdrawalAlert.friends
              ? ` (with ${withdrawalAlert.friends} friend${
                  withdrawalAlert.friends === 1 ? "" : "s"
                })`
              : ""}
            .
          </div>
          <button
            type="button"
            onClick={() => setWithdrawalAlert(null)}
            style={{
              marginTop: "0.6rem",
              padding: "0.3rem 0.7rem",
              borderRadius: "999px",
              border: "none",
              background: "rgba(59,130,246,0.18)",
              color: "#bfdbfe",
              fontSize: "0.8rem",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      )}

      {/* DEV BUTTON */}
      <div
        style={{
          position: "fixed",
          right: "0.75rem",
          bottom: "0.5rem",
          zIndex: 50,
        }}
      >
        <button
          type="button"
          className="secondary-btn"
          onClick={onDevSkipToLanding}
        >
          Dev: Landing
        </button>
      </div>
    </div>
  );
}
