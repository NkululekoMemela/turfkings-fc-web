import {buildProfileMemberResolver} from "./playerProfileInsights.mjs";
// Celebrate recorded achievements only. Bookings are not proof of attendance;
// live award contenders are not trophy winners.
export function buildPlayerProfileStory({insights={},seasons=[],members=[],memberId,awards=[]}) {
 const positive=(insights.statements||[]).filter(item=>item.tone==="achievement");
 const sporting=positive.filter(item=>["goals","assists","gkCleanSheets","defensiveBlocks"].includes(item.key)).sort((a,b)=>(a.rank||99)-(b.rank||99)).slice(0,2);
 const commitment=positive.find(item=>["attendance","recorded-attendance"].includes(item.key));
 const highlights=[...sporting,...(commitment?[commitment]:[])];
 const player=insights.player;
 const phrases=highlights.map(item=>`${item.text} · ${item.detail}`);
 if(!sporting.length && player){
  const recorded=[["goals","goals"],["assists","assists"],["gkCleanSheets","goalkeeping clean sheets"],["defensiveBlocks","defensive blocks"]].filter(([key])=>player[key]>0).slice(0,2).map(([key,label])=>`${player[key]} recorded ${label}`);
  phrases.unshift(...recorded);
 }
 if(!commitment && player?.matchDaysPresent>0)phrases.push(`${player.matchDaysPresent} confirmed match day${player.matchDaysPresent===1?"":"s"} attended`);
 if(!phrases.length && player?.gamesPlayed>0)phrases.push(`${player.gamesPlayed} recorded match appearance${player.gamesPlayed===1?"":"s"}`);
 const honours=[],seen=new Set(),resolve=buildProfileMemberResolver(members);
 const seasonById=new Map(seasons.map(season=>[String(season.seasonId||season.id||""),season]));
 const clips=[...awards,...seasons.flatMap(season=>season.profileSeasonAwards||[])];
 for(const clip of clips){
  if(!(clip.seasonWinner===true || String(clip.winnerLevel).toLowerCase()==="season" || String(clip.retentionStatus).toLowerCase()==="season_winner"))continue;
  const seasonId=String(clip.seasonId||clip.activeSeasonId||clip.matchContext?.seasonId||""),season=seasonById.get(seasonId);
  const mode=String(clip.matchType||clip.matchContext?.matchType||"").toUpperCase();
  if(!season || !["LEAGUE","FRIENDLY"].includes(mode))continue;
  const name=[clip.goalScorer,clip.goalScorerName,clip.scorer,clip.playerName,clip.player,clip.keeperName,clip.skillPlayer].find(value=>value&&!/^(pending|unknown)/i.test(String(value)));
  if(resolve(name,clip.memberId||clip.playerMemberId||clip.playerId)!==memberId)continue;
  const type=String(clip.normalizedType||clip.tag||clip.type||clip.awardKey||"").toLowerCase();
  const title=/skill/.test(type)?"Skill of the Season":/save/.test(type)?"Save of the Season":/goal|puskas/.test(type)?"Puskas Award":String(clip.awardName||"").trim();
  if(!title)continue;
  const key=`${seasonId}:${mode}:${title}`;if(seen.has(key))continue;seen.add(key);
  honours.push({key,title:`${title} winner`,season:season.label||`Season ${season.seasonNo||seasonId}`,mode:mode==="LEAGUE"?"League":"Friendly"});
 }
 return {statement:phrases.join(". ")+(phrases.length?".":""),highlights,honours};
}
