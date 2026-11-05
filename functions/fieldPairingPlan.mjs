export function planFieldPairing({season,clubAId,clubBId,actorUid,now=Date.now()}) {
  if (season?.status !== 'active' || season.scheduleVersion !== 1 || !actorUid ||
      clubAId===clubBId || ![clubAId,clubBId].every(id=>season.clubIds?.includes(id)))
    throw Error('Choose two different registered tournament Clubs.');
  if(Object.values(season.liveMatches||{}).some(m=>m.status==='live')) throw Error('Finish the live match first.');
  const ended=new Set((season.matchDayHistory||[]).map(d=>d.scheduledMatchDayId||d.id));
  const day=season.matchDays?.find(d=>!ended.has(d.id));
  if(!day || day.status!=='scheduled') throw Error('There is no open match day.');
  const fixtures=structuredClone(season.fixtures||[]);
  const current=fixtures.filter(f=>f.matchDayId===day.id);
  const available=f=>f.status==='scheduled'&&!season.liveMatches?.[f.id]&&day.fixtureIds?.includes(f.id);
  if(current.some(f=>!available(f)&&[f.clubAId,f.clubBId].some(id=>[clubAId,clubBId].includes(id))))
    throw Error('A selected Club has already played or started its match today.');
  let fixture=current.find(f=>available(f)&&[f.clubAId,f.clubBId].includes(clubAId)&&[f.clubAId,f.clubBId].includes(clubBId));
  if(!fixture) {
    const first=current.find(f=>available(f)&&[f.clubAId,f.clubBId].includes(clubAId));
    const second=current.find(f=>available(f)&&[f.clubAId,f.clubBId].includes(clubBId));
    fixture=first||second||current.find(f=>available(f)&&f.id===season.selectedFixtureId)||current.find(available);
    if(!fixture) throw Error('There is no unplayed fixture to change today.');
    if(first&&second&&first!==second) {
      const a=[first.clubAId,first.clubBId].find(id=>id!==clubAId);
      const b=[second.clubAId,second.clubBId].find(id=>id!==clubBId);
      second.clubAId=a;second.clubBId=b;
    }
    fixture.clubAId=clubAId;fixture.clubBId=clubBId;
  }
  const changes=[];
  for(const f of fixtures) {
    const old=season.fixtures.find(x=>x.id===f.id);
    if(f.clubAId===old.clubAId&&f.clubBId===old.clubBId)continue;
    f.clubAName=season.invitations?.[f.clubAId]?.clubName||f.clubAId;
    f.clubBName=season.invitations?.[f.clubBId]?.clubName||f.clubBId;
    f.pairingChangedByUid=actorUid;f.pairingChangedAtMs=now;
    changes.push({fixtureId:f.id,before:{clubAId:old.clubAId,clubBId:old.clubBId},after:{clubAId:f.clubAId,clubBId:f.clubBId}});
  }
  const ids=fixtures.filter(f=>f.matchDayId===day.id).flatMap(f=>[f.clubAId,f.clubBId]);
  if(new Set(ids).size!==ids.length)throw Error('This pairing would schedule a Club twice today.');
  return {fixtures,fixture,fixtureIndex:fixtures.findIndex(f=>f.id===fixture.id),matchDayIndex:season.matchDays.findIndex(d=>d.id===day.id),changes};
}
