const norm=value=>String(value||'').normalize('NFKC').trim().toLowerCase().replace(/[_\s]+/g,' ');
const ids=p=>[p.id,p.playerId,p.sourcePlayerId,p.memberId,p.uid].filter(Boolean);
const names=p=>[p.fullName,p.name,p.displayName,p.shortName,...(p.aliases||[]),...(p.profileNameAliases||[])].filter(Boolean);
export function resolvePlayerPortrait(raw,profiles=[],photos={}){
 const target=norm(raw);if(!target||/^\((?:\d+|-)\)(?:\s|$)/.test(target))return null;
 let matches=profiles.filter(p=>ids(p).some(id=>norm(id)===target));
 if(!matches.length)matches=profiles.filter(p=>names(p).some(name=>norm(name)===target));
 if(matches.length>1)return null;
 const profile=matches[0];
 const ownImage=profile?.photoData||profile?.photoUrl||profile?.photoURL||profile?.avatarUrl;
 if(typeof ownImage==='string'&&ownImage)return ownImage;
 const uniqueAlias=value=>profiles.filter(p=>names(p).some(name=>norm(name)===norm(value))).length===1;
 const candidates=profile?[...ids(profile),...names(profile).filter(uniqueAlias)]:/\s/.test(target)?[raw]:[];
 for(const value of candidates){
  const key=norm(value);if(!key||key==='(-)'||/^\(\d+\)$/.test(key))continue;
  const images=[...new Set(Object.entries(photos).filter(([name,image])=>norm(name)===key&&typeof image==='string'&&image).map(([,image])=>image))];
  if(images.length===1)return images[0];
 }
 return null;
}
export function indexPlayerPortraits(documents=[]){
 const result={},ambiguous=new Set();
 for(const {id,data}of documents){const image=data.photoData||data.photoUrl||data.profilePhotoUrl;if(!image)continue;
  for(const alias of [id,data.playerId,data.sourcePlayerId,data.memberId,data.uid,data.name,data.fullName]){
   const key=norm(alias);if(!key||/^\((?:\d+|-)\)(?:\s|$)/.test(key)||ambiguous.has(key))continue;
   if(result[key]&&result[key]!==image){delete result[key];ambiguous.add(key);}else result[key]=image;
  }
 }
 return result;
}
