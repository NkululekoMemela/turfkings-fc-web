const entries=new Map();
export const teamChatCacheKey=(uid,clubId,venueId,room)=>JSON.stringify([uid,clubId,venueId,room?.id,room?.seasonId]);
export function getTeamChatCache(key,now=Date.now()){const entry=entries.get(key);return entry&&now-entry.at<20000?entry.value:null;}
export function putTeamChatCache(key,value,now=Date.now()){entries.set(key,{value,at:now});for(const [id,entry]of entries)if(now-entry.at>20000)entries.delete(id);}

const warming=new Set();
export function beginTeamChatWarm(key){if(warming.has(key))return false;warming.add(key);return true;}
export function endTeamChatWarm(key){warming.delete(key);}
