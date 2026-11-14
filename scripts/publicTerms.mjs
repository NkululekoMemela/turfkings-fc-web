import {BOOKING_TERMS,BOOKING_TERMS_VERSION,BOOKING_SUPPORT} from "../src/legal/bookingTerms.js";
import {LEGAL} from "../src/legal/policies.js";

const escape = text => String(text).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const sections = (rows,heading) => rows.map(([title,body])=>`<section><${heading}>${escape(title)}</${heading}><p>${escape(body)}</p></section>`).join("");
export function publicTermsPage(){
  return `<!doctype html><html lang="en-ZA"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Terms and Conditions | 5 Asides Near Me</title><style>body{margin:0;background:#101929;color:#f0f5ff;font:1rem/1.6 system-ui}main{max-width:48rem;margin:auto;padding:1.5rem 1rem 3rem}a{color:#9beaff}h2{font-size:1.2rem}p{overflow-wrap:anywhere}</style></head><body><main><a href="./">5 Asides Near Me</a><h1>Terms and Conditions</h1><p>Bookings, cancellation, refunds and delivery · South Africa</p><p>Policy version: ${escape(BOOKING_TERMS_VERSION)}</p>${sections(BOOKING_TERMS,"h2")}<p><a href="mailto:${escape(BOOKING_SUPPORT)}">Contact FANM support</a></p>${Object.values(LEGAL).map(policy=>`<details><summary>${escape(policy.title)}</summary>${sections(policy.sections.filter(row=>!BOOKING_TERMS.includes(row)),"h3")}</details>`).join("")}</main></body></html>`;
}
