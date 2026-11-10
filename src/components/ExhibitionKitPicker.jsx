import React, {useRef, useState} from "react";

const options = [
  ["#0f172a", "Black"], ["#f8fafc", "White"], ["#dc2626", "Red"],
  ["#f97316", "Orange"], ["#facc15", "Yellow"], ["#1d4ed8", "Blue"],
  ["#38bdf8", "Sky blue"], ["#22c55e", "Green"], ["#7c3aed", "Purple"],
];
export function exhibitionKitLabel(value) {
  const hex = String(value || "").toLowerCase();
  return options.find(([id]) => id === hex)?.[1] || (hex === "#f59e0b" || hex === "#d97706" ? "Amber" : hex || "To be agreed");
}

const swatch = (hex) => /^#[0-9a-f]{6}$/i.test(hex) ? <i aria-hidden="true" className="exhibition-kit-swatch" style={{background:hex}}/> : null;

export default function ExhibitionKitPicker({colour, opponentColour, clubName, disabled, onSave}) {
  const current = String(colour || "").toLowerCase();
  const dialog = useRef(null);
  const [pending, setPending] = useState("");
  const [message, setMessage] = useState("");
  const opponent = String(opponentColour || "").toLowerCase();
  const wearLabel = (hex) => hex ? `Wear ${exhibitionKitLabel(hex).toLowerCase()}` : "Choose kit colour";
  if (disabled) return <small className="exhibition-kit-readonly">{swatch(current)}{current ? wearLabel(current) : "Kit to be agreed"}</small>;
  async function select(next) {
    dialog.current?.close();
    if (next === current || next === opponent || pending) return;
    setPending(next); setMessage("");
    try {await onSave(next);}
    catch (error) {setMessage(error.message);}
    finally {setPending("");}
  }
  return <div className="exhibition-kit-picker">
    <button type="button" className="text-input exhibition-kit-trigger" aria-haspopup="dialog"
      disabled={Boolean(pending)} onClick={() => dialog.current?.showModal()}>
      <span>{swatch(pending || current)}{wearLabel(pending || current)}</span><span aria-hidden="true">⌄</span>
    </button>
    <dialog ref={dialog} className="exhibition-kit-dialog" aria-label={`Kit colour for ${clubName}`}>
      <header><strong>Kit colour</strong><button type="button" aria-label="Close kit colours" onClick={() => dialog.current?.close()}>×</button></header>
      <div className="exhibition-kit-options">{options.map(([id, label]) => (
        <button type="button" key={id} aria-pressed={current === id} disabled={id === opponent} onClick={() => select(id)}>
          <span>{swatch(id)}{label}</span><small>{id === opponent ? "Opponent" : current === id ? "Selected" : ""}</small>
        </button>
      ))}</div>
    </dialog>
    {pending && <small role="status">Saving kit…</small>}
    {message && <small role="alert">{message}</small>}
  </div>;
}
