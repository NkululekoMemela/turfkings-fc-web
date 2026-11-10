import React,{useState,useEffect} from 'react';
import TeamColourPalette, {TeamKitSwatch} from './TeamColourPalette.jsx';
import {kitColourName} from './ProfileKitEditor.jsx';
import {bibStockRows,nextBibAssignments,kitColourKey,bibPackAudit} from '../core/fieldBibStock.mjs';
import {fieldDateLabel} from '../core/fieldRouteSafety.mjs';
const BIB_COLOURS = [
  ['Blue', '#2563eb'], ['Orange', '#f97316'], ['Green', '#16a34a'], ['Yellow', '#facc15'],
  ['Red', '#dc2626'], ['White', '#ffffff'], ['Black', '#111827'], ['Purple', '#9333ea'],
].map(([name, hex]) => ({name, value: name, hex}));

function StockBibColour({colour}) {
  const option = BIB_COLOURS.find(({name}) => name.toLowerCase() === String(colour || '').toLowerCase());
  return <span className="bib-inventory-colour">
    {colour && <TeamKitSwatch kind="bib" colour={option?.hex || colour}/>}
    {colour ? kitColourName(colour) : 'Not assigned'}
  </span>;
}

export default function FieldBibInventory({data,stock,setStock,upcoming,day,busy,onSave,onLoadLedger,onOpenReturns,onEditingChange}){
 const [editing,setEditing]=useState(false),[newColor,setNewColor]=useState('Blue'),[extraNumber,setExtraNumber]=useState('7');
 const [stockTake,setStockTake]=useState(false);
 useEffect(()=>{onEditingChange?.(editing);return()=>onEditingChange?.(false);},[editing]);
 const [ledger,setLedger]=useState(null),[ledgerLoading,setLedgerLoading]=useState(false);
 const audit=bibPackAudit(stock).filter(row=>!row.complete);
 const rows=bibStockRows(stock),assignments=nextBibAssignments(upcoming?.clubs||[],data.config.stock||[],Boolean(data.config.confirmedAtMs)),manager=data.manager;
 const numbers=[...new Set([1,2,3,4,5,6,...stock.map(row=>Number(row.number))])].sort((a,b)=>a-b);
 const quantity=(color,n)=>stock.find(row=>kitColourKey(row.color)===kitColourKey(color)&&Number(row.number)===n)?.quantity??0;
 const editable=editing&&manager;
 const change=(color,number,value)=>setStock(old=>{const found=old.some(r=>kitColourKey(r.color)===kitColourKey(color)&&Number(r.number)===number);return found?old.map(r=>kitColourKey(r.color)===kitColourKey(color)&&Number(r.number)===number?{...r,quantity:value}:r):[...old,{color,number,quantity:value}];});
 async function save(){if(await onSave())setEditing(false);}
 return <div className="field-bib-inventory">
  {stockTake&&<div className="bib-returns-overlay" role="dialog" aria-modal="true" aria-label="Quick stock-take"><section><header><strong>Quick stock-take</strong><button type="button" aria-label="Close stock-take" onClick={()=>setStockTake(false)}>×</button></header><p className="muted small">Packs contain 6 or 12 bibs.</p>{ledgerLoading?<p>Checking held bibs…</p>:ledger&&<div className="bib-custody-summary"><span>On hand <b>{ledger.available}</b></span><span>With players <b>{ledger.out-ledger.missing}</b></span><span>Missing <b>{ledger.missing}</b></span>{ledger.unsettledMinor>0&&<small>Replacement receipts awaiting confirmation: R{(ledger.unsettledMinor/100).toFixed(2)}</small>}<button className="secondary-btn" onClick={()=>{setStockTake(false);onOpenReturns?.();}}>Bibs & returns</button></div>}{audit.length?audit.map(row=><article key={row.color}><strong><StockBibColour colour={row.color}/></strong><p>{row.total} bibs · {row.missing} short of {row.target}</p><small>Recorded numbers: {Object.entries(row.numbers).filter(([,q])=>q>0).map(([n,q])=>`#${n}${q>1?` × ${q}`:''}`).join(', ')||'None'}</small></article>):<p>Recorded totals form complete packs.</p>}<button className="primary-btn" onClick={()=>{setStockTake(false);setEditing(true);}}>Update stock</button></section></div>}

  <section><div className="bib-inventory-title"><h4>Bib inventory</h4><div className="bib-stock-action-group">{manager&&<button type="button" className="secondary-btn" onClick={()=>{setStockTake(true);setLedgerLoading(true);onLoadLedger?.().then(value=>setLedger(value.ledger)).catch(()=>setLedger(null)).finally(()=>setLedgerLoading(false));}}>Stock-take</button>}{manager&&<button type="button" className="secondary-btn" disabled={busy} onClick={()=>{if(editing)setStock(data.config.stock||[]);setEditing(v=>!v);}}>{editing?'Cancel':'Edit stock'}</button>}</div></div>
   {rows.length?<div className="bib-inventory-scroll"><table className="bib-inventory-table"><thead><tr><th>Colour</th>{numbers.map(n=><th key={n}><span className="bib-number-label">Bib</span> #{n}</th>)}<th className="bib-total-column">Total</th></tr></thead><tbody>{rows.map(row=><tr key={row.color}><th><StockBibColour colour={row.color}/></th>{numbers.map(n=><td key={n}>{editable?<input type="number" min="0" max="100" step="1" aria-label={`${kitColourName(row.color)} number ${n} quantity`} value={quantity(row.color,n)||''} onFocus={e=>e.target.select()} onChange={e=>change(row.color,n,e.target.value===''?'':Math.max(0,Math.min(100,Math.floor(Number(e.target.value)||0))))}/>:row.numbers[n]||''}</td>)}<td className="bib-total-column"><b>{row.total||''}</b></td></tr>)}</tbody><tfoot><tr><th>Total</th>{numbers.map(n=><td key={n}>{rows.reduce((sum,row)=>sum+(row.numbers[n]||0),0)||''}</td>)}<td className="bib-total-column"><b>{rows.reduce((sum,row)=>sum+row.total,0)||''}</b></td></tr></tfoot></table></div>:<p className="muted small">No stock recorded yet.</p>}
   {manager&&editing&&<div className="bib-inventory-edit"><p className="muted small" style={{gridColumn:"1 / -1",margin:0}}>Enter total bibs owned, including registered checked-out bibs.</p><TeamColourPalette label="Add bib colour" kind="bib" options={BIB_COLOURS} value={newColor} onSelect={setNewColor} disabled={busy}/><button className="secondary-btn" disabled={busy} onClick={()=>setStock(old=>old.some(r=>kitColourName(r.color).toLowerCase()===newColor.toLowerCase())?old:[...old,...[1,2,3,4,5,6].map(number=>({color:newColor,number,quantity:0}))])}>Add colour</button><label>Bib number<input type="number" min="1" max="999" value={extraNumber} onFocus={e=>e.target.select()} onChange={e=>setExtraNumber(e.target.value)}/></label><button className="secondary-btn" disabled={busy||!Number.isInteger(Number(extraNumber))||Number(extraNumber)<1||Number(extraNumber)>999} onClick={()=>setStock(old=>old.some(row=>kitColourKey(row.color)===kitColourKey(newColor)&&Number(row.number)===Number(extraNumber))?old:[...old,{color:newColor,number:Number(extraNumber),quantity:0}])}>Add number to {newColor}</button><button className="primary-btn" disabled={busy} onClick={save}>{busy?'Saving…':'Save stock'}</button></div>}
  </section>
  <section><div className="bib-inventory-title"><h4>Next matchday</h4>{day&&<small>{fieldDateLabel(day.dateLocal)}</small>}</div>
   {!day?<p className="muted small">No upcoming published matchday.</p>:!upcoming?<p className="muted small">Loading assignments…</p>:<div className="bib-inventory-scroll"><table className="bib-inventory-table bib-assignment-table"><thead><tr><th>Club</th><th>Colour</th><th>Bib numbers</th><th>Status</th></tr></thead><tbody>{assignments.map(a=><tr key={a.clubId}><th>{a.name}</th><td><StockBibColour colour={a.color}/></td><td>{a.numbers.join(', ')||'–'}</td><td>{a.ready?'Ready':'Confirm stock'}</td></tr>)}</tbody></table></div>}
  </section>
 </div>;
}
