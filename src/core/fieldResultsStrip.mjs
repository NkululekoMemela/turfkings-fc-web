const score=value=>value!==null&&value!==undefined&&String(value).trim()!==""&&Number.isInteger(Number(value))&&Number(value)>=0?Number(value):null;
export function fieldRecentResults(season){
 const fixtures=new Map((season?.fixtures||[]).map(f=>[String(f.id),f]));
 const days=new Map((season?.matchDays||[]).map(d=>[String(d.id),d]));
 const records=new Map();
 const add=(result,day={})=>{
  const key=String(result?.fixtureId||result?.id|| (result?.matchNo?`match:${result.matchNo}`:""));
  if(!key)return;
  records.set(key,{result,day});
 };
 for(const day of season?.matchDayHistory||[])for(const result of day.results||[])add(result,day);
 for(const result of season?.results||[])add(result);
 return [...records].flatMap(([id,{result,day}])=>{
  const fixture=fixtures.get(String(result.fixtureId||result.id))||{};
  const goalsA=score(result.goalsA),goalsB=score(result.goalsB);
  if(result.status!=="completed"||goalsA===null||goalsB===null||season?.liveMatches?.[fixture.id||id]?.status==="live")return [];
  const teamAId=result.teamAId||fixture.clubAId,teamBId=result.teamBId||fixture.clubBId;
  if(!teamAId||!teamBId)return [];
  const matchDay=days.get(String(fixture.matchDayId||result.matchDayId))||day;
  const scheduledLocal=String(fixture.scheduledLocal||result.scheduledLocal||matchDay.dateLocal||"");
  return [{id,teamAId,teamBId,goalsA,goalsB,teamAName:result.teamAName||fixture.clubAName||season?.invitations?.[teamAId]?.clubName||teamAId,teamBName:result.teamBName||fixture.clubBName||season?.invitations?.[teamBId]?.clubName||teamBId,dateLocal:scheduledLocal.slice(0,10),sort:scheduledLocal,matchNo:Number(result.matchNo)||0}];
 }).sort((a,b)=>b.sort.localeCompare(a.sort)||b.matchNo-a.matchNo);
}
