import {buildProfileMemberResolver} from "./playerProfileInsights.mjs";
import {buildPlayerEventStats} from "./playerEventStats.js";

const list=value=>Array.isArray(value)?value:[];
const text=value=>String(value??"").trim();
function millis(value){
  if(value==null||value==="")return null;
  if(typeof value.toMillis==="function")return value.toMillis();
  if(typeof value==="object"&&Number.isFinite(value.seconds))return value.seconds*1000;
  if(typeof value==="number")return Number.isFinite(value)?value:null;
  const valueText=text(value);
  const ms=Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(valueText)?valueText+"T12:00:00+02:00":valueText);
  return Number.isFinite(ms)?ms:null;
}
function dateOf(record={}){
  for(const field of ["playedAt","endedAtISO","startedAtISO","date","kickoffAt","createdAt","timestamp","matchDayId","id"]){
    const ms=millis(record[field]);
    if(ms!==null)return new Intl.DateTimeFormat("en-CA",{
      timeZone:"Africa/Johannesburg",year:"numeric",month:"2-digit",day:"2-digit"
    }).format(ms);
  }
  return "";
}
const practice=record=>record?.isPracticeMode===true||record?.isPracticeSeason===true||
  record?.environment==="practice"||record?.dataScope?.environment==="practice"||
  /^practice/i.test(text(record?.seasonId));
const removed=record=>record?.deleted===true||record?.voided===true||
  ["deleted","cancelled","void","reversed"].includes(record?.status);

export function buildClubYearStats({state={},members=[],year,fallbackRows=[]}){
  const resolve=buildProfileMemberResolver(members);
  const rows=new Map(members.filter(member=>member.id).map(member=>[member.id,{
    id:member.id,name:member.fullName||member.shortName||"Player",
    goals:0,assists:0,cleanSheets:0,attended:0,gamesPlayed:0
  }]));
  const events=[],seenEvents=new Set(),attendance=new Map(),years=new Set([year]);
  let undated=0;
  const belongs=date=>{
    if(date)years.add(Number(date.slice(0,4)));
    return date&&Number(date.slice(0,4))===year;
  };
  function addEvents(items,seasonKey,mode,parent={}){
    if(practice(parent)||removed(parent))return;
    const parentDate=dateOf(parent);
    for(const event of list(items)){
      if(!event||practice(event)||removed(event))continue;
      const eventMode=text(event.matchType).toUpperCase();
      if(eventMode&&eventMode!==mode)continue;
      const date=dateOf(event)||parentDate;
      if(!date){undated++;continue;}
      if(!belongs(date))continue;
      const match=text(event.matchKey||event.fixtureId||parent.fixtureId||
        event.matchNo||parent.matchNo||parent.id||"");
      const identity=text(event.id)||JSON.stringify([
        event.type,event.timeSeconds,event.teamId,event.scorer,event.playerName,
        event.assist,event.role,event.blockCount
      ]);
      const key=JSON.stringify([seasonKey,mode,date,match,identity]);
      if(seenEvents.has(key))continue;
      seenEvents.add(key);
      events.push({...event,
        scorer:resolve(event.scorer,event.scorerMemberId||event.scorerId),
        assist:resolve(event.assist,event.assistMemberId||event.assistId),
        playerName:resolve(event.playerName,event.playerMemberId||event.memberId||event.playerId)
      });
    }
  }
  function addAttendance(day,mode){
    if(practice(day)||removed(day))return;
    const date=dateOf(day);
    if(!date){if(list(day.playerAppearances).length)undated++;return;}
    if(!belongs(date)||!Array.isArray(day.playerAppearances))return;
    if(!attendance.has(date))attendance.set(date,new Map());
    const entries=attendance.get(date);
    for(const entry of day.playerAppearances){
      const id=resolve(entry.playerName||entry.fullName||entry.shortName||entry.name,
        entry.memberId||entry.sourceMemberId||entry.playerId||entry.id||entry.uid);
      if(!rows.has(id))continue;
      const raw=entry.matchesPlayed??entry.gamesPlayed;
      const count=Math.max(0,Number(raw)||0);
      const recorded=entry.attended??entry.isPresent??entry.present;
      const present=recorded==null?count>0:/^(true|1|yes)$/i.test(String(recorded));
      const key=JSON.stringify([id,mode,text(day.id||day.matchDayId),text(entry.teamId||entry.teamName)]);
      const old=entries.get(key);
      entries.set(key,{id,count:Math.max(count,old?.count||0),present:present||old?.present});
    }
  }
  for(const season of list(state.seasons)){
    if(practice(season)||removed(season))continue;
    const seasonKey=text(season.seasonId||season.id);
    for(const [mode,field] of [["LEAGUE","matchDayHistory"],["FRIENDLY","friendlyMatchDayHistory"]]){
      for(const day of list(season[field])){
        addAttendance(day,mode);
        if(list(day.allEvents).length)addEvents(day.allEvents,seasonKey,mode,day);
        else for(const result of list(day.results))
          addEvents(result.events,seasonKey,mode,{...day,...result});
      }
    }
    const mode=text(season.matchType).toUpperCase();
    if(["LEAGUE","FRIENDLY"].includes(mode)){
      const results=list(season.results).filter(result=>!removed(result));
      if(results.some(result=>list(result.events).length)){
        for(const result of results)addEvents(result.events,seasonKey,mode,result);
      }else{
        for(const event of list(season.allEvents)){
          const result=results.find(result=>text(result.matchNo)===text(event.matchNo));
          addEvents([event],seasonKey,mode,result||{});
        }
      }
    }
  }
  // Match the existing attendance view's fallback only when no saved
  // appearance days are available for the requested year.
  if(!attendance.size){
    for(const row of fallbackRows){
      addAttendance({...row,id:row.matchDayId,playerAppearances:[row]},
        text(row.matchType).toUpperCase()||"LEAGUE");
    }
  }
  for(const entries of attendance.values()){
    const present=new Set();
    for(const entry of entries.values()){
      rows.get(entry.id).gamesPlayed+=entry.count;
      if(entry.present)present.add(entry.id);
    }
    for(const id of present)rows.get(id).attended++;
  }
  for(const stats of buildPlayerEventStats({events})){
    const row=rows.get(stats.name);
    if(row)for(const field of ["goals","assists","cleanSheets"])row[field]=stats[field];
  }
  const all=[...rows.values()].map(row=>({...row,totalDays:attendance.size,
    percent:attendance.size?Math.round(row.attended*100/attendance.size):null}));
  const top=field=>all.filter(row=>row[field]>0)
    .sort((a,b)=>b[field]-a[field]||a.name.localeCompare(b.name))
    .slice(0,5).map(row=>({id:row.id,name:row.name,total:row[field]}));
  return {year,years:[...years].filter(Number.isInteger).sort((a,b)=>b-a),
    attendance:all.sort((a,b)=>b.attended-a.attended||a.name.localeCompare(b.name)),
    goals:top("goals"),assists:top("assists"),cleanSheets:top("cleanSheets"),
    recordedDays:attendance.size,undated};
}
