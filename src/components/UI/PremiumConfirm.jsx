import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import "./PremiumConfirm.css";

function PremiumConfirmModal({
  icon = "✅",
  title = "Are you sure?",
  message = "",
  detail = "",
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "success",
  onResolve,
}) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onResolve(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onResolve]);

  return (
    <div className="premium-confirm-backdrop" role="presentation">
      <section
        className={`premium-confirm premium-confirm--${variant}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <button
          type="button"
          className="premium-confirm__close"
          onClick={() => onResolve(false)}
          aria-label="Close"
        >
          ×
        </button>

        <div className="premium-confirm__icon">{icon}</div>

        <h2>{title}</h2>

        {message ? <p className="premium-confirm__message">{message}</p> : null}

        {detail ? (
          <div className="premium-confirm__detail">
            <strong>Important</strong>
            <span>{detail}</span>
          </div>
        ) : null}

        <footer className="premium-confirm__actions">
          <button
            type="button"
            className="premium-confirm__cancel"
            onClick={() => onResolve(false)}
          >
            {cancelText}
          </button>

          <button
            type="button"
            className="premium-confirm__confirm"
            onClick={() => onResolve(true)}
          >
            {confirmText}
          </button>
        </footer>
      </section>
    </div>
  );
}

export function showPremiumConfirm(options = {}) {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const root = createRoot(host);

    const cleanup = (value) => {
      root.unmount();
      host.remove();
      resolve(value);
    };

    root.render(<PremiumConfirmModal {...options} onResolve={cleanup} />);
  });
}
