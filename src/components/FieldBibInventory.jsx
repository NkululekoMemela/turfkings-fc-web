import React,{useState} from 'react';
import PremiumSelect from './PremiumSelect.jsx';
import {kitColourName} from './ProfileKitEditor.jsx';
import {bibStockRows,nextBibAssignments} from '../core/fieldBibStock.mjs';
import {fieldDateLabel} from '../core/fieldRouteSafety.mjs';
export default function FieldBibInventory({data,stock,setStock,upcoming,day,busy,onSave}){
 const [editing,setEditing]=useState(false),[newColor,setNewColor]=useState('Blue');
 const rows=bibStockRows(stock),assignments=nextBibAssignments(upcoming?.clubs||[]),manager=data.manager;
 const editable=editing&&manager;
 const change=(color,number,value)=>setStock(old=>{const found=old.some(r=>r.color===color&&Number(r.number)===number);return found?old.map(r=>r.color===color&&Number(r.number)===number?{...r,quantity:value}:r):[...old,{color,number,quantity:value}];});
 async function save(){if(await onSave())setEditing(false);}
 return <div className="field-bib-inventory">
  <section><div className="bib-inventory-title"><h4>Bib inventory</h4>{manager&&<button type="button" className="secondary-btn" disabled={busy} onClick={()=>{if(editing)setStock(data.config.stock||[]);setEditing(v=>!v);}}>{editing?'Cancel':'Edit stock'}</button>}</div>
   {rows.length?<div className="bib-inventory-scroll"><table className="bib-inventory-table"><thead><tr><th>Colour</th>{[1,2,3,4,5,6].map(n=><th key={n}>#{n}</th>)}<th>Total</th></tr></thead><tbody>{rows.map(row=><tr key={row.color}><th><span className="bib-inventory-colour"><i style={{background:row.color}}/>{kitColourName(row.color)}</span></th>{[1,2,3,4,5,6].map(n=><td key={n}>{editable?<input type="number" min="0" max="100" step="1" aria-label={`${kitColourName(row.color)} number ${n} quantity`} value={row.numbers[n]||0} onChange={e=>change(row.color,n,Math.max(0,Math.min(100,Math.floor(Number(e.target.value)||0))))}/>:row.numbers[n]||0}</td>)}<td><b>{row.total}</b></td></tr>)}</tbody></table></div>:<p className="muted small">No stock recorded yet.</p>}
   {manager&&editing&&<div className="bib-inventory-edit"><PremiumSelect aria-label="Add bib colour" value={newColor} onChange={e=>setNewColor(e.target.value)}>{['Blue','Orange','Green','Yellow','Red','White','Black','Purple'].map(c=><option key={c}>{c}</option>)}</PremiumSelect><button className="secondary-btn" disabled={busy} onClick={()=>setStock(old=>old.some(r=>kitColourName(r.color).toLowerCase()===newColor.toLowerCase())?old:[...old,...[1,2,3,4,5,6].map(number=>({color:newColor,number,quantity:0}))])}>Add colour</button><button className="primary-btn" disabled={busy} onClick={save}>{busy?'Saving…':'Save stock'}</button></div>}
  </section>
  <section><div className="bib-inventory-title"><h4>Next matchday</h4>{day&&<small>{fieldDateLabel(day.dateLocal)}</small>}</div>
   {!day?<p className="muted small">No upcoming published matchday.</p>:!upcoming?<p className="muted small">Loading assignments…</p>:<div className="bib-inventory-scroll"><table className="bib-inventory-table bib-assignment-table"><thead><tr><th>Club</th><th>Colour</th><th>Bib numbers</th></tr></thead><tbody>{assignments.map(a=><tr key={a.clubId}><th>{a.name}</th><td><span className="bib-inventory-colour"><i style={{background:a.color||'transparent'}}/>{a.color?kitColourName(a.color):'Not assigned'}</span></td><td>{a.numbers.join(', ')||'–'}</td></tr>)}</tbody></table></div>}
  </section>
 </div>;
}
