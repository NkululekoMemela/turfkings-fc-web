import React from 'react';
import {KitColourPicker,kitColourName} from './ProfileKitEditor.jsx';
export default function HireStockEditor({stock,setStock,newColor,setNewColor,address,setAddress,busy,onSave}){
 return <form className="hire-stock-editor" onSubmit={e=>{e.preventDefault();onSave();}}><fieldset disabled={busy}>
 <KitColourPicker label="Add bib colour" value={newColor} onChange={setNewColor}/>
 <button type="button" className="secondary-btn" onClick={()=>{const color=kitColourName(newColor).trim();if(color)setStock(rows=>[...rows,...[1,2,3,4,5,6].filter(number=>!rows.some(r=>kitColourName(r.color).toLowerCase()===color.toLowerCase()&&r.number===number)).map(number=>({color,number,quantity:1}))]);}}>Add numbered set 1–6</button>
 {stock.length>0?<div className="hire-stock-table-wrap"><table className="hire-stock-table"><caption>Physical bib stock</caption><thead><tr><th scope="col">Colour</th><th scope="col">Number</th><th scope="col">Quantity</th></tr></thead><tbody>{stock.map((row,i)=><tr key={`${row.color}-${row.number}`}><td><span className="hire-colour-dot" style={{background:row.color}}/>{kitColourName(row.color)}</td><td><b>{row.number}</b></td><td><input aria-label={`${kitColourName(row.color)} number ${row.number} quantity`} type="number" min="0" max="100" step="1" required value={row.quantity} onChange={e=>setStock(rows=>rows.map((r,j)=>i===j?{...r,quantity:e.target.value===''?'':Number(e.target.value)}:r))}/></td></tr>)}</tbody></table></div>:<p>No stock confirmed. Choose a colour to add numbers 1–6.</p>}
 <label className="hire-stock-address">Collection point<input required value={address} maxLength={500} placeholder="e.g. Reception desk" onChange={e=>setAddress(e.target.value)}/></label>
 <button type="submit" className="primary-btn hire-stock-save">{busy?'Saving…':'Confirm physical stock'}</button>
 <small className="hire-stock-note">Enter the actual quantity for each number. Use 0 for unavailable stock.</small>
 </fieldset></form>;
}
