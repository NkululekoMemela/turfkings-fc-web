const milliseconds=value=>typeof value?.toMillis==='function'?value.toMillis():typeof value==='number'?(value>1e12?value:NaN):Date.parse(value||'');
const memory=clip=>/throwback|memor/i.test(String([clip.source,clip.uploadSource,clip.category,clip.highlightEra].join(' ')))||clip.isThrowback===true||clip.throwback===true;
// Mirrors the server retention policy: a deadline belongs to one match document.
export function matchVotingDeadline(clips=[],parent={}){
 const explicit=milliseconds(parent.weeklyVotingClosesAt||parent.weeklyVotingClosesAtISO);if(Number.isFinite(explicit))return explicit;
 const times=clips.filter(clip=>!memory(clip)).map(clip=>milliseconds(clip.matchDateISO||clip.matchDate||clip.createdAtMs||clip.createdAtISO||clip.createdAt||clip.uploadedAtISO||clip.uploadedAt)).filter(Number.isFinite);
 return times.length?Math.max(...times)+5*86400000:Infinity;
}
export function matchVotingLabel(deadline,now=Date.now(),closed=false){
 if(closed||deadline<=now)return 'Match voting closed';
 if(!Number.isFinite(deadline))return 'Voting time not set';
 const minutes=Math.ceil((deadline-now)/60000),days=Math.floor(minutes/1440),hours=Math.floor(minutes%1440/60);
 return `Voting · ${days?`${days}d ${hours}h`:hours?`${hours}h ${minutes%60}m`:`${minutes}m`} left`;
}
