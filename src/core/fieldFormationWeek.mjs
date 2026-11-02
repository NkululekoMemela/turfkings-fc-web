const list=value=>Array.isArray(value)?value:[];
const time=value=>typeof value?.toMillis==='function'?value.toMillis():typeof value==='number'?value:Date.parse(value||'');
export function fieldFormationWeek({season={},teamId='',now=Date.now()}){
 const fixtures=list(season.fixtures),byFixture=new Map(fixtures.map(f=>[f.id,f.matchDayId]));
 const histories=list(season.matchDayHistory);
 const days=[...new Map([...histories.map(d=>({...d,id:d.scheduledMatchDayId||d.id})),...list(season.matchDays)].map(d=>[d.id,d])).values()];
 const results=[...histories.flatMap(d=>list(d.results)),...list(season.results)];
 const dayOf=row=>byFixture.get(row?.fixtureId)||row?.matchDayId||row?._tkMatchDayId||'';
 const relevant=days.filter(d=>fixtures.some(f=>f.matchDayId===d.id&&[f.clubAId,f.clubBId].includes(teamId)));
 const uniqueResults=new Map();for(const r of results){const key=r.fixtureId||r.id;if(key&&dayOf(r))uniqueResults.set(key,r);}
 const values=[...uniqueResults.values()];
 const live=Object.values(season.liveMatches||{}).find(m=>m.status==='live'&&fixtures.some(f=>f.id===(m.fixtureId||m.id)&&[f.clubAId,f.clubBId].includes(teamId)));
 const liveDay=live?byFixture.get(live.fixtureId||live.id):'';
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 const played=relevant.filter(d=>values.some(r=>dayOf(r)===d.id&&r.status==='completed')).sort((a,b)=>b.dateLocal.localeCompare(a.dateLocal));
 const recent=played[0];
 const archived=histories.find(d=>(d.scheduledMatchDayId||d.id)===recent?.id);
 const completed=Math.max(0,...values.filter(r=>dayOf(r)===recent?.id).map(r=>time(r.completedAtMs)||0));
 const finished=completed||time(archived?.endedAtMs)||0;
 const fresh=recent&&finished>0&&now<finished+48*3600000;
 const nextStarted=relevant.find(d=>d.dateLocal<=today&&d.dateLocal>(recent?.dateLocal||'')&&d.status==='scheduled');
 const next=relevant.filter(d=>d.status==='scheduled'&&fixtures.some(f=>f.matchDayId===d.id&&[f.clubAId,f.clubBId].includes(teamId)&&f.status==='scheduled'&&!values.some(r=>r.fixtureId===f.id&&r.status==='completed'))).sort((a,b)=>a.dateLocal.localeCompare(b.dateLocal))[0];
 const selected=liveDay?relevant.find(d=>d.id===liveDay):nextStarted|| (fresh?recent:next);
 const id=selected?.id||'';
 const selectedResults=values.filter(r=>dayOf(r)===id);
 const numberDays=new Map();for(const r of values){const number=String(r.matchNo??'');if(!number)continue;const set=numberDays.get(number)||new Set();set.add(dayOf(r));numberDays.set(number,set);}
 const sources=[...list(season.allEvents),...list(season.currentEvents),...Object.values(season.liveMatches||{}).flatMap(m=>list(m.events).map(e=>({...e,fixtureId:e.fixtureId||m.fixtureId||m.id}))),...histories.filter(d=>(d.scheduledMatchDayId||d.id)===id).flatMap(d=>list(d.allEvents).map(e=>({...e,_tkMatchDayId:d.scheduledMatchDayId||d.id}))),...selectedResults.flatMap(r=>list(r.events).map(e=>({...e,fixtureId:e.fixtureId||r.fixtureId})))];
 const seen=new Set(),events=sources.filter(e=>{
  let day=dayOf(e);if(!day){const set=numberDays.get(String(e.matchNo??''));if(set?.size===1)day=[...set][0];}
  if(!id||day!==id)return false;const key=e.id||JSON.stringify([day,e.fixtureId,e.matchNo,e.timeSeconds,e.type,e.teamId,e.scorer||e.playerName,e.assist]);if(seen.has(key))return false;seen.add(key);return true;
 });
 return {matchDayId:id,dateLocal:selected?.dateLocal||'',results:selectedResults,events,isRecap:!!(id&&id===recent?.id&&!liveDay),label:selected?.dateLocal?`${id===recent?.id&&!liveDay?'Match-day recap':'Match day'} · ${selected.dateLocal}`:'Next match day',expiresAt:finished?finished+48*3600000:0};
}
