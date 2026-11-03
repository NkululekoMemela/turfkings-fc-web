import React,{useEffect,useState} from 'react';
import './FieldPracticePresentation.css';
export default function FieldSessionControl({onClick,disabled=false}){
 const [collapsed,setCollapsed]=useState(false),[revealed,setRevealed]=useState(false);
 useEffect(()=>{const timer=setTimeout(()=>setCollapsed(true),7000);return()=>clearTimeout(timer);},[]);
 const compact=collapsed&&!revealed;
 return <button type="button" className={`field-session-control${compact?' is-compact':''}`} disabled={disabled} onClick={onClick}
   title="Choose Official or Practice session" aria-label="Choose Official or Practice session"
   onMouseEnter={()=>setRevealed(true)} onMouseLeave={()=>setRevealed(false)} onFocus={()=>setRevealed(true)} onBlur={()=>setRevealed(false)}>
   {compact?<span className="field-session-control__dot" aria-hidden="true"/>:<span>Choose Session</span>}
 </button>;
}
