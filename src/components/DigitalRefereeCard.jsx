import React from 'react';
import {createPortal} from 'react-dom';
import './DigitalRefereeCard.css';
export default function DigitalRefereeCard({card,onClose}){
 if(!card)return null;
 const red=card.type==='red_card';
 return createPortal(<div role="dialog" aria-modal="true" aria-label={red?'Red card':'Yellow card'} className="digital-referee-card" style={{background:red?'#ee152c':'#ffe000'}}>
  <div><strong>{red?'RED CARD':'YELLOW CARD'}</strong><p>{card.name}</p>{card.secondCaution&&<small>Second caution</small>}</div>
  <button type="button" onClick={onClose} aria-label="Close referee card">×</button>
 </div>,document.body);
}
