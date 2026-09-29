import FieldTravelSplash from "./FieldTravelSplash.jsx";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function FieldPortalTile({
  style, label, subtitle, onClick, destination, disabled = false,
}) {
  const [travelling, setTravelling] = useState(false);
  const actionRef = useRef(null);

  useEffect(() => {
    if (!travelling) return undefined;
    const timer = window.setTimeout(() => {
      setTravelling(false);
      actionRef.current?.();
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [travelling]);

  return (
    <>
    <style>{`
      @media (max-width: 480px) {
        .field-portal-tile,
        .field-travel-tile-slot {
          grid-column: 1 !important;
        }
      }
    `}</style>
    <button type="button" className="field-portal-tile"
      disabled={disabled || travelling}
      onClick={() => {
        if (disabled || travelling) return;
        if (!destination) { onClick?.(); return; }
        actionRef.current = onClick;
        setTravelling(true);
      }}
      style={{
        ...style,
        gridColumn: "auto",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: "12px",
        position: "relative", overflow: "hidden", color: "#fff",
        background: "radial-gradient(ellipse at 50% 35%, rgba(34,211,238,.22), transparent 60%), linear-gradient(145deg,#17112e,#071426)",
        border: "1px solid rgba(167,139,250,.65)",
        boxShadow: "inset 0 0 24px rgba(139,92,246,.12), 0 0 20px rgba(34,211,238,.1)",
      }}>
      <span aria-hidden="true" style={{
        width: "58px", height: "68px", borderRadius: "50%",
        display: "grid", placeItems: "center",
        border: "3px solid #a78bfa",
        background: "radial-gradient(ellipse,#020617 25%,#164e63 65%,#8b5cf6)",
        boxShadow: "0 0 14px rgba(167,139,250,.7), inset 0 0 14px #22d3ee",
        fontSize: "28px", color: "#a5f3fc",
      }}>🏟️</span>
      <strong style={{ lineHeight: 1.3, textAlign: "center" }}>{label}</strong>
      {subtitle && <small style={{
        maxWidth: "100%", overflowWrap: "anywhere",
        textAlign: "center", color: "#c4b5fd", lineHeight: 1.3,
      }}>{subtitle}</small>}
    </button>
    {travelling && createPortal(
      <FieldTravelSplash destination={destination} />,
      document.body
    )}

    </>
  );
}

export function FieldPortalDialog({ children, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.querySelector("button, select, input")?.focus();
    return () => previous?.isConnected && previous.focus?.();
  }, []);

  return createPortal(
    <div role="presentation" style={{
      position: "fixed", inset: 0, zIndex: 11000,
      display: "grid", placeItems: "center", padding: "12px",
      background: "rgba(2,6,23,.85)",
    }} onKeyDown={event => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const items = [...ref.current.querySelectorAll(
          "button:not(:disabled), select:not(:disabled), input:not(:disabled)"
        )];
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      }
    }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Field portal"
        style={{
          boxSizing: "border-box", width: "min(100%,460px)",
          minWidth: 0, maxHeight: "calc(100dvh - 24px)",
          overflowY: "auto", borderRadius: "20px",
          background: "#111827", color: "#fff", padding: "12px",
        }}>
        <button type="button" className="secondary-btn"
          onClick={onClose} style={{ marginBottom: "12px" }}>Close portal ×</button>
        {children}
      </div>
    </div>,
    document.body
  );
}
