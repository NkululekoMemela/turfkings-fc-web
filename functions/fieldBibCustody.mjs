import {kitColourKey} from './opponentKitColours.mjs';
export const bibKey=(color,number)=>`${kitColourKey(color)}:${Number(number)}`;
export function custodyItems(record={}){
 const items=new Map();(record.hirePlayers||[]).forEach((player,index)=>items.set(bibKey(player.color,player.number),{...player,index}));
 return [...items.values()].map(player=>({...player,state:record.bibStates?.[player.index]?.state||(record.hireStatus==='returned'||record.returnedPlayers?.[player.index]?'returned':'out'),until:record.bibStates?.[player.index]?.until||''}));
}
export function bibCustodySnapshot(stock=[],records=[]){
 const used=new Map(),held=[];let missing=0,kept=0,unsettledMinor=0;
 for(const record of records){for(const player of custodyItems(record)){if(['returned','lost_settled'].includes(player.state))continue;const key=bibKey(player.color,player.number);used.set(key,(used.get(key)||0)+1);held.push({...player,clubId:record.clubId,loanId:record.id});if(player.state==='missing')missing++;if(player.state==='kept')kept++;}
 for(const payment of Object.values(record.reimbursements||{}))if(payment.status!=='acknowledged')unsettledMinor+=payment.amountMinor||0;
 }
 const availableStock=stock.map(row=>({...row,quantity:Math.max(0,Number(row.quantity)-(used.get(bibKey(row.color,row.number))||0))}));
 return {availableStock,held,missing,kept,out:held.length,available:availableStock.reduce((total,row)=>total+row.quantity,0),unsettledMinor};
}
export function playerCarryPins(records=[],clubId='',matchDayId=''){
 return records.filter(record=>record.clubId===clubId).flatMap(record=>custodyItems(record).filter(player=>(player.state==='kept'||player.state==='out'&&record.matchDayId===matchDayId)).map(player=>({...player,loanId:record.id})));
}
const transactionLoans=new WeakMap();
export function readBibCustody(db,tx,venueId){
 let venues=transactionLoans.get(tx);if(!venues){venues=new Map();transactionLoans.set(tx,venues);}
 if(!venues.has(venueId))venues.set(venueId,tx.get(db.collection(`leagueVenues/${venueId}/bibLoans`)).then(snapshot=>snapshot.docs.map(doc=>({...doc.data(),id:doc.id}))));
 return venues.get(venueId);
}
