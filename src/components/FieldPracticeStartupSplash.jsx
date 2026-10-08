import React from "react";

export default function FieldPracticeStartupSplash({
  practiceBootstrapping = true, onProceed,
}) {
  return (
<div
          className="practice-startup-overlay"
          role="status"
          aria-live="polite"
          aria-label="Preparing Practice Session"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 20000,
            display: "grid",
            placeItems: "center",
            padding: "1.25rem",
            background:
              "radial-gradient(circle at 50% 28%, rgba(126,34,206,0.24), transparent 34%), linear-gradient(180deg, rgba(2,6,23,0.985), rgba(8,10,28,0.995))",
            color: "#f8fafc",
          }}
        >
          <div
            className="practice-startup-card"
            style={{
              width: "min(430px, 100%)",
              padding: "2rem 1.5rem",
              borderRadius: "26px",
              border: "1px solid rgba(217,70,239,0.42)",
              background:
                "linear-gradient(180deg, rgba(30,12,48,0.94), rgba(8,15,35,0.97))",
              boxShadow:
                "0 0 0 1px rgba(250,204,255,0.08), 0 24px 70px rgba(0,0,0,0.48), 0 0 38px rgba(168,85,247,0.16)",
              textAlign: "center",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                width: 64,
                height: 64,
                margin: "0 auto 1.15rem",
                display: "grid",
                placeItems: "center",
                borderRadius: "50%",
                border: "2px solid rgba(217,70,239,0.68)",
                background: "rgba(126,34,206,0.18)",
                fontSize: "1.75rem",
                boxShadow: "0 0 24px rgba(217,70,239,0.20)",
              }}
            >
              🎮
            </div>

            <div
              style={{
                color: "#e879f9",
                fontSize: "0.72rem",
                fontWeight: 900,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginBottom: "0.65rem",
              }}
            >
              Admin & Captain Training
            </div>

            <h1
              style={{
                margin: 0,
                fontSize: "clamp(1.65rem, 6vw, 2.15rem)",
                lineHeight: 1.05,
              }}
            >
              Practice Session
            </h1>

            <p
              style={{
                margin: "0.8rem 0 0",
                color: "#f5d0fe",
                fontSize: "1.05rem",
                fontWeight: 800,
              }}
            >
              Learn the app safely.
            </p>

            <p
              style={{
                margin: "0.85rem auto 0",
                maxWidth: 350,
                color: "rgba(226,232,240,0.86)",
                fontSize: "0.92rem",
                lineHeight: 1.6,
              }}
            >
              Practice lets Field officials rehearse league management
              and matchday features without affecting your Official Field data.
            </p>

            <div
              style={{
                marginTop: "1.4rem",
                height: 4,
                overflow: "hidden",
                borderRadius: 999,
                background: "rgba(255,255,255,0.08)",
              }}
            >
              <div
                style={{
                  width: "42%",
                  height: "100%",
                  borderRadius: 999,
                  background:
                    "linear-gradient(90deg, #7e22ce, #d946ef, #7e22ce)",
                  animation: "practiceBootPulse 1.25s ease-in-out infinite alternate",
                }}
              />
            </div>

            {practiceBootstrapping ? (
              <>
                <small
                  style={{
                    display: "block",
                    marginTop: "0.8rem",
                    color: "rgba(203,213,225,0.68)",
                    fontSize: "0.75rem",
                  }}
                >
                  Preparing your isolated Practice session…
                </small>

                <style>{`
                  @keyframes practiceBootPulse {
                    from {
                      transform: translateX(0);
                      opacity: 0.7;
                    }
                    to {
                      transform: translateX(138%);
                      opacity: 1;
                    }
                  }
                `}</style>
              </>
            ) : (
              <>
                <small
                  style={{
                    display: "block",
                    marginTop: "0.85rem",
                    color: "#86efac",
                    fontSize: "0.78rem",
                    fontWeight: 800,
                  }}
                >
                  Practice Session ready
                </small>

                <button
                  className="practice-startup-proceed"
                  type="button"
                  onClick={onProceed}
                  style={{
                    width: "100%",
                    marginTop: "1rem",
                    minHeight: 46,
                    border: "1px solid rgba(134,239,172,0.75)",
                    borderRadius: 14,
                    background:
                      "linear-gradient(135deg, #16a34a, #22c55e)",
                    color: "#ffffff",
                    fontWeight: 900,
                    fontSize: "0.92rem",
                    letterSpacing: "0.01em",
                    boxShadow:
                      "0 10px 30px rgba(34,197,94,0.24), 0 0 18px rgba(34,197,94,0.18)",
                    cursor: "pointer",
                  }}
                >
                  Proceed
                </button>
              </>
            )}
          </div>
        </div>
  );
}
