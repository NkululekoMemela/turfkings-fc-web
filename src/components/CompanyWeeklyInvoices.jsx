import React,{useState} from "react";
import {companyClubsRequest} from "../storage/companyClubsGateway.js";
const money=n=>new Intl.NumberFormat("en-ZA",{style:"currency",currency:"ZAR"}).format(n/100);
function exportInvoice(invoice){
 const cell=value=>'"'+String(value).replace(/"/g,'""')+'"';
 const rows=[["Invoice",invoice.id],["Bill to",invoice.companyName],["Month",invoice.month],["Currency","ZAR"],["Status",invoice.status],["Total",(invoice.totalMinor/100).toFixed(2)],[],["Session date","Staff number","Amount (ZAR)"],...invoice.lines.map(line=>[line.date,line.staffNumber,(line.amountMinor/100).toFixed(2)])];
 const safe=value=>/^[=+\-@]/.test(String(value))?"'"+value:value;
 const url=URL.createObjectURL(new Blob([rows.map(row=>row.map(value=>cell(safe(value))).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"}));
 const link=document.createElement("a");link.href=url;link.download=invoice.id+".csv";document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export default function CompanyWeeklyInvoices({clubId,operator}){
 const [month,setMonth]=useState(""),[rate,setRate]=useState(""),[review,setReview]=useState(null),[selected,setSelected]=useState([]),[invoice,setInvoice]=useState(null),[reference,setReference]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 async function run(action,fields={}){
  setBusy(true);setError("");
  try{const result=await companyClubsRequest({clubId,action,month,...fields});
   if(result.invoice!==undefined){setInvoice(result.invoice);setReview(null);}
   if(result.candidates){setInvoice(null);setReview(result.candidates);setSelected([]);}
  }catch(e){setError(e.message);}finally{setBusy(false);}
 }
 return <details><summary>Company attendance invoices</summary>
  <p>Review a closed month. Confirm who actually played before issuing an invoice. Booking a week does not create a charge.</p>
  <label>Billing month <input type="month" value={month} onChange={e=>{setMonth(e.target.value);setReview(null);setInvoice(null);setError("");}} disabled={busy}/></label>
  <button type="button" className="secondary-btn" disabled={!month||busy} onClick={()=>run("weeklyInvoiceView")}>Find invoice</button>
  {operator&&<button type="button" className="secondary-btn" disabled={!month||busy} onClick={()=>run("weeklyInvoicePreview")}>Review attendance</button>}
  {review&&<section><h4>Confirm attended sessions</h4><p>Tick only verified attendance. Squad estimates can include people who did not play.</p>
   {review.map(row=><label key={row.id} style={{display:"block"}}><input type="checkbox" disabled={busy||!row.staffNumber} checked={selected.includes(row.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,row.id]:ids.filter(id=>id!==row.id))}/> {row.date} · {row.staffNumber||"Staff number missing"}</label>)}
   <label>Agreed rate per staff member per attended day (R) <input inputMode="decimal" value={rate} onChange={e=>setRate(e.target.value)} /></label>
   <p>{selected.length} attended sessions · {money(Math.round((Number(rate)||0)*100)*selected.length)}</p>
   <button type="button" className="primary-btn" disabled={busy||!selected.length||!/^\d+(\.\d{1,2})?$/.test(rate)||Number(rate)<=0}
     onClick={()=>run("weeklyInvoiceIssue",{lineIds:selected,unitMinor:Math.round(Number(rate)*100),confirmed:true})}>Issue invoice</button>
  </section>}
  {invoice&&<section><h4>{invoice.id}</h4><p>{invoice.companyName} · {invoice.lines.length} attended sessions · {money(invoice.totalMinor)} · {invoice.status==="paid"?"Paid":"Outstanding"}</p>
   <button type="button" className="secondary-btn" onClick={()=>exportInvoice(invoice)}>Download invoice CSV</button>
   {operator&&invoice.status!=="paid"&&<><label>Company payment reference <input value={reference} onChange={e=>setReference(e.target.value)} maxLength={120}/></label><button type="button" className="secondary-btn" disabled={busy||!reference.trim()} onClick={()=>run("weeklyInvoicePaid",{reference})}>Record payment received</button></>}
  </section>}
  {error&&<p role="alert">{error}</p>}
 </details>;
}
