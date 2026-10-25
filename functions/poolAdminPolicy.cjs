function creatorUid(night){return night.createdByUid||(night.audit||[]).find(entry=>entry.action==="transferAdmin"&&entry.previousOwnerUid)?.previousOwnerUid||night.ownerUid;}
function adminIds(night){return [...new Set([creatorUid(night),night.ownerUid].filter(Boolean))];}
function isAdmin(night,uid){return adminIds(night).includes(uid);}
module.exports={creatorUid,adminIds,isAdmin};
