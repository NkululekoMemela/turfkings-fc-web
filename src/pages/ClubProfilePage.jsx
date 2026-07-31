// src/pages/ClubProfilePage.jsx
import React from "react";
import { buildClubIdentity } from "../core/clubIdentity.js";

const DEFAULT_LOGO = "/HomePage/Logo_icon.jpeg";

export default function ClubProfilePage({
  club,
  onBack,
  onEnterClub,
  onJoinClub,
  onChallengeClub,
}) {
  const safeClub = club || {};
  const clubIdentity = buildClubIdentity(safeClub);

  const clubName = clubIdentity.name || "New Club";
  const clubLocation = safeClub.location || safeClub.area || "Location not set";
  const clubDescription =
    safeClub.description ||
    "This club page has been created, but the captain has not added full details yet.";

  const shortCount = Number(safeClub.helpNeeded || 0);
  const logoSrc = clubIdentity.logoUrl || "";
  const accent = safeClub.accent || "#22c55e";

  return (
    <main
      className="fanm-home-shell fanm-theme-balanced"
      style={{
        minHeight: "100vh",
        padding: "1.2rem",
        background:
          "radial-gradient(circle at top left, rgba(34,197,94,0.20), transparent 34%), linear-gradient(180deg, #07111f, #020617)",
        color: "#f8fafc",
      }}
    >
      <section
        style={{
          maxWidth: "980px",
          margin: "0 auto",
          borderRadius: "28px",
          padding: "1.2rem",
          border: "1px solid rgba(148,163,184,0.22)",
          background:
            "linear-gradient(180deg, rgba(15,23,42,0.92), rgba(2,6,23,0.95))",
          boxShadow: "0 24px 70px rgba(0,0,0,0.42)",
        }}
      >
        <button
          type="button"
          onClick={onBack}
          style={{
            border: "1px solid rgba(148,163,184,0.25)",
            background: "rgba(15,23,42,0.72)",
            color: "#e2e8f0",
            borderRadius: "999px",
            padding: "0.65rem 0.95rem",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          ← Back to clubs
        </button>

        <div
          style={{
            marginTop: "1rem",
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.25fr) minmax(260px, 0.75fr)",
            gap: "1rem",
          }}
        >
          <div
            style={{
              borderRadius: "24px",
              padding: "1.3rem",
              border: `1px solid ${accent}55`,
              background:
                "radial-gradient(circle at top right, rgba(34,197,94,0.18), transparent 45%), rgba(15,23,42,0.72)",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                borderRadius: "999px",
                padding: "0.32rem 0.72rem",
                background: "rgba(34,197,94,0.13)",
                border: "1px solid rgba(34,197,94,0.28)",
                color: "#86efac",
                fontSize: "0.72rem",
                fontWeight: 950,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Club profile
            </span>

            <h1
              style={{
                margin: "0.8rem 0 0.35rem",
                fontSize: "clamp(2rem, 5vw, 4rem)",
                lineHeight: 1,
              }}
            >
              {clubName}
            </h1>

            <p style={{ margin: 0, color: "#cbd5e1", fontWeight: 800 }}>
              📍 {clubLocation}
            </p>

            <p
              style={{
                marginTop: "1rem",
                maxWidth: "650px",
                color: "rgba(226,232,240,0.88)",
                lineHeight: 1.55,
                fontSize: "1rem",
              }}
            >
              {clubDescription}
            </p>

            <div
              style={{
                marginTop: "1.1rem",
                display: "flex",
                gap: "0.65rem",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={() => onEnterClub?.(safeClub)}
                style={{
                  border: "none",
                  background: "linear-gradient(135deg, #22c55e, #86efac)",
                  color: "#052e16",
                  borderRadius: "999px",
                  padding: "0.75rem 1.05rem",
                  fontWeight: 950,
                  cursor: "pointer",
                }}
              >
                Enter club
              </button>

              <button
                type="button"
                onClick={() => onJoinClub?.(safeClub)}
                style={{
                  border: "1px solid rgba(148,163,184,0.28)",
                  background: "rgba(15,23,42,0.75)",
                  color: "#e2e8f0",
                  borderRadius: "999px",
                  padding: "0.75rem 1.05rem",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                Join request
              </button>

              <button
                type="button"
                onClick={() => onChallengeClub?.(safeClub)}
                style={{
                  border: "1px solid rgba(56,189,248,0.28)",
                  background: "rgba(14,165,233,0.10)",
                  color: "#bae6fd",
                  borderRadius: "999px",
                  padding: "0.75rem 1.05rem",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                Challenge
              </button>
            </div>
          </div>

          <aside
            style={{
              borderRadius: "24px",
              padding: "1rem",
              border: "1px solid rgba(148,163,184,0.18)",
              background: "rgba(15,23,42,0.62)",
            }}
          >
            <div
              style={{
                height: "190px",
                borderRadius: "22px",
                display: "grid",
                placeItems: "center",
                overflow: "hidden",
                border: `1px solid ${accent}55`,
                background: `radial-gradient(circle, ${accent}55, rgba(15,23,42,0.9))`,
              }}
            >
              {logoSrc ? (
                <img
                  src={logoSrc}
                  alt={`${clubName} logo`}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onError={(event) => {
                    event.currentTarget.src = DEFAULT_LOGO;
                  }}
                />
              ) : (
                <strong style={{ fontSize: "3rem" }}>
                  {safeClub.logoText || clubName.slice(0, 2)}
                </strong>
              )}
            </div>

            <div style={{ marginTop: "1rem", display: "grid", gap: "0.65rem" }}>
              <InfoRow label="Weekly play" value={safeClub.weeklyPlayTime || "Not set"} />
              <InfoRow label="Activity" value={safeClub.activity || "New club"} />
              <InfoRow label="Rating" value={safeClub.clubRating || "Unranked"} />
              <InfoRow
                label="Open spots"
                value={shortCount > 0 ? `${shortCount} player${shortCount === 1 ? "" : "s"}` : "None listed"}
              />
            </div>
          </aside>
        </div>

        <section
          style={{
            marginTop: "1rem",
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: "0.85rem",
          }}
        >
          <EmptyPanel title="Players" value="0" copy="No approved players yet." />
          <EmptyPanel title="Matches" value="0" copy="No match records yet." />
          <EmptyPanel title="Stats" value="Empty" copy="Stats will appear after matches are recorded." />
        </section>
      </section>
    </main>
  );
}

function InfoRow({ label, value }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "0.75rem",
        padding: "0.72rem 0.8rem",
        borderRadius: "16px",
        background: "rgba(2,6,23,0.45)",
        border: "1px solid rgba(148,163,184,0.12)",
      }}
    >
      <span style={{ color: "#94a3b8", fontWeight: 800 }}>{label}</span>
      <strong style={{ color: "#f8fafc", textAlign: "right" }}>{value}</strong>
    </div>
  );
}

function EmptyPanel({ title, value, copy }) {
  return (
    <div
      style={{
        borderRadius: "22px",
        padding: "1rem",
        minHeight: "120px",
        border: "1px solid rgba(148,163,184,0.16)",
        background: "rgba(15,23,42,0.58)",
      }}
    >
      <span style={{ color: "#94a3b8", fontWeight: 900 }}>{title}</span>
      <h2 style={{ margin: "0.45rem 0 0.2rem", fontSize: "2rem" }}>{value}</h2>
      <p style={{ margin: 0, color: "rgba(226,232,240,0.72)", lineHeight: 1.35 }}>
        {copy}
      </p>
    </div>
  );
}