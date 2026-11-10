import React, {useRef} from "react";
import "./TeamColourPalette.css";

export default function TeamColourPalette({options, value, label="Kit colour", selectedLabel, onSelect, disabled, isBlocked}) {
  const dialog=useRef(null);
  const selected=options.find(option=>option.value===value);
  const swatch=selected?.hex || (/^#[\da-f]{6}$/i.test(value||"") ? value : "");
  return <div className="team-colour-palette">
    <button type="button" className="team-colour-trigger" aria-haspopup="dialog" aria-label={`${label}: ${selectedLabel || selected?.name || "Not set"}`}
      disabled={disabled} onClick={()=>dialog.current?.showModal()}>
      <i style={swatch?{background:swatch}:undefined} aria-hidden="true"/>
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
            <i aria-hidden="true" style={{background:option.hex}}/>
            <span>{option.name}</span>
            {active && <b aria-hidden="true">✓</b>}
          </button>;
        })}
      </div>
    </dialog>
  </div>;
}
