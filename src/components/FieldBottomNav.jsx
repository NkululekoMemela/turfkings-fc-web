import React from "react";
import "./FieldBottomNav.css";

const items = [
  { key: "landing", icon: "⌂", label: "Home" },
  { key: "stats", icon: "▥", label: "Stats" },
  { key: "formations", icon: "♧", label: "Lineups" },
  { key: "news", icon: "▤", label: "News" },
  { key: "videos", icon: "▣", label: "Videos" },
];

export default function FieldBottomNav({ currentPage, onNavigate }) {
  return (
    <nav className="field-bottom-nav" aria-label="Field navigation">
      <div className="field-bottom-nav__items">
        {items.map(({ key, icon, label }) => (
          <button
            key={key}
            type="button"
            aria-current={currentPage === key ? "page" : undefined}
            onClick={() => onNavigate(key)}
          >
            <span aria-hidden="true" className="field-bottom-nav__icon">
              {icon}
            </span>
            <span>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
