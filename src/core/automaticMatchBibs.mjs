import {kitColourKey} from "../../functions/opponentKitColours.mjs";
export function suggestMatchBibs({players,source,color,numbers={},availableNumbers=null}){
 if(!['hired','club'].includes(source))throw Error('Choose club or hired bibs.');
 if(!String(color||'').trim())throw Error('Choose the team bib colour.');
 const ids=players.map(p=>p.sourcePlayerId);
 if(new Set(ids).size!==ids.length||ids.some(id=>!id))throw Error('Check the selected players.');
 // Without supplier inventory these are suggested pack numbers, never a reservation.
 const pool=availableNumbers??[1,2,3,4,5,6];
 if(!Array.isArray(pool)||pool.some(n=>!Number.isInteger(n)||n<0||n>999)||new Set(pool).size!==pool.length)throw Error('Check available bib numbers.');
 if(source==='hired'&&pool.some(n=>n<1||n>6))throw Error('Hired bib numbers must be from 1 to 6.');
 const free=new Set(pool),assigned={},ordered=[...players].sort((a,b)=>a.sourcePlayerId.localeCompare(b.sourcePlayerId));
 const owned=ordered.filter(p=>p.ownsNumberedBib===true&&kitColourKey(p.bibColor)===kitColourKey(color)&&p.jerseyNumber!==null&&p.jerseyNumber!==undefined&&/^\d{1,3}$/.test(String(p.jerseyNumber)));
 const ownIds=new Set(owned.map(p=>p.sourcePlayerId)),used=new Set();
 for(const p of owned){const n=Number(p.jerseyNumber);if(used.has(n))throw Error('Owned bib numbers must be unique within the team.');used.add(n);assigned[p.sourcePlayerId]=n;free.delete(n);}
 const borrowed=ordered.filter(p=>!ownIds.has(p.sourcePlayerId));
 if(free.size<borrowed.length)throw Error('There are not enough distinct numbered bibs for this squad.');
 for(const player of borrowed){
  const raw=numbers[player.sourcePlayerId],preferred=raw===null||raw===undefined||raw===''?null:Number(raw);
  if(preferred!==null&&free.has(preferred)){assigned[player.sourcePlayerId]=preferred;free.delete(preferred);}
 }
 for(const player of borrowed)if(!Object.hasOwn(assigned,player.sourcePlayerId)){
  const next=free.values().next().value;assigned[player.sourcePlayerId]=next;free.delete(next);
 }
 return {numbers:assigned,assignments:Object.fromEntries(borrowed.map(p=>[p.sourcePlayerId,{source,color:String(color).trim(),number:assigned[p.sourcePlayerId]}])),inventoryConfirmed:availableNumbers!==null};
}
