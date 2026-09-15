import React from "react";

export function tileButtonStyle(isMobile, extra = {}) {
  return {
    borderRadius: "1rem",
    aspectRatio: "1 / 1",
    minHeight: isMobile ? "138px" : "138px",
    maxHeight: isMobile ? "none" : "150px",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    fontWeight: 700,
    whiteSpace: "normal",
    lineHeight: 1.15,
    padding: isMobile ? "0.85rem" : "0.9rem",
    boxSizing: "border-box",
    overflow: "hidden",
    ...extra,
  };
}

export function renderTileContent({ isMobile, icon, desktopLines, mobileLines }) {
  const lines = isMobile ? mobileLines : desktopLines;

  return (
    <span
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: isMobile ? "0.38rem" : "0.12rem",
        lineHeight: 1.1,
        fontWeight: 700,
        width: "100%",
        minWidth: 0,
      }}
    >
      <span style={{ fontSize: isMobile ? "1.2rem" : "1rem" }}>{icon}</span>
      {lines.map((line) => (
        <span
          key={line}
          style={{
            display: "block",
            width: "100%",
            fontSize: isMobile ? "0.94rem" : "0.98rem",
            overflowWrap: "anywhere",
          }}
        >
          {line}
        </span>
      ))}
    </span>
  );
}

