const norm=value=>String(value||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
const array=value=>Array.isArray(value)?value:[];
function tacticsMembers({season,clubId,squad,members}) {
 const active=members.filter(m=>m.status==='active'&&m.playerId);
 const entries=squad?.status==='active'?Object.entries(squad.entries||{}).filter(([id,e])=>e.invitationStatus==='accepted'&&active.some(m=>m.id===id&&m.playerId===e.sourcePlayerId)):[];
 const day=array(season.matchDays).find(d=>d.status==='scheduled'&&array(season.fixtures).some(f=>f.matchDayId===d.id&&[f.clubAId,f.clubBId].includes(clubId)));
 const replacements=squad?.matchDayReplacements?.[day?.id]||{};
 const candidates=entries.map(([id,e])=>{
  const cover=replacements[id];
  return squad?.matchDayAvailability?.[day?.id]?.[id]?.status==='unavailable'&&cover?.invitationStatus==='accepted'&&cover.originalMemberId===id&&active.some(m=>m.id===cover.memberId&&m.playerId===cover.sourcePlayerId)?[cover.memberId,cover]:[id,e];
 });
 const selected=array(squad?.matchDaySubmissions?.[day?.id]?.memberIds);
 const selectedIds=new Set(selected.length>=5&&selected.length<=6&&new Set(selected).size===selected.length?selected:candidates.length<=6?candidates.map(([id])=>id):[]);
 const admitted=new Set(candidates.filter(([id])=>selectedIds.has(id)).map(([id])=>id));
 const results=[...array(season.results),...array(season.matchDayHistory).flatMap(day=>array(day.results))];
 for(const result of results){
  if(result.status!=='completed'||![result.clubAId||result.teamAId,result.clubBId||result.teamBId].includes(clubId))continue;
  const snapshots=[result.confirmedLineupSnapshot,...array(result.lineupTimeline).map(item=>item.snapshots)];
  for(const snapshotsByTeam of snapshots){
   const snapshot=snapshotsByTeam?.[clubId];if(!snapshot)continue;
   for(const raw of Object.values(snapshot.positions||{})){
    if(!raw)continue;
    const rows=array(snapshot.kitNumbers).filter(row=>[row.key,row.name,...array(row.aliases)].some(value=>norm(value)===norm(raw)));
    const stable=rows.length===1?String(rows[0].key||'').replace(`${clubId}::`,''):null;
    const matches=active.filter(m=>stable?m.playerId===stable:[m.fullName,m.displayName,m.name].some(value=>value&&norm(value)===norm(raw)));
    if(matches.length===1)admitted.add(matches[0].id);
   }
  }
 }
 return members.filter(m=>m.status==='active'&&admitted.has(m.id));
}
module.exports={tacticsMembers};
