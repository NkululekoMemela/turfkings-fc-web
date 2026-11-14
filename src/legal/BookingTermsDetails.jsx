import React, {useId, useRef} from "react";
import {BOOKING_TERMS, BOOKING_SUPPORT} from "./bookingTerms.js";

export default function BookingTermsDetails(){
  const dialog = useRef(null);
  const title = useId();
  return <>
    <button type="button" className="secondary-btn" onClick={()=>dialog.current.showModal()}>Booking & refund terms</button>
    <dialog ref={dialog} aria-labelledby={title} className="fanm-booking-terms-dialog">
      <div className="fanm-booking-terms-close"><button type="button" className="secondary-btn" onClick={()=>dialog.current.close()}>Close</button></div>
      <h2 id={title}>Booking, cancellation, refund and delivery</h2>
      {BOOKING_TERMS.map(([heading,detail])=><p key={heading}><strong>{heading}:</strong> {detail}</p>)}
      <p>FANM support: {BOOKING_SUPPORT}</p>
    </dialog>
  </>;
}
