import React from "react";

export default function FieldClubBookingMatrix({
  club, dates, seasonEnabled, selectedDates, seasonSelected,
  onToggleDate, onToggleSeason, disabled, isMobile,
}) {
  const columns = [
    ...dates.map(date => ({
      id: date,
      label: new Date(`${date}T12:00:00`).toLocaleDateString(
        "en-ZA", {day: "numeric", month: "short"}
      ),
    })),
  ];
  return (
    <div className="signup-matrix-wrap" style={{overflowX: "auto"}}>
      <div className={`signup-matrix ${isMobile ? "is-mobile-matrix" : ""}`}
        style={{
          gridTemplateColumns: `180px repeat(${columns.length}, minmax(100px, 1fr))`,
          minWidth: 180 + columns.length * 100,
        }}>
        <div className="matrix-corner-cell">Clubs</div>
        {columns.map(column => (
          <div key={`head-${column.id}`} className="matrix-week-head">
            {column.label}
          </div>
        ))}
        <div className="matrix-player-cell is-current-player">
          <div className="matrix-player-info">
            <div className="matrix-player-avatar">
              {club.logoUrl ? <img src={club.logoUrl} alt={club.name} />
                : <span>{club.name.charAt(0).toUpperCase()}</span>}
            </div>
            <div className="matrix-player-text">
              <div className="matrix-player-name">{club.name}</div>
              <div className="matrix-player-tag">Your Club</div>
            </div>
          </div>
        </div>
        {columns.map(column => {
          const selected = selectedDates.includes(column.id);
          return (
            <button key={column.id} type="button"
              className={`matrix-pick-cell current-player-cell is-current-row ${
                selected ? "is-selected" : ""
              }`}
              disabled={disabled} aria-pressed={selected}
              aria-label={`${club.name}: ${column.label}`}
              onClick={() => onToggleDate(column.id)}>
              <div className="matrix-pick-inner">
                <span className="matrix-pick-mark">{selected ? "✓" : "+"}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
