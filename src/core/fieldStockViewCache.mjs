const prefix='fanm-stock-view:v1:';
export function readStockView(storage,project,uid,venue,club=''){
 if(!storage||!project||!uid||!venue)return null;
 try{const saved=JSON.parse(storage.getItem(prefix+JSON.stringify([project,uid,venue,club]))||'null');return saved&&Array.isArray(saved.value?.config?.stock)&&saved.value?.venueId===venue?saved:null;}catch{return null;}
}
export function saveStockView(storage,project,uid,venue,club,value,at=Date.now()){
 if(!storage||!project||!uid||!venue||value?.venueId!==venue)return;
 // Persist only the stock projection, never borrower/contact or payment records.
 const safe={venueId:value.venueId,fieldName:value.fieldName,manager:Boolean(value.manager),captain:Boolean(value.captain),config:value.config,seasonId:value.seasonId,days:value.days||[],orders:[]};
 try{storage.setItem(prefix+JSON.stringify([project,uid,venue,club]),JSON.stringify({at,value:safe}));}catch{}
}
