import {kitColourKey} from './opponentKitColours.mjs';
const valid=value=>typeof value==='string'&&/^(#[0-9a-f]{6}|[a-z][a-z ]{0,30})$/i.test(value.trim());
export function fixtureColours(home={},away={}){
 const options=club=>[...new Set([club.homeColor,club.awayColor].filter(valid).map(s=>s.trim()))];
 const a=options(home),b=options(away);
 const homeChoices=a.length?a:['Blue','Orange'];
 const awayChoices=b.length?[...b].reverse():['Orange','Blue'];
 for(const first of homeChoices)for(const second of awayChoices)if(kitColourKey(first)!==kitColourKey(second))return {home:first,away:second};
 // Field-assigned match bibs keep play possible when saved Club colours clash.
 const first=homeChoices[0];
 return {home:first,away:kitColourKey(first)===kitColourKey('Orange')?'Blue':'Orange'};
}
export function automaticFixtureBibs(players,color){
 const ordered=[...players].sort((a,b)=>a.sourcePlayerId.localeCompare(b.sourcePlayerId)),used=new Set(),kept=new Set();
 for(const p of ordered){const raw=p.jerseyNumber,n=Number(raw);if(p.ownsNumberedBib===true&&raw!==null&&raw!==undefined&&/^\d{1,3}$/.test(String(raw))&&kitColourKey(p.bibColor)===kitColourKey(color)&&!used.has(n)){used.add(n);kept.add(p.sourcePlayerId);}}
 const free=[1,2,3,4,5,6].filter(n=>!used.has(n));
 return ordered.map(p=>{
  if(kept.has(p.sourcePlayerId))return {...p,bibColor:color};
  const number=free.shift();if(number===undefined)return {...p,jerseyNumber:null,bibColor:color};
  return {...p,...(p.ownsNumberedBib===true?{personalBib:p.personalBib||{number:p.jerseyNumber,color:p.bibColor}}:{}),jerseyNumber:number,bibColor:color,kitNumberSource:'field',matchBib:{source:'hired',number,color,assigned:true,allocationSource:'field',reservationStatus:'not_reserved'}};
 });
}
