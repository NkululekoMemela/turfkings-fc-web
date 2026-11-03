import {teamChatCacheKey,putTeamChatCache} from './teamChatCache.mjs';
const rooms=new Map(),pending=new Map();
export const teamRoomCacheKey=(uid,clubId,venueId='')=>JSON.stringify([uid,clubId,venueId]);
export function cachedTeamRooms(key,now=Date.now()){const value=rooms.get(key);return value&&now-value.at<20000?value.result:null;}
export async function preloadTeamChat({uid,clubId,venueId='',request,now=Date.now()}){
 const key=teamRoomCacheKey(uid,clubId,venueId);
 if(pending.has(key))return pending.get(key);
 const task=(async()=>{
  try{const result=await request({action:'rooms',clubId,venueId});rooms.set(key,{result,at:now});
   await Promise.all((result.rooms||[]).map(async room=>{try{const data=await request({action:'messages',clubId,venueId,teamId:room.id,seasonId:room.seasonId,markRead:false});putTeamChatCache(teamChatCacheKey(uid,clubId,venueId,room),data);}catch{/* Every foreground read still revalidates access. */}}));
   return result;
  }catch(error){rooms.delete(key);throw error;}finally{pending.delete(key);}
 })();pending.set(key,task);return task;
}
