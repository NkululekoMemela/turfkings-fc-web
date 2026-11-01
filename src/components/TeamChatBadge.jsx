import React,{useState} from 'react';
import {FANM_PRO_CLUBS,FANM_NATIONAL_TEAMS} from '../data/fanm/fanmTeamLibrary.js';
const key=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function resolveTeamChatBadge(room={}){
 const identity=room.teamIdentity||{},keys=[room.name,room.abbr,identity.name,identity.abbr].map(key).filter(Boolean);
 const national=FANM_NATIONAL_TEAMS.find(t=>keys.includes(key(t.name))||keys.includes(key(t.abbr)));
 const club=FANM_PRO_CLUBS.find(t=>keys.includes(key(t.name))||keys.includes(key(t.abbr)));
 const flag=room.flag||identity.flag||(identity.type!=='club'?national?.flag:'')||'';
 return {logoUrl:room.logoUrl||identity.fantasyLogo32||identity.logo32||(!flag?(club?.fantasyLogo32||club?.logo32):'')||'',flag,name:room.name||identity.name||'Your team'};
}
export default function TeamChatBadge({room,className=''}){
 const badge=resolveTeamChatBadge(room),[failed,setFailed]=useState('');
 return <span className={`team-chat-badge ${className}`} aria-hidden="true">{badge.logoUrl&&failed!==badge.logoUrl?<img src={badge.logoUrl} alt="" onError={()=>setFailed(badge.logoUrl)}/>:badge.flag?<span className="team-chat-flag">{badge.flag}</span>:<span className="team-chat-fallback">{badge.name.slice(0,3).toUpperCase()}</span>}</span>;
}
