import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './PoolDialog.css';
let pending=false;
function Dialog({message,value,mode,finish,theme='pool'}){
 const panel=useRef(null),[text,setText]=useState(value||'');
 const danger=/delete|remove|clear|end this tournament|cancel this game|cancel game/i.test(message);
 const choices=[
  [/end this tournament/i,'End this tournament?','End tournament'],
  [/make .+night admin/i,'Pass admin duties?','Make admin'],
  [/remove .+from this night/i,'Remove this player?','Remove player'],
  [/cancel this game|cancel game/i,'Cancel this game?','Cancel game'],
  [/has this game finished/i,'Release this table?','Release table'],
  [/delete .+results/i,'Delete this player?','Delete player'],
  [/start a new night/i,'Start a fresh night?','Start new night'],
  [/remove this result/i,'Remove this result?','Remove result'],
  [/remove empty table/i,'Remove this table?','Remove table'],
  [/switch to/i,'Change the game format?','Change format'],
 ];
 const choice=choices.find(([pattern])=>pattern.test(message));
 const title=mode==='prompt'?'Player name':choice?.[1]||(mode==='alert'?'Field update':'Before you continue');
 const action=mode==='prompt'?'Save name':choice?.[2]||(mode==='alert'?'Got it':'Continue');
 useEffect(()=>{
  const last=document.activeElement,old=document.body.style.overflow;
  document.body.style.overflow='hidden';
  // Destructive actions never receive the initial keyboard focus.
  panel.current?.querySelector(mode==='prompt'?'input':mode==='alert'?'button[type=submit]':'[data-cancel]')?.focus();
  const key=e=>{
   if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();finish(mode==='prompt'?null:false);}
   if(e.key==='Tab'){
    const elements=[...panel.current.querySelectorAll('button,input')].filter(el=>!el.disabled);
    const first=elements[0],last=elements.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
   }
  };
  document.addEventListener('keydown',key,true);
  return()=>{document.removeEventListener('keydown',key,true);document.body.style.overflow=old;if(last?.isConnected)last.focus();};
 },[]);
 return <div className="pool-dialog-backdrop"><section ref={panel} className={`pool-dialog ${theme==='field'?'field-premium-dialog':''}`} role="dialog" aria-modal="true" aria-labelledby="pool-dialog-title" aria-describedby="pool-dialog-copy">
  <header><span className="pool-dialog-ball" aria-hidden="true">{theme==='field'?<span>⚽</span>:<i>8</i>}</span><span><small>{theme==='field'?'FANM · FIELD CLUBHOUSE':'THE POOL ROOM'}</small><h2 id="pool-dialog-title">{title}</h2></span></header>
  <p id="pool-dialog-copy">{message}</p>
  <form onSubmit={e=>{e.preventDefault();finish(mode==='prompt'?text:true);}}>
   {mode==='prompt'&&<label>Player name<input maxLength={40} required value={text} onChange={e=>setText(e.target.value)}/></label>}
   <div className="pool-dialog-actions">{mode!=='alert'&&<button type="button" data-cancel onClick={()=>finish(mode==='prompt'?null:false)}>Go back</button>}<button className={danger?'is-danger':''} type="submit" disabled={mode==='prompt'&&!text.trim()}>{action}</button></div>
  </form>
 </section></div>;
}
export function openDialog(message,value,mode,theme='pool'){
 // Ignore rapid duplicate taps rather than opening stacked confirmations.
 if(pending)return Promise.resolve(mode==='prompt'?null:false);
 pending=true;
 return new Promise(resolve=>{
  const host=document.createElement('div');document.body.appendChild(host);
  const root=createRoot(host);let done=false;
  function finish(result){if(done)return;done=true;root.unmount();host.remove();pending=false;resolve(result);}
  root.render(<Dialog message={String(message)} value={value} mode={mode} theme={theme} finish={finish}/>);
 });
}
export const poolConfirm=message=>openDialog(message,'','confirm');
export const poolPrompt=(message,value)=>openDialog(message,value,'prompt');
