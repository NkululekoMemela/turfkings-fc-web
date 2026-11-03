export default function HandInjuryConfirmationModal({
  pending,
  saving = false,
  onCancel,
  onConfirm,
}) {
  if (!pending) return null;

  const removing = pending.currentlyRestricted === true;
  const playerName = String(
    pending.playerName || "This player"
  ).trim();

  return (
    <div
      className="modal-backdrop"
      style={{ zIndex: 40000 }}
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget &&
          !saving
        ) {
          onCancel?.();
        }
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hand-injury-confirmation-title"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(92vw, 390px)",
          border:
            "1px solid rgba(245,158,11,0.42)",
          background:
            "linear-gradient(155deg, rgba(15,23,42,0.99), rgba(49,28,8,0.98))",
          boxShadow:
            "0 26px 90px rgba(0,0,0,0.7), 0 0 34px rgba(245,158,11,0.1)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 42,
              height: 42,
              flex: "0 0 42px",
              display: "grid",
              placeItems: "center",
              borderRadius: 13,
              background:
                "linear-gradient(135deg, rgba(245,158,11,0.3), rgba(180,83,9,0.18))",
              border:
                "1px solid rgba(245,158,11,0.38)",
              fontSize: 20,
            }}
          >
            💪
          </span>

          <div>
            <p
              style={{
                margin: "0 0 3px",
                color: "#fbbf24",
                fontSize: 10,
                fontWeight: 850,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              Goalkeeper eligibility
            </p>

            <h3
              id="hand-injury-confirmation-title"
              style={{ margin: 0, lineHeight: 1.2 }}
            >
              {removing
                ? "Restore goalkeeper eligibility?"
                : "Confirm Hand injury?"}
            </h3>
          </div>
        </div>

        <div
          style={{
            padding: 13,
            borderRadius: 14,
            background: "rgba(2,6,23,0.5)",
            border:
              "1px solid rgba(148,163,184,0.14)",
          }}
        >
          <strong
            style={{
              display: "block",
              marginBottom: 3,
              color: "#f8fafc",
            }}
          >
            {playerName}
          </strong>

          {pending.teamLabel && (
            <span
              style={{
                display: "block",
                marginBottom: 8,
                color: "rgba(226,232,240,0.58)",
                fontSize: 11,
              }}
            >
              {pending.teamLabel}
            </span>
          )}

          <p
            className="muted"
            style={{
              margin: 0,
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            {removing
              ? `${playerName} may be assigned goalkeeper again.`
              : `${playerName} can still play outfield but will not be assigned goalkeeper.`}
          </p>
        </div>

        <p
          style={{
            margin: "12px 0 14px",
            color: "rgba(253,230,138,0.76)",
            fontSize: 11,
            lineHeight: 1.45,
          }}
        >
          This setting remains active for future matches until
          a captain or admin changes it.
        </p>

        <div
          className="actions-row"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1.4fr",
            gap: 9,
          }}
        >
          <button
            type="button"
            className="secondary-btn"
            disabled={saving}
            onClick={onCancel}
          >
            Cancel
          </button>

          <button
            type="button"
            className="primary-btn"
            disabled={saving}
            onClick={onConfirm}
            style={{
              background: removing
                ? "linear-gradient(135deg, #2563eb, #1d4ed8)"
                : "linear-gradient(135deg, #f59e0b, #d97706)",
              color: removing ? "#f8fafc" : "#111827",
            }}
          >
            {saving
              ? "Saving…"
              : removing
                ? "Restore eligibility"
                : "Confirm Hand injury"}
          </button>
        </div>
      </section>
    </div>
  );
}
