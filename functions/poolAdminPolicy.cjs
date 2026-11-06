function creatorUid(night){return night.createdByUid||(night.audit||[]).find(entry=>entry.action==="transferAdmin"&&entry.previousOwnerUid)?.previousOwnerUid||night.ownerUid;}
function adminIds(night){return [...new Set([creatorUid(night),night.ownerUid,night.superAdminUid].filter(Boolean))];}
function isAdmin(night,uid){return adminIds(night).includes(uid);}
function isPlatformSuperAdmin(user){return Boolean(user?.uid&&user.email_verified===true&&!user.cameraSession&&String(user.email||" ").trim().toLowerCase()==="nkululekolerato@gmail.com");}
module.exports={creatorUid,adminIds,isAdmin,isPlatformSuperAdmin};
