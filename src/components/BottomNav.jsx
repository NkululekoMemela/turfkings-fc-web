// src/components/BottomNav.jsx
// Flat integrated footer version with NO rounded outer edges.
// Keeps every navigation item visible, highlights the current page in green,
// and centres the ribbon neatly on wide desktop screens.
// Uses public/strategy.png for the Lineups icon.

import React, { useEffect, useState } from "react";

const items = [
  { key: "landing", emoji: "🏡", label: "Home" },
  { key: "stats", emoji: "📊", label: "Stats" },
  { key: "live", emoji: "⚽", label: "Live" },
  { key: "squads", emoji: "👥", label: "Squads" },
  { key: "formations", image: "/strategy.png", label: "Lineups" },
  { key: "peer-review", emoji: "⭐", label: "Rate" },
  { key: "player-cards", emoji: "🪪", label: "Cards" },
  { key: "news", emoji: "📰", label: "News" },
  { key: "view-highlights", image: "/videotape.png", label: "Videos" },
  { key: "match-signup", emoji: "💳", label: "Pay" },
];

export default function BottomNav({
  currentPage,
  onNavigate,
  activeClub = null,
  activeClubName = "Club",
  canAccessPayments = true,
  hidden = false,
}) {
  const [isHidden, setIsHidden] = useState(false);
  const navClubName = String(activeClub?.name || activeClubName || "Club").trim() || "Club";

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    let hideTimer = null;

    const showThenScheduleHide = () => {
      setIsHidden(false);
      if (hideTimer) window.clearTimeout(hideTimer);

      hideTimer = window.setTimeout(() => {
        setIsHidden(true);
      }, 5000);
    };

    showThenScheduleHide();

    const events = ["touchstart", "mousedown", "keydown", "scroll"];

    events.forEach((eventName) => {
      window.addEventListener(eventName, showThenScheduleHide, {
        passive: true,
        capture: true,
      });
    });

    return () => {
      if (hideTimer) window.clearTimeout(hideTimer);
      events.forEach((eventName) => {
        window.removeEventListener(eventName, showThenScheduleHide, {
          capture: true,
        });
      });
    };
  }, [currentPage]);

  const visible = items.filter((item) => {
    if (item.key === "match-signup" && !canAccessPayments) return false;
    return true;
  });

  return (
    <>
      <nav className={`tk-bottom-nav-flat ${isHidden || hidden ? "is-hidden" : ""}`} aria-label={`${navClubName} navigation`}>
        <div className="tk-bottom-nav-inner">
          <div className="tk-bottom-nav-scroll">
            {visible.map((item) => {
              const isCurrent = item.key === currentPage;

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setIsHidden(false);
                    if (!isCurrent) onNavigate?.(item.key);
                  }}
                  className={`nav-pill ${isCurrent ? "is-current" : ""}`}
                  aria-current={isCurrent ? "page" : undefined}
                >
                  <span className="nav-icon-wrap">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt=""
                        className="nav-custom-icon"
                        draggable="false"
                      />
                    ) : (
                      <span className="nav-emoji">{item.emoji}</span>
                    )}
                  </span>

                  <span className="nav-label">{item.label}</span>

                  {isCurrent && <span className="current-indicator" />}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      <style>{`
        .app-root {
          padding-bottom: 82px;
        }

        .tk-bottom-nav-flat {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 9999;
          margin: 0;
          border-radius: 0 !important;
          background:
            linear-gradient(
              180deg,
              rgba(5,18,46,.985),
              rgba(4,12,30,1)
            );
          border-top: 1px solid rgba(120,150,255,.18);
          box-shadow: 0 -8px 24px rgba(0,0,0,.28);
          padding:
            8px
            8px
            calc(8px + env(safe-area-inset-bottom,0px))
            8px;
          transform: translateY(0);
          transition: transform .28s ease, opacity .28s ease;
          will-change: transform;
        }

        .tk-bottom-nav-flat.is-hidden {
          transform: translateY(calc(100% - 14px));
          opacity: .82;
          pointer-events: auto;
        }

        .tk-bottom-nav-flat.is-hidden-by-modal {
          transform: translateY(110%);
          opacity: 0;
          pointer-events: none;
        }

        .tk-bottom-nav-flat.is-hidden::before {
          content: "";
          position: absolute;
          top: -12px;
          left: 50%;
          width: 58px;
          height: 5px;
          border-radius: 999px;
          transform: translateX(-50%);
          background: rgba(255,255,255,.42);
          box-shadow: 0 0 10px rgba(0,0,0,.22);
        }

        .tk-bottom-nav-inner {
          width: 100%;
          max-width: 920px;
          margin: 0 auto;
        }

        .tk-bottom-nav-scroll {
          display: flex;
          justify-content: center;
          gap: 8px;
          overflow-x: auto;
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
          padding: 0;
          margin: 0;
        }

        .tk-bottom-nav-scroll::-webkit-scrollbar {
          display: none;
        }

        .nav-pill {
          position: relative;
          flex: 0 0 auto;
          min-width: 72px;
          height: 58px;

          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;

          background:
            linear-gradient(
              180deg,
              #1d2949,
              #16223c
            );

          border: 1px solid rgba(160,180,255,.18);
          border-radius: 14px;
          color: white;
          cursor: pointer;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        }

        .nav-pill:active {
          transform: translateY(1px);
        }

        .nav-pill.is-current {
          background:
            radial-gradient(circle at 50% 0%, rgba(34,197,94,.34), transparent 58%),
            linear-gradient(
              180deg,
              #123929,
              #143627
            );

          border-color: rgba(34,197,94,.55);
          box-shadow:
            0 0 18px rgba(34,197,94,.16),
            inset 0 1px 0 rgba(255,255,255,.08);
          cursor: default;
        }

        .nav-icon-wrap {
          width: 26px;
          height: 26px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .nav-emoji {
          font-size: 23px;
          line-height: 1;
          filter: drop-shadow(0 1px 2px rgba(0,0,0,.25));
        }

        .nav-custom-icon {
          width: 26px;
          height: 26px;
          object-fit: contain;
          display: block;
          user-select: none;
          pointer-events: none;
          filter: drop-shadow(0 1px 2px rgba(0,0,0,.30));
        }

        .nav-label {
          margin-top: 4px;
          font-size: .70rem;
          font-weight: 800;
          line-height: 1;
          white-space: nowrap;
        }

        .nav-pill.is-current .nav-label {
          color: #86efac;
        }

        .current-indicator {
          position: absolute;
          bottom: 0;
          left: 18%;
          right: 18%;
          height: 3px;
          border-radius: 4px;
          background: #22c55e;
        }

        @media (max-width: 760px) {
          .tk-bottom-nav-inner {
            max-width: none;
          }

          .tk-bottom-nav-scroll {
            justify-content: flex-start;
          }
        }

        @media (max-width: 380px) {
          .nav-pill {
            min-width: 66px;
          }

          .nav-icon-wrap {
            width: 24px;
            height: 24px;
          }

          .nav-emoji {
            font-size: 21px;
          }

          .nav-custom-icon {
            width: 24px;
            height: 24px;
          }

          .nav-label {
            font-size: .66rem;
          }
        }
      `}</style>
    </>
  );
}