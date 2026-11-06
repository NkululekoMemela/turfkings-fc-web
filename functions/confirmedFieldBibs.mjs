import {kitColourKey} from './opponentKitColours.mjs';
const numberOf=p=>p.personalBib?.number ?? p.jerseyNumber;
export function stockFixtureColours(home,away,stock=[]){
 const colours=new Map();
 for(const row of stock)if(Number(row.quantity)>0&&Number.isInteger(Number(row.number))&&Number(row.number)>=1&&Number(row.number)<=999){const key=kitColourKey(row.color);if(!colours.has(key))colours.set(key,{color:row.color,numbers:new Set()});colours.get(key).numbers.add(Number(row.number));}
 const options=[...colours.values()].filter(c=>c.numbers.size>=5).sort((a,b)=>b.numbers.size-a.numbers.size);
 const pick=(club,exclude)=>options.find(c=>c.color!==exclude&&[club.homeColor,club.awayColor].some(value=>value&&kitColourKey(value)===kitColourKey(c.color)))||options.find(c=>c.color!==exclude);
 const first=pick(home||{},null),second=pick(away||{},first?.color);
 return {home:first?.color||'',away:second?.color||''};
}
export function stockFixtureBibs(players,color,stock=[],pins=[]){
 const ordered=[...players].sort((a,b)=>String(a.sourcePlayerId).localeCompare(String(b.sourcePlayerId)));
 const available=[...new Set(stock.filter(row=>Number(row.quantity)>0&&Number.isInteger(Number(row.number))&&Number(row.number)>=1&&Number(row.number)<=999&&kitColourKey(row.color)===kitColourKey(color)).map(row=>Number(row.number)))].sort((a,b)=>a-b);
 const used=new Set(),kept=new Map(),carried=new Map();
 for(const p of ordered){
  const personal=p.personalBib||(!p.matchBib||p.matchBib.source==='club'?{number:p.jerseyNumber,color:p.bibColor}:null);
  if(p.ownsNumberedBib===true&&personal&&personal.number!=null&&/^\d{1,3}$/.test(String(personal.number))&&kitColourKey(personal.color)===kitColourKey(color)&&!used.has(Number(personal.number))){used.add(Number(personal.number));kept.set(p.sourcePlayerId,Number(personal.number));}
 }
 for(const p of ordered){
  const name=value=>String(value||'').trim().toLowerCase().replace(/\s+/g,' ');
  const pin=pins.find(pin=>(pin.playerId?pin.playerId===p.sourcePlayerId:name(pin.name)===name(p.fullName)&&ordered.filter(other=>name(other.fullName)===name(p.fullName)).length===1)&&kitColourKey(pin.color)===kitColourKey(color));
  if(pin&&!kept.has(p.sourcePlayerId)&&!used.has(Number(pin.number))){used.add(Number(pin.number));carried.set(p.sourcePlayerId,pin);}
 }
 return ordered.map(p=>{
  if(carried.has(p.sourcePlayerId)){const pin=carried.get(p.sourcePlayerId);return {...p,jerseyNumber:Number(pin.number),bibColor:color,kitNumberSource:'field',matchBib:{source:'hired',number:Number(pin.number),color,available:true,assigned:true,allocationSource:'field',reservationStatus:'stock_confirmed',carryLoanId:pin.loanId}};}

  if(kept.has(p.sourcePlayerId))return {...p,jerseyNumber:kept.get(p.sourcePlayerId),bibColor:color,matchBib:{source:'club',number:kept.get(p.sourcePlayerId),color,available:true}};
  const number=available.find(n=>!used.has(n));
  if(number===undefined||!color)return {...p,jerseyNumber:null,bibColor:color||'',kitNumberSource:'field',matchBib:{source:'hired',number:null,color:color||'',available:false,assigned:false,allocationSource:'field',reservationStatus:'stock_unavailable'}};
  used.add(number);
  return {...p,...(p.ownsNumberedBib===true?{personalBib:p.personalBib||{number:numberOf(p),color:p.bibColor}}:{}),jerseyNumber:number,bibColor:color,kitNumberSource:'field',matchBib:{source:'hired',number,color,available:true,assigned:true,allocationSource:'field',reservationStatus:'stock_confirmed'}};
 });
}
