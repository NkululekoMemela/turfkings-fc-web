const norm=value=>String(value||'').trim().toLowerCase().replace(/\s+/g,' ');
const list=value=>Array.isArray(value)?value:[];
function clubDebutNames(data={}){
 const found=new Map();
 const add=value=>{const name=typeof value==='string'?value:value?.playerName||value?.fullName||value?.name||value?.displayName; if(norm(name))found.set(norm(name),String(name).trim());};
 const visit=(node,depth=0)=>{
  if(!node||typeof node!=='object'||depth>12)return;
  // Actual appearance records, not booking or squad selections.
  for(const entry of list(node.playerAppearances))if(Number(entry.matchesPlayed||entry.gamesPlayed||0)>0)add(entry);
  // Completed matches with captured starting lineups also prove a debut.
  if(node.status==='completed')for(const side of Object.values(node.confirmedLineupSnapshot||{}))for(const name of Object.values(side?.positions||{}))add(name);
  for(const [key,value]of Object.entries(node))if(key!=='playerAppearances'&&value&&typeof value==='object'){
   if(Array.isArray(value))for(const child of value)visit(child,depth+1);else visit(value,depth+1);
  }
 };
 visit(data);return [...found.values()];
}
function fieldDebuts(season={}){
 const output=new Map();
 for(const result of [...list(season.matchDayHistory).flatMap(day=>list(day.results)),...list(season.results)]){
  if(result.status!=='completed')continue;
  for(const clubId of [result.teamAId,result.teamBId].filter(Boolean)){
   const side=result.confirmedLineupSnapshot?.[clubId];
   const names=new Set(Object.values(side?.positions||{}).filter(name=>typeof name==='string'&&norm(name)));
   // Scoring/discipline events establish involvement even on old matches
   // that did not capture a lineup. Explicit guests remain excluded.
   for(const event of list(result.events).filter(e=>e.teamId===clubId)){
    if(event.scorer&&event.scorerType!=='guest')names.add(event.scorer);
    if(event.assist&&event.assistType!=='guest')names.add(event.assist);
    if(event.playerName&&event.playerType!=='guest')names.add(event.playerName);
   }
   for(const name of names)output.set(`${clubId}::${norm(name)}`,{clubId,name});
  }
 }
 return [...output.values()];
}
function missingBaselinePlayers({players=[],debutNames=[],baselines={},resolveName=value=>value}={}){
 const debuted=new Set(debutNames.map(name=>norm(resolveName(name))));
 return players.filter(player=>{
  const key=norm(resolveName(player.name));
  const baseline=baselines[key];
  return debuted.has(key)&&!['attack','defence','playmaking','gk'].some(attr=>Number(baseline?.[attr]||0)>0);
 });
}
export {clubDebutNames,fieldDebuts,missingBaselinePlayers};
