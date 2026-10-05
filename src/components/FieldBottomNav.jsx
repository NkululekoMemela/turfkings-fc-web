import React, { useEffect, useState, useRef } from "react";
import "./FieldBottomNav.css";

const items = [
  { key: "landing", emoji: "🏡", label: "Home" },
  { key: "stats", emoji: "📊", label: "Stats" },
  { key: "squads", emoji: "👥", label: "Squads" },
  { key: "formations", image: "/formations-icon.png", label: "Lineups" },
  { key: "news", emoji: "📰", label: "News" },
  { key: "videos", image: "/videotape.png", label: "Videos" },
  { key: "lostFound", emoji: "🔎", label: "Lost & Found" },
];

export default function FieldBottomNav({ currentPage, onNavigate }) {
  const [isHidden, setIsHidden] = useState(false);
  const navScroller = useRef(null);

  useEffect(() => {
    const scroller = navScroller.current;
    const current = scroller?.querySelector('[aria-current="page"]');
    if (!scroller || !current) return;
    scroller.scrollTo({
      left: current.offsetLeft - scroller.clientWidth / 2 + current.offsetWidth / 2,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto" : "smooth",
    });
  }, [currentPage]);


  useEffect(() => {
    let timer;

    const showThenScheduleHide = () => {
      setIsHidden(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIsHidden(true), 5000);
    };

    showThenScheduleHide();
    const events = ["touchstart", "mousedown", "keydown", "scroll"];
    for (const name of events) {
      window.addEventListener(name, showThenScheduleHide, {
        passive: true,
        capture: true,
      });
    }

    return () => {
      window.clearTimeout(timer);
      for (const name of events) {
        window.removeEventListener(name, showThenScheduleHide, {
          capture: true,
        });
      }
    };
  }, [currentPage]);

  return (
    <nav
      className={`field-bottom-nav ${isHidden ? "is-hidden" : ""}`}
      aria-label="Field navigation"
    >
      <div ref={navScroller} className="field-bottom-nav__inner"
        style={{gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`}}>
        {items.map(({ key, emoji, image, label }) => {
          const current = currentPage === key;
          return (
            <button
              key={key}
              type="button"
              className={`field-bottom-nav__pill ${current ? "is-current" : ""}`}
              style={{flex: "1 1 0", minWidth: 0}}
              aria-current={current ? "page" : undefined}
              onClick={() => {
                setIsHidden(false);
                if (!current) onNavigate?.(key);
              }}
            >
              <span className="field-bottom-nav__icon" aria-hidden="true">
                {image ? <img src={image} alt="" draggable="false" /> : emoji}
              </span>
              <span className="field-bottom-nav__label">{label}</span>
              {current && <span className="field-bottom-nav__indicator" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
