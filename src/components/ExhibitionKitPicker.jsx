import React, {useState} from "react";
import TeamColourPalette from "./TeamColourPalette.jsx";

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
  const [pending, setPending] = useState("");
  const [message, setMessage] = useState("");
  const opponent = String(opponentColour || "").toLowerCase();
  const wearLabel = (hex) => hex ? `Wear ${exhibitionKitLabel(hex).toLowerCase()}` : "Choose kit colour";
  if (disabled) return <small className="exhibition-kit-readonly">{swatch(current)}{current ? wearLabel(current) : "Kit to be agreed"}</small>;
  async function select(next) {
    if (next === current || next === opponent || pending) return;
    setPending(next); setMessage("");
    try {await onSave(next);}
    catch (error) {setMessage(error.message);}
    finally {setPending("");}
  }
  return <div className="exhibition-kit-picker">
    <TeamColourPalette label={`Kit colour for ${clubName}`} value={pending || current}
      selectedLabel={wearLabel(pending || current)} options={options.map(([hex,name])=>({hex,name,value:hex}))}
      isBlocked={option=>option.hex===opponent} disabled={Boolean(pending)} onSelect={select}/>
    {pending && <small role="status">Saving kit…</small>}
    {message && <small role="alert">{message}</small>}
  </div>;
}
