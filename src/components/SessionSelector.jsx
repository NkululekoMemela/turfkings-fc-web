import React, {useEffect,useState} from "react";
export default function SessionSelector({onOfficial,onPractice,recordScope="club",busy=false,error=""}) {
  const [sessionChoiceEmphasis, setSessionChoiceEmphasis] = useState(null);
  useEffect(() => {

    // Initial 4-second pause, then:
    // 04s Official highlighted
    // 06s Practice highlighted
    // 08s Official highlighted
    // 10s Practice highlighted
    // 12s Official highlighted
    // 14s animation ends and both return to 100%.
    const timers = [
      window.setTimeout(
        () => setSessionChoiceEmphasis("official"),
        4000
      ),
      window.setTimeout(
        () => setSessionChoiceEmphasis("practice"),
        6000
      ),
      window.setTimeout(
        () => setSessionChoiceEmphasis("official"),
        8000
      ),
      window.setTimeout(
        () => setSessionChoiceEmphasis("practice"),
        10000
      ),
      window.setTimeout(
        () => setSessionChoiceEmphasis("official"),
        12000
      ),
      window.setTimeout(
        () => setSessionChoiceEmphasis(null),
        14000
      ),
    ];

    return () => {
      timers.forEach((timerId) => window.clearTimeout(timerId));
    };
  }, []);
  return (
        <div
          className="session-selector-overlay"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "clamp(0.35rem, 1.2vh, 0.8rem)",
            overflowX: "hidden",
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            background:
              "radial-gradient(circle at top, rgba(30, 144, 255, 0.18), rgba(2, 6, 23, 0.96) 55%, rgba(0,0,0,0.98))",
            backdropFilter: "blur(10px)",
          }}
        >
          <div
            className="session-selector-shell"
            style={{
              width: "min(920px, 98vw)",
              height: "auto",
              maxHeight: "none",
              overflow: "visible",
              border: "1px solid rgba(147, 197, 253, 0.55)",
              borderRadius: "28px",
              padding:
                "clamp(0.55rem, 1.25vh, 1.1rem) clamp(0.65rem, 1.6vh, 1.25rem) clamp(0.3rem, 0.65vh, 0.55rem)",
              display: "flex",
              flexDirection: "column",
              background:
                "linear-gradient(145deg, rgba(2, 8, 23, 0.98), rgba(7, 18, 38, 0.96))",
              boxShadow:
                "0 0 50px rgba(14, 165, 233, 0.25), 0 0 90px rgba(168, 85, 247, 0.18)",
              color: "white",
              position: "relative",
            }}
          >
            <div className="session-selector-header" style={{ textAlign: "center", marginBottom: "clamp(0.45rem, 1vh, 1rem)", flexShrink: 0 }}>
              <div style={{ fontSize: "clamp(1.8rem, 5vh, 2.7rem)", lineHeight: 1, filter: "drop-shadow(0 0 18px rgba(251,191,36,0.8))" }}>
                👑
              </div>
              <h1 style={{ fontSize: "clamp(1.55rem, 4.5vh, 3rem)", margin: "0.2rem 0 0" }}>
                Choose Session
              </h1>
              <p style={{ color: "#dbeafe", fontSize: "clamp(0.78rem, 2vh, 1.05rem)", margin: "0.25rem 0 0" }}>
                Choose how you want to enter the platform.
              </p>
              <div
                style={{
                  width: 110,
                  height: 5,
                  margin: "clamp(0.35rem, 0.8vh, 0.7rem) auto 0",
                  borderRadius: 999,
                  background: "linear-gradient(90deg, #0ea5e9, #d946ef)",
                }}
              />
            </div>

            {error && <p role="alert">{error}</p>}
            <div
              className="session-selector-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gridAutoRows: "auto",
                gap: "clamp(0.25rem, 0.55vh, 0.55rem)",
                flex: "0 0 auto",
                minHeight: 0,
              }}
            >
              <button
                type="button"
                className="session-choice-card session-choice-card-official"
                disabled={busy}
                onClick={onOfficial}
                style={{
                  border: "1px solid #0ea5e9",
                  borderRadius: "24px",
                  padding: "clamp(0.65rem, 1.4vh, 1.1rem)",
                  minHeight: 0,
                  overflow: "hidden",
                  background:
                    "linear-gradient(180deg, rgba(2,6,23,0.35), rgba(2,6,23,0.96)), url('/session/official-session-bg.png'), radial-gradient(circle at top, rgba(14,165,233,0.42), rgba(2,6,23,0.96) 58%)",
                  backgroundSize: "cover, cover, cover",
                  backgroundPosition: "center, center, center",
                  backgroundRepeat: "no-repeat",
                  color: "white",
                  textAlign: "left",
                  cursor: "pointer",
                  boxShadow: "0 0 35px rgba(14,165,233,0.35)",
                  transform:
                    sessionChoiceEmphasis === "practice"
                      ? "scale(0.85)"
                      : "scale(0.90)",
                  transformOrigin: "center",
                  transition:
                    "transform 420ms ease, opacity 420ms ease, box-shadow 420ms ease",
                  opacity:
                    sessionChoiceEmphasis === "practice"
                      ? 0.92
                      : 1,
                }}
              >
                <div style={{ textAlign: "center", fontSize: "clamp(2rem, 5vh, 3.2rem)", marginBottom: "0.25rem", lineHeight: 1 }}>🏃‍♂️⚽</div>
                <h2 style={{ fontSize: "clamp(1.35rem, 3.5vh, 1.9rem)", textAlign: "center", margin: 0, lineHeight: 1.05 }}>Official<br />Session</h2>
                <hr style={{ borderColor: "rgba(14,165,233,0.55)", margin: "1rem 0" }} />
                <p>📊 Real standings & records</p>
                <p>🎥 Videos & highlights enabled</p>
                <p>🏅 Official stats & club history</p>
                <p>🔒 Permanent club records</p>
                <div
                  style={{
                    marginTop: "1rem",
                    padding: "0.9rem",
                    borderRadius: "14px",
                    textAlign: "center",
                    background: "linear-gradient(90deg, #0f52ba, #0284c7)",
                    fontWeight: 800,
                  }}
                >
                  Continue Officially ›
                </div>
              </button>

              <button
                type="button"
                className="session-choice-card session-choice-card-practice"
                disabled={busy}
                onClick={onPractice}
                style={{
                  border: "1px solid #d946ef",
                  borderRadius: "24px",
                  padding: "clamp(0.65rem, 1.4vh, 1.1rem)",
                  minHeight: 0,
                  overflow: "hidden",
                  background:
                    "linear-gradient(180deg, rgba(2,6,23,0.35), rgba(2,6,23,0.96)), url('/session/practice-session-bg.png'), radial-gradient(circle at top, rgba(168,85,247,0.48), rgba(2,6,23,0.96) 58%)",
                  backgroundSize: "cover, cover, cover",
                  backgroundPosition: "center, center, center",
                  backgroundRepeat: "no-repeat",
                  color: "white",
                  textAlign: "left",
                  cursor: "pointer",
                  boxShadow: "0 0 35px rgba(217,70,239,0.35)",
                  transform:
                    sessionChoiceEmphasis === "official"
                      ? "scale(0.85)"
                      : "scale(0.90)",
                  transformOrigin: "center",
                  transition:
                    "transform 420ms ease, opacity 420ms ease, box-shadow 420ms ease",
                  opacity:
                    sessionChoiceEmphasis === "official"
                      ? 0.92
                      : 1,
                }}
              >
                <div style={{ textAlign: "center", fontSize: "clamp(2rem, 5vh, 3.2rem)", marginBottom: "0.25rem", lineHeight: 1 }}>🎮</div>
                <h2 style={{ fontSize: "clamp(1.35rem, 3.5vh, 1.9rem)", textAlign: "center", margin: 0, lineHeight: 1.05 }}>Practice<br />Session</h2>
                <hr style={{ borderColor: "rgba(217,70,239,0.55)", margin: "1rem 0" }} />
                <p>🎯 For learning the app purposes</p>
                <p>🧱 Isolated practice database</p>
                <p>🛡️ Never affects official {recordScope} records</p>
                <div
                  style={{
                    marginTop: "1rem",
                    padding: "0.9rem",
                    borderRadius: "14px",
                    textAlign: "center",
                    background: "linear-gradient(90deg, #7e22ce, #c026d3)",
                    fontWeight: 800,
                  }}
                >
                  Enter Practice Mode ›
                </div>
              </button>
            </div>


          </div>
        </div>
  );
}
