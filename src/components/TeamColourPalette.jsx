import React, {useId, useRef} from "react";
import "./TeamColourPalette.css";

const JERSEY = "M23 8 10 13 3 26l11 7 5-8v30h26V25l5 8 11-7-7-13-13-5c-2 5-5 7-9 7s-7-2-9-7Z";
const BIB = "M20 8h6c0 5 2 8 6 8s6-3 6-8h6c0 9 3 16 7 20l-2 27H15l-2-27c4-4 7-11 7-20Z";

export function TeamKitSwatch({colour, kind = "jersey"}) {
  const id = useId();
  const bib = kind === "bib";
  const shape = bib ? BIB : JERSEY;
  return (
    <svg className="team-kit-swatch" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} x2="0" y2="1">
          <stop stopColor="#fff" stopOpacity=".24"/>
          <stop offset=".48" stopColor="#fff" stopOpacity="0"/>
          <stop offset="1" stopColor="#071122" stopOpacity=".23"/>
        </linearGradient>
        {bib && <pattern id={`${id}-mesh`} width="3" height="3" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r=".45" fill="#fff" opacity=".34"/>
        </pattern>}
      </defs>
      <path d={shape} fill={colour || "#64748b"}/>
      {bib && <path d={shape} fill={`url(#${id}-mesh)`}/>}
      <path d={shape} fill={`url(#${id})`} stroke="#e2efff" strokeOpacity=".65" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d={bib ? "M24 10c1 6 4 9 8 9s7-3 8-9M18 51h28" : "M22 12c3 5 6 6 10 6s7-1 10-6M7 25l8 5m34 0 8-5M22 51h20"}
        fill="none" stroke="#e2efff" strokeOpacity=".48" strokeWidth="1.15" strokeLinecap="round"/>
    </svg>
  );
}

export default function TeamColourPalette({options, value, label="Kit colour", selectedLabel, onSelect, disabled, isBlocked, kind="jersey"}) {
  const dialog=useRef(null);
  const selected=options.find(option=>option.value===value);
  const swatch=selected?.hex || (/^#[\da-f]{6}$/i.test(value||"") ? value : "");
  return <div className="team-colour-palette">
    <button type="button" className="team-colour-trigger" aria-haspopup="dialog" aria-label={`${label}: ${selectedLabel || selected?.name || "Not set"}`}
      disabled={disabled} onClick={()=>dialog.current?.showModal()}>
      <TeamKitSwatch colour={swatch} kind={kind}/>
      <span>{selectedLabel || selected?.name || "Choose colour"}</span><span aria-hidden="true">⌄</span>
    </button>
    <dialog ref={dialog} className="team-colour-dialog" aria-label={label}>
      <header><strong>{label}</strong><button type="button" aria-label="Close colour picker" onClick={()=>dialog.current?.close()}>×</button></header>
      <div className="team-colour-grid">
        {options.map(option=>{
          const active=option.value===value;
          const blocked=Boolean(isBlocked?.(option));
          return <button key={option.value} type="button" aria-pressed={active} disabled={blocked}
            aria-label={blocked?`${option.name}, used by opponent`:option.name}
            onClick={()=>{dialog.current?.close();if(!active)onSelect?.(option.value);}}>
            <TeamKitSwatch colour={option.hex} kind={kind}/>
            <span>{option.name}</span>
            {active && <b aria-hidden="true">✓</b>}
          </button>;
        })}
      </div>
    </dialog>
  </div>;
}
