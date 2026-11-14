import React from "react";
import {createPortal} from "react-dom";
import BookingTermsDetails from "../legal/BookingTermsDetails.jsx";
import "./YearEndOverlay.css";

const money=value=>new Intl.NumberFormat("en-ZA",{style:"currency",currency:"ZAR"}).format(value/100);

export default function ShopPaymentReview({title,lines,total,onBack,onPay,busy,error,context="FANM Store"}){
  const [accepted,setAccepted]=React.useState(false);
  return createPortal(<div className="year-end-overlay"><section className="card payment-page year-end-overlay-panel shop-payment-review" role="dialog" aria-modal="true" aria-label="Review payment">
    <div className="payment-hero-top"><div><h2>Payment</h2><p>{title} · {context}</p></div>
      <button type="button" className="secondary-btn" onClick={onBack} disabled={busy}>Back</button></div>
    <div className="payment-summary-simple">
      {lines.map(([label,amount],index)=><div key={index} className="summary-row"><span>{label}</span><strong>{money(amount)}</strong></div>)}
      <div className="summary-row"><strong>Total due</strong><strong>{money(total)}</strong></div>
    </div>
    <BookingTermsDetails/>
    <label><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/> I accept the booking and refund terms.</label>
    {!accepted&&<p className="muted small">Accept the booking terms above to continue.</p>}
    {error&&<p role="alert">{error}</p>}
    <button type="button" className="primary-btn" disabled={!accepted||busy} onClick={onPay}>{busy?"Opening payment…":"Pay securely with Yoco"}</button>
  </section></div>,document.body);
}
