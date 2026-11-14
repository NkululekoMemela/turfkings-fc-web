const escape=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const money=amount=>new Intl.NumberFormat("en-ZA",{style:"currency",currency:"ZAR"}).format(amount/100);
async function respond(req,res,db){
 const origin="https://5asidenearme.com";
 const event=(await db.doc("yearEndEvents/turf-kings").get()).data();
 if(!event||event.archived||event.startsAt<=Date.now())return res.status(404).send("This event invitation is no longer available.");
 const title=escape(event.title||"TurfKings Year-End Function");
 const date=new Intl.DateTimeFormat("en-ZA",{weekday:"short",day:"numeric",month:"long",year:"numeric",timeZone:"Africa/Johannesburg"}).format(event.startsAt);
 const detail=escape(date+" · "+event.arrival+" arrival");
 const dress=escape(event.date.startsWith("2026-")&&/^suits\s*(?:&|and)\s*smart fits$/i.test(event.dress)?"Formal and smart fits":event.dress);
 res.set("Cache-Control","public, max-age=60");
 return res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><meta property="og:type" content="website"><meta property="og:title" content="${title}"><meta property="og:description" content="${detail} · ${escape(event.venue)}"><meta property="og:image" content="${origin}/year-end-toast.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><style>body{margin:0;padding:16px;background:#081120;color:#e8effb;font:16px/1.5 system-ui}main{max-width:560px;margin:auto;border:1px solid #526179;border-radius:20px;overflow:hidden;background:#151e30}img{width:100%;display:block}article{padding:18px}h1{margin:0}p{margin:.65rem 0}a{display:block;text-align:center;padding:12px;background:#166d40;color:white;border-radius:12px;text-decoration:none;font-weight:700}</style></head><body><main><img src="/year-end-toast.png" alt="TurfKings Toast"><article><h1>${title}</h1><p>${escape(event.intro||"We’re closing off the season in proper TurfKings style.")}</p><p><strong>${detail}</strong><br>${escape(event.venue)}</p><p>Dress code: ${dress}</p><p><strong>Coolerboxes &amp; bottles:</strong> ${escape(event.drinksCopy||"Bring your own drinks.")} Corkage at the entrance: ${money(event.cooler)} per coolerbox and ${money(event.bottle)} per bottle.</p><p><strong>Cover charge:</strong> ${money(event.player)} per player + ${money(event.guest)} per friend (max ${event.maxGuests}). ${escape(event.coverCopy)}</p><a href="/?yearEndRsvp=1">RSVP</a></article></main></body></html>`);
}
module.exports={respond};
