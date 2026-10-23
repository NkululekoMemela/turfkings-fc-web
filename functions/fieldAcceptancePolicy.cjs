const safe=value=>typeof value==="string"&&/^[A-Za-z0-9_-]{1,150}$/.test(value);
function acceptedClubs(season){return Object.entries(season?.invitations||{}).filter(([id,item])=>safe(id)&&item?.status==="accepted"&&(season.clubIds||[]).includes(id)).map(([id])=>id);}
function newlyAccepted(before,after){if(!after?.id||after.status!=="active")return [];const previous=new Set(before?.id===after.id?acceptedClubs(before):[]);return acceptedClubs(after).filter(id=>!previous.has(id));}
module.exports={safe,acceptedClubs,newlyAccepted};
