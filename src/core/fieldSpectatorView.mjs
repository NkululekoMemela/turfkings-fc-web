const list=x=>Array.isArray(x)?x:[];
const stamp=x=>typeof x?.toMillis==='function'?x.toMillis():typeof x==='number'?x:Date.parse(x||'');
const scheduledAt=value=>stamp(value?(String(value).match(/[zZ]|[+-]\d\d:\d\d$/)?value:value+'+02:00'):'');
export function fieldSpectatorView({season={},live=null,now=Date.now()}) {
 if(live?.status==='live'&&!live.isFinished)return {kind:'live',match:live};
 season=season||{};
 const fixtures=list(season.fixtures),results=[...list(season.matchDayHistory).flatMap(d=>list(d.results)),...list(season.results)];
 const unique=[...new Map(results.map((r,i)=>[r.fixtureId||r.id||`row-${i}`,r])).values()].filter(r=>r.status==='completed');
 const at=r=>stamp(r.completedAtMs||r.completedAt||r.endedAtMs)||scheduledAt(fixtures.find(f=>f.id===r.fixtureId)?.scheduledLocal)||0;
 const last=unique.sort((a,b)=>at(b)-at(a))[0]||(live?.status==='completed'?live:null);
 const next=fixtures.filter(f=>f.status==='scheduled').map(f=>({...f,atMs:stamp(f.scheduledLocal?(f.scheduledLocal.match(/[zZ]|[+-]\d\d:\d\d$/)?f.scheduledLocal:f.scheduledLocal+'+02:00'):'')})).filter(f=>f.atMs>=now).sort((a,b)=>a.atMs-b.atMs)[0];
 if(next&&(!last||next.atMs-now<Math.abs(now-at(last))))return {kind:'upcoming',match:next};
 if(last)return {kind:'result',match:last};
 return {kind:next?'upcoming':'empty',match:next||null};
}
export function fieldSpectatorScore(match={}){
 const a=String(match.teamAId||match.clubAId||match.currentMatch?.teamAId||match.currentMatch?.clubAId||''),b=String(match.teamBId||match.clubBId||match.currentMatch?.teamBId||match.currentMatch?.clubBId||'');
 const events=Array.isArray(match.currentEvents)?match.currentEvents:Array.isArray(match.events)?match.events:[];
 const final=match.finalSummary||match;
 return {a,b,events,goalsA:match.status==='completed'||match.isFinished?Number(final.goalsA)||0:events.filter(e=>e.type==='goal'&&String(e.teamId)===a).length,goalsB:match.status==='completed'||match.isFinished?Number(final.goalsB)||0:events.filter(e=>e.type==='goal'&&String(e.teamId)===b).length};
}
