import {buildFieldMatchReport} from './fieldMatchReport.mjs';
import {resolvePlayerPortrait} from './playerPortrait.mjs';
const norm=value=>String(value||'').trim().toLowerCase().replace(/\s+/g,' ');
// Confirmed appearances are the membership boundary. A Club's full roster is
// used for portraits only and must never add unrelated players to Field cards.
export function buildFieldPlayerCards({season={},clubs=[],profiles=[],photos={},logos={}}={}){
 const results=new Map();
 for(const result of [...(season?.matchDayHistory||[]).flatMap(day=>day.results||[]),...(season?.results||[])]){
  const id=result.fixtureId||result.id;
  if(id&&result.status==='completed')results.set(id,result);
 }
 const cards=new Map();
 for(const id of results.keys()){
  const report=buildFieldMatchReport({season,resultId:id});
  for(const side of report?.sides||[]){
   for(const player of [...side.players,...side.bench]){
    const key=`${side.clubId}::${norm(player.name)}`;
    let card=cards.get(key);
    if(!card){
     const club=clubs.find(c=>c.id===side.clubId);
     card={id:key,name:player.name,displayName:player.name,shortName:player.name,teamName:club?.name||side.name,teamBadgeUrl:logos[side.clubId]||club?.logoUrl||'',photoUrl:player.photoData||resolvePlayerPortrait(player.name,profiles.filter(p=>p.clubId===side.clubId),photos[side.clubId]||{}),goals:0,assists:0,gkCleanSheets:0,defCleanSheets:0,defensiveBlocks:0,points:0,gamesPlayed:0,matchDaysPresent:0,statsScore10:0,formScore10:null,peerScore10:null,attackAvg:null,defenceAvg:null,playmakingAvg:null,gkAvg:null,overall:0,styleLabel:'Match performance',championshipStars:0,honorBadges:[],ratings:[]};
     cards.set(key,card);
    }
    card.gamesPlayed++;
    const decor=player.decor;
    for(const field of ['goals','assists','gkCleanSheets','defCleanSheets','defensiveBlocks'])card[field]+=Number(decor?.stats?.[field]||0);
    if(Number.isFinite(decor?.rating))card.ratings.push(decor.rating);
   }
  }
 }
 return [...cards.values()].map(({ratings,...card})=>{
  const average=values=>values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length*10)/10:0;
  return {...card,overall:average(ratings),statsScore10:average(ratings),formScore10:ratings.length?average(ratings.slice(-5)):null,points:card.goals+card.assists+card.defensiveBlocks};
 }).sort((a,b)=>b.overall-a.overall||a.displayName.localeCompare(b.displayName));
}
