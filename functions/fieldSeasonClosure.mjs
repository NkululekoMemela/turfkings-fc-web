import {buildVenueLeagueStandings} from "./venueLeagueStandings.mjs";

export function fieldSeasonClosureSummary(season) {
  const saved=new Map();
  for(const result of [...(season?.matchDayHistory||[]).flatMap(day=>day.results||[]),...(season?.results||[])]) {
    const id=result.fixtureId||result.id;
    if(id && !["cancelled","live","scheduled","postponed"].includes(result.status))saved.set(id,result);
  }
  const fixtures=Array.isArray(season?.fixtures)?season.fixtures:[];
  const completed=fixtures.filter(fixture=>fixture.status==="completed" && saved.has(fixture.id));
  const outstanding=fixtures.filter(fixture=>!completed.some(done=>done.id===fixture.id));
  const results=completed.map(fixture=>({...saved.get(fixture.id),
    clubAId:fixture.clubAId,clubBId:fixture.clubBId}));
  const names=new Map();
  for(const fixture of fixtures){
    names.set(fixture.clubAId,fixture.clubAName||season?.invitations?.[fixture.clubAId]?.clubName||fixture.clubAId);
    names.set(fixture.clubBId,fixture.clubBName||season?.invitations?.[fixture.clubBId]?.clubName||fixture.clubBId);
  }
  const clubs=(season?.clubIds||[]).map(id=>({id,name:names.get(id)||season?.invitations?.[id]?.clubName||id}));
  const standings=buildVenueLeagueStandings({clubs,results});
  const leader=standings.find(row=>row.played>0)||null;
  const tied=leader?standings.filter(row=>row.points===leader.points&&row.goalDifference===leader.goalDifference&&row.goalsFor===leader.goalsFor):[];
  const winner=outstanding.length===0&&completed.length>0&&tied.length===1?leader:null;
  return {total:fixtures.length,completed:completed.length,outstanding,
    standings,leader,winner,tied:tied.length>1?tied:[],premature:outstanding.length>0};
}

export function fieldSeasonCelebration({season,venueName,endedAtMs=Date.now()}) {
  const summary=fieldSeasonClosureSummary(season);
  return {seasonId:season.id,seasonName:season.name||"Field League",venueName:venueName||"Field",
    endedAtMs,premature:summary.premature,total:summary.total,completed:summary.completed,
    winner:summary.winner?{id:summary.winner.id,name:summary.winner.name,points:summary.winner.points}:null,
    leader:summary.leader?{id:summary.leader.id,name:summary.leader.name,points:summary.leader.points}:null,
    tied:summary.tied.map(row=>({id:row.id,name:row.name})),podium:summary.standings.slice(0,3).map(row=>({
      id:row.id,name:row.name,points:row.points,played:row.played,goalDifference:row.goalDifference,
    }))};
}
