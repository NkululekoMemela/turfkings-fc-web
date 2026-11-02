import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import './CompactPlayerNumber.css';
export default function CompactPlayerNumber({number,onCommit,disabled=false,name='Player'}){
 const [editing,setEditing]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[draft,setDraft]=useState(''),[shown,setShown]=useState(number),[position,setPosition]=useState({left:8,top:8});
 const anchor=useRef(null),popup=useRef(null);
 useEffect(()=>setShown(number),[number]);
 useEffect(()=>{if(!editing)return;const outside=e=>{if(!anchor.current?.contains(e.target)&&!popup.current?.contains(e.target)&&!busy){setEditing(false);setError('');}};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[editing,busy]);
 async function save(){if(busy)return;setBusy(true);setError('');try{await onCommit?.(draft);setShown(draft.trim()===''?null:Number(draft));setEditing(false);}catch(e){setError(e.message);}finally{setBusy(false);}}
 const editor=editing?<span ref={popup} className="compact-number-confirm" role="group" aria-label={`Confirm ${name}'s number`} style={position} onClick={e=>e.stopPropagation()}><input autoFocus aria-label={`${name} number`} inputMode="numeric" maxLength={3} value={draft} disabled={busy} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter')save();if(e.key==='Escape'){setEditing(false);setError('');}}}/><button type="button" disabled={busy} aria-label={`Confirm ${name}'s number`} onClick={save}>{busy?'…':'✓'}</button><button type="button" disabled={busy} aria-label="Cancel number edit" onClick={()=>{setEditing(false);setError('');}}>×</button>{error&&<small role="alert">{error}</small>}</span>:null;
 return <span ref={anchor} className="compact-player-number" onClick={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()}>{onCommit&&!disabled?<button type="button" title={`Edit ${name}'s number`} onClick={()=>{const r=anchor.current.getBoundingClientRect();setPosition({left:Math.max(8,Math.min(r.left,window.innerWidth-148)),top:Math.max(8,Math.min(r.bottom+4,window.innerHeight-65))});setDraft(shown==null?'':String(shown));setEditing(true);}}>({shown??'-'})</button>:<span>({shown??'-'})</span>}{editor&&createPortal(editor,document.body)}</span>;
}
