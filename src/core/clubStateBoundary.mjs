export function emptyClubState(clubId){
 if(typeof clubId!=='string'||!clubId.trim()||clubId.includes('/'))throw Error('Choose a valid Club.');
 const seasonId='season-1',now=new Date().toISOString();
 return {clubId,activeSeasonId:seasonId,seasons:[{seasonId,seasonNo:1,teams:[],fiveVFiveTeams:[],currentMatchNo:1,currentMatch:{teamAId:null,teamBId:null,standbyId:null},streaks:{},currentEvents:[],allEvents:[],results:[],matchDayHistory:[],createdAt:now,updatedAt:now}],playerPhotosByName:{},yearEndAttendance:[],updatedAt:now};
}
export function bindClubState(state,clubId){
 if(!state||typeof state!=='object')return emptyClubState(clubId);
 if(state.clubId&&state.clubId!==clubId)throw Error('Football data belongs to another Club.');
 return {...state,clubId};
}
