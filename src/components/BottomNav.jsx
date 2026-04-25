// src/components/BottomNav.jsx
// Flat integrated footer version with NO rounded outer edges
// Uses public/strategy.png for the Lineups icon.

import React from "react";

const items = [
  { key: "landing", emoji: "🏡", label: "Home" },
  { key: "stats", emoji: "📊", label: "Stats" },
  { key: "live", emoji: "⚽", label: "Live" },
  { key: "squads", emoji: "👥", label: "Squads" },
  { key: "formations", image: "/strategy.png", label: "Lineups" },
  { key: "peer-review", emoji: "⭐", label: "Rate" },
  { key: "player-cards", emoji: "🪪", label: "Cards" },
  { key: "news", emoji: "📰", label: "News" },
  { key: "match-signup", emoji: "💳", label: "Pay" },
];

export default function BottomNav({ currentPage, onNavigate }) {
  const visible = items.filter((item) => item.key !== currentPage);

  return (
    <>
      <nav className="tk-bottom-nav-flat" aria-label="Turf Kings navigation">
        <div className="tk-bottom-nav-scroll">
          {visible.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onNavigate?.(item.key)}
              className={`nav-pill ${item.key === "live" ? "featured" : ""}`}
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

              {item.key === "live" && <span className="live-indicator" />}
            </button>
          ))}
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
        }

        .tk-bottom-nav-scroll {
          display: flex;
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

        .nav-pill.featured {
          background:
            linear-gradient(
              180deg,
              #123929,
              #143627
            );

          border-color: rgba(34,197,94,.48);
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

        .live-indicator {
          position: absolute;
          bottom: 0;
          left: 18%;
          right: 18%;
          height: 3px;
          border-radius: 4px;
          background: #22c55e;
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