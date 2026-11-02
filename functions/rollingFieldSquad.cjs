const array=value=>Array.isArray(value)?value:[];
function carriedMemberIds({season,squad,day,clubId,candidates}) {
 const resolve=ids=>{
  if(ids.length<5||ids.length>6)return null;
  const mapped=ids.map(id=>candidates.find(p=>p.memberId===id)||candidates.find(p=>p.originalMemberId===id)).filter(Boolean);
  return mapped.length>=5&&mapped.length<=6&&mapped.every(Boolean)&&new Set(mapped.map(p=>p.memberId)).size===mapped.length?mapped.map(p=>p.memberId):null;
 };
 const previous=array(season.matchDays).filter(d=>d.dateLocal<day.dateLocal).sort((a,b)=>b.dateLocal.localeCompare(a.dateLocal));
 const results=[...array(season.results),...array(season.matchDayHistory).flatMap(d=>array(d.results))];
 for(const old of previous){
  const saved=resolve(array(squad?.matchDaySubmissions?.[old.id]?.memberIds));if(saved)return saved;
  const fixtureIds=new Set(array(season.fixtures).filter(f=>f.matchDayId===old.id&&[f.clubAId,f.clubBId].includes(clubId)).map(f=>f.id));
  const result=results.find(r=>r.status==='completed'&&fixtureIds.has(r.fixtureId));
  const kit=array(result?.confirmedLineupSnapshot?.[clubId]?.kitNumbers);
  const selected=kit.map(row=>candidates.find(p=>[p.sourcePlayerId,`${clubId}::${p.sourcePlayerId}`].includes(row.key))?.memberId).filter(Boolean);
  const played=resolve(selected);if(played)return played;
 }
 return candidates.length<=6?candidates.map(p=>p.memberId):[];
}
function liveDayRoster({live,season,matchDayId,clubId}) {
 const fixture=array(season.fixtures).find(f=>f.id===live?.fixtureId&&f.matchDayId===matchDayId);
 if(!fixture||!['live','completed'].includes(live?.status)||live.seasonId!==season.id||![fixture.clubAId,fixture.clubBId].includes(clubId))return null;
 const players=live.paidSquads?.[clubId];if(!Array.isArray(players)||!players.length)return null;
 return {matchDayId,fixtureId:fixture.id,players,selectedMemberIds:players.map(p=>p.memberId),ready:true,confirmed:true,canManageFormation:false,rosterSource:live.status==='live'?'live_match':'completed_match',kitNumbers:Object.fromEntries(players.map(p=>[p.sourcePlayerId,p.jerseyNumber??null])),status:live.status==='live'?'live_match':'completed'};
}
function completedDayRoster({season,fixture,clubId}) {
 if(fixture.status!=='completed')return null;
 const results=[...array(season.results),...array(season.matchDayHistory).flatMap(day=>array(day.results))];
 const result=results.find(r=>r.fixtureId===fixture.id&&r.status==='completed');
 const players=array(result?.confirmedLineupSnapshot?.[clubId]?.kitNumbers).flatMap(row=>{
  const id=String(row.key||'').replace(`${clubId}::`,'');
  return /^[A-Za-z0-9_-]{1,150}$/.test(id)&&row.name?[{id:`${clubId}::${id}`,playerId:`${clubId}::${id}`,sourcePlayerId:id,fullName:row.name,jerseyNumber:row.number??null,clubId,status:'active'}]:[];
 });
 return {matchDayId:fixture.matchDayId,fixtureId:fixture.id,players,ready:players.length>0,confirmed:players.length>0,canManageFormation:false,rosterSource:'completed_match',status:'completed'};
}
module.exports={carriedMemberIds,liveDayRoster,completedDayRoster};
