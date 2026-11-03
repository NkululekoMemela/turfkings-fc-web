import React,{useState} from "react";
const decoded=new Set();
export default function HubClubLogo({src,name,initials,hideInitials=false}){
 const [result,setResult]=useState({src:"",status:"loading"});
 const status=result.src===src?result.status:decoded.has(src)?"ready":"loading";
 return <>
  {(!src||status==="failed")&&<span className="hub-logo-fallback" aria-label={!src||status!=="ready"?`${name} logo placeholder`:undefined} aria-hidden={src&&status==="ready"?true:undefined}>{hideInitials ? "⚽" : initials}</span>}
  {src&&<img className="hub-logo-image" src={src} alt={`${name} logo`} width="108" height="108" loading="eager" fetchPriority="high" decoding="async" style={{opacity:status==="ready"?1:0}} onLoad={()=>{decoded.add(src);setResult({src,status:"ready"});}} onError={()=>setResult({src,status:"failed"})}/>}
  {src&&status==="loading"&&<span className="hub-logo-skeleton" aria-hidden="true"/>}
 </>;
}
