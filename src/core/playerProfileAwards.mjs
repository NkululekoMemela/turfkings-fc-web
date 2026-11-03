import {buildProfileMemberResolver} from "./playerProfileInsights.mjs";
export function buildFinalProfileVideoAwards({seasonId,clips=[],members=[],countsByClip={}}) {
  const resolve=buildProfileMemberResolver(members), seen=new Set(),eligible=[];
  for(const clip of clips){
    const id=String(clip.clipId || clip.id || ""),matchId=String(clip.matchId || "");
    if(!id||!matchId||id.includes('/')||matchId.includes('/')||seen.has(`${matchId}/${id}`))continue;
    seen.add(`${matchId}/${id}`);
    if(String(clip.seasonId || clip.activeSeasonId || clip.matchContext?.seasonId || "")!==String(seasonId))continue;
    if(String(clip.matchType || clip.matchContext?.matchType || "").toUpperCase()!=="LEAGUE")continue;
    if(clip.isThrowback===true||["pending","rejected"].includes(String(clip.status || "").toLowerCase()))continue;
    const raw=String(clip.normalizedType || clip.tag || clip.type || "").toLowerCase();
    const category=raw.includes('skill')?'skill':raw.includes('save')?'save':raw.includes('goal')?'goal':null;
    const playerName=[clip.goalScorer,clip.goalScorerName,clip.scorer,clip.playerName,clip.player,clip.keeperName,clip.skillPlayer].find(value=>value&&!/^(pending|unknown)/i.test(String(value))) || "";
    const memberId=resolve(playerName,clip.playerMemberId || clip.memberId || clip.playerId);
    const votes=Math.max(0,...[countsByClip[id],clip.seasonVote,clip.seasonVoteCount,clip.voteCount,clip.votes,clip.weeklyVoteCount].map(value=>Number(value)||0));
    if(category&&memberId&&votes>0)eligible.push({clipId:id,matchId,category,playerName,playerMemberId:memberId,voteCount:votes});
  }
  return ['goal','skill','save'].flatMap(category=>{
    const options=eligible.filter(clip=>clip.category===category);const maximum=Math.max(0,...options.map(clip=>clip.voteCount));
    return options.filter(clip=>clip.voteCount===maximum&&maximum>0).map(clip=>({...clip,
      seasonId,matchType:'LEAGUE',seasonWinner:true,winnerLevel:'season',normalizedType:category,
      awardName:category==='goal'?'Puskas Award':category==='skill'?'Skill of the Season':'Save of the Season',
      jointWinner:options.filter(item=>item.voteCount===maximum).length>1,
    }));
  });
}
