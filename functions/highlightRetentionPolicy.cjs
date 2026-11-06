const milliseconds=value=>{if(typeof value?.toMillis==='function')return value.toMillis();if(typeof value==='number')return value>1e12?value:NaN;return Date.parse(value||'');};
function isMemory(clip){return /throwback|memor/i.test(String([clip.source,clip.uploadSource,clip.category,clip.highlightEra].join(' ')))||clip.isThrowback===true||clip.throwback===true;}
function weeklyDeadline(clips,parent={}){
 const explicit=milliseconds(parent.weeklyVotingClosesAt||parent.weeklyVotingClosesAtISO);
 if(Number.isFinite(explicit))return explicit;
 const times=clips.filter(c=>!isMemory(c)).map(c=>milliseconds(c.matchDateISO||c.matchDate||c.createdAtMs||c.createdAtISO||c.createdAt||c.uploadedAtISO||c.uploadedAt)).filter(Number.isFinite);
 return times.length?Math.max(...times)+5*86400000:Infinity;
}
function canonicalVideoPath(path,{kind,ownerId,matchId}){
 const root=kind==='field'?'leagueVenues':'clubs';
 return typeof path==='string'&&path.startsWith(`${root}/${ownerId}/video_highlights/${matchId}/raw/`)&&!path.includes('..')&&path.split('/').length===7;
}
module.exports={isMemory,weeklyDeadline,canonicalVideoPath};
