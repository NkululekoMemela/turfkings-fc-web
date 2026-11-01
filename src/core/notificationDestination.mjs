const valid=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,150}$/.test(value);
export function notificationDestination(data={}){
 if(['club_story','club_poll'].includes(data.type)||['club-story','club-poll'].includes(data.route)){
  const id=data.storyId||data.pollId;
  return valid(data.clubId)&&valid(id)?{kind:'news',clubId:data.clubId,storyId:data.storyId||'',pollId:data.pollId||''}:null;
 }
 if(['match_day_cancelled','match_ticket_available'].includes(data.type))return valid(data.clubId)?{kind:'ticket',clubId:data.clubId,creditId:valid(data.creditId)?data.creditId:'',matchDayId:valid(data.matchDayId)?data.matchDayId:''}:null;
 return null;
}
export function selectNotificationCredit(credits,request){
 if(!request)return null;
 if(request.creditId)return credits.find(c=>c.id===request.creditId)||null;
 if(request.matchDayId)return credits.find(c=>c.sourceWeekId===request.matchDayId&&c.sourceType==='match_cancelled')||null;
 return null;
}
