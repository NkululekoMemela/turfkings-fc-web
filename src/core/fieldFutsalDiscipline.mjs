// FIFA Futsal Laws 3 and 12, 2025/26. A release permits a different
// substitute to enter with the official's authorisation; it never restores
// the dismissed player. Recorded on-court counts avoid assuming a vacant
// place has actually been filled when a previous penalty expires.
export function futsalCardDecision(type, yellowCount, dismissed=false) {
 if(dismissed)return null;
 const secondCaution=type==='yellow_card'&&yellowCount>0;
 return {type:type==='red_card'||secondCaution?'red_card':'yellow_card',secondCaution};
}
export function futsalReductions({events=[],teamIds=[],nowSeconds=0}) {
 const penalties=[];
 const ordered=events.map((e,index)=>({...e,_index:index})).sort((a,b)=>Number(a.timeSeconds||0)-Number(b.timeSeconds||0)||a._index-b._index);
 for(const e of ordered){
  const t=Number(e.timeSeconds)||0;if(t>nowSeconds)continue;
  if(e.type==='red_card'&&!e.wasSubstitute&&(e.removedPositionId||e.positionId)){
   penalties.push({id:e.id,teamId:e.teamId,positionId:e.removedPositionId||e.positionId,startsAt:t,endsAt:e.dismissalRule==='two_minute'?t+120:Infinity,releasedByGoal:null});
  }
  if(e.type!=='goal')continue;
  const scoring=e.teamId,other=teamIds.find(id=>id!==scoring);
  if(!other||!teamIds.includes(scoring))continue;
  // Legacy goals without on-court counts are left for referee review.
  const greater=Number(e.onFieldCounts?.[scoring]),fewer=Number(e.onFieldCounts?.[other]);
  const permitted=(greater===5&&(fewer===4||fewer===3))||(greater===4&&fewer===3);
  if(!permitted)continue;
  const pending=penalties.find(p=>p.teamId===other&&p.endsAt>t&&p.startsAt<=t&&p.endsAt!==Infinity&&p.releasedByGoal===null);
  if(pending){pending.endsAt=t;pending.releasedByGoal=e.id;}
 }
 return Object.fromEntries(penalties.map(p=>[p.id,{...p,remainingSeconds:Number.isFinite(p.endsAt)?Math.max(0,p.endsAt-nowSeconds):null,replacementAllowed:Number.isFinite(p.endsAt)&&nowSeconds>=p.endsAt}]));
}
export function compactRefereeName(name, peers=[]) {
 const parts=String(name||'').trim().split(/\s+/),first=parts[0]||'Player';
 const same=peers.filter(other=>String(other).trim().split(/\s+/)[0].toLowerCase()===first.toLowerCase());
 return same.length>1&&parts.length>1?`${first} ${parts.at(-1)[0]}.`:first;
}

export function futsalMustAbandon(onCourtBefore, wasSubstitute=false) {
 return !wasSubstitute && Number(onCourtBefore)-1<3;
}
