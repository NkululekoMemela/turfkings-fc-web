export function confirmsRefereeAction(value,action){
 return ['CANCEL','CONFIRM','DELETE'].includes(action)&&String(value||'').trim().toUpperCase()===action;
}
export function readyRefereeReplacements(teams=[]){
 return teams.flatMap(({teamId,label,positions={},vacancies={}})=>Object.entries(vacancies).filter(([positionId,v])=>v.dismissalRule==='two_minute'&&v.replacementAllowed&&!positions[positionId]).map(([positionId,v])=>({key:`${teamId}:${v.eventId||positionId}`,teamId,label,positionId,playerName:v.playerName})));
}
