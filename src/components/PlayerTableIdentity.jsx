import React,{useState} from 'react';
export default function PlayerTableIdentity({name,label,image}){
 const [failed,setFailed]=useState('');
 return <span className="venue-player-identity"><span className="venue-player-avatar">{image&&failed!==image?<img src={image} alt="" loading="lazy" onError={()=>setFailed(image)}/>:<span aria-hidden="true">{String(name||'').split(/\s+/).filter(Boolean).map(part=>part[0]).slice(0,2).join('')}</span>}</span><span>{label||name}</span></span>;
}
