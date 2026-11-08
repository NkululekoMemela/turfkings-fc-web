import React from "react";
import { createRoot } from "react-dom/client";
import { FieldPortalDialog } from "./FieldPortalTile.jsx";

export function fieldMatchLabel(match) {
  if (!match) return "";
  const pairing = `${match.clubAName || match.clubAId} vs ${match.clubBName || match.clubBId}`;
  return [pairing, match.pitchNumber && `Pitch ${match.pitchNumber}`,
    match.scheduledLocal?.slice(11,16)].filter(Boolean).join(" · ");
}

export function pickFieldMatch(label, choices) {
  if (choices.length === 0) return Promise.resolve(null);
  if (choices.length === 1) return Promise.resolve(choices[0]);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  return new Promise(resolve => {
    let done = false;
    const finish = match => {
      if (done) return;
      done = true;
      root.unmount();
      host.remove();
      resolve(match);
    };
    root.render(<FieldPortalDialog label={label} onClose={() => finish(null)}>
      <h2>{label}</h2>
      <div style={{display: "grid", gap: 8}}>
        {choices.map(match => <button type="button" className="secondary-btn"
          key={match.fixtureId || match.id} onClick={() => finish(match)}>
          {fieldMatchLabel(match)}
        </button>)}
      </div>
    </FieldPortalDialog>);
  });
}
