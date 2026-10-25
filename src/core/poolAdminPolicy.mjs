export function creatorUid(night){return night.createdByUid||(night.audit||[]).find(entry=>entry.action==='transferAdmin'&&entry.previousOwnerUid)?.previousOwnerUid||night.ownerUid;}
export function adminIds(night){return [...new Set([creatorUid(night),night.ownerUid].filter(Boolean))];}
export function isAdmin(night,uid){return adminIds(night).includes(uid);}
export function clearSevenZero(game){return !game.blackFoul&&!game.blackBall&&((game.scoreA===7&&game.scoreB===0)||(game.scoreB===7&&game.scoreA===0));}
