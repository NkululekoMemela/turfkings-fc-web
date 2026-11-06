import {kitColourKey} from '../../functions/opponentKitColours.mjs';
export {kitColourKey};
export const bibColourOf=club=>club?.matchColour||(club?.players||[]).map(p=>p.matchBib?.color||p.bibColor||p.bibColour).find(Boolean)||'';
export function bibStockRows(stock=[]){
 const colours=new Map();
 for(const row of stock){const key=kitColourKey(row.color);if(!colours.has(key))colours.set(key,{color:row.color,numbers:{},total:0});const group=colours.get(key),quantity=Number(row.quantity)||0;group.numbers[row.number]=(group.numbers[row.number]||0)+quantity;group.total+=quantity;}
 return [...colours.values()];
}
export function nextBibAssignments(clubs=[],stock=null,confirmed=false){
 return clubs.filter(c=>c.status!=='bye').map(c=>{
  const players=c.players||[];
  const supplied=p=>p.matchBib?.source==='club'||confirmed&&stock?.some(row=>Number(row.quantity)>0&&kitColourKey(row.color)===kitColourKey(p.matchBib?.color||p.bibColor)&&Number(row.number)===Number(p.matchBib?.number??p.jerseyNumber));
  const ready=stock===null||players.length>=5&&players.every(supplied);
  const numbers=[...new Set(players.filter(p=>stock===null||supplied(p)).map(p=>p.matchBib?.number??p.jerseyNumber).filter(n=>n!==null&&n!==undefined))].sort((a,b)=>a-b);
  return {clubId:c.clubId,name:c.name||c.clubName||c.clubId,color:stock!==null&&!ready?'':bibColourOf(c),numbers:ready?numbers:[],ready};
 });
}

export function bibPackAudit(stock=[]){
 return bibStockRows(stock).map(row=>{const target=Math.max(6,Math.ceil(row.total/6)*6);return {...row,target,missing:target-row.total,complete:row.total>0&&row.total%6===0};});
}
