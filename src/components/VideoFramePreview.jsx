import React,{useLayoutEffect,useRef,useState} from 'react';
export default function VideoFramePreview({src,poster,...props}){
 const ref=useRef(null),[near,setNear]=useState(false);
 useLayoutEffect(()=>{setNear(false);const node=ref.current;if(!node)return;if(typeof IntersectionObserver!=="function"){setNear(true);return;}const rect=node.getBoundingClientRect();if(rect.top<innerHeight&&rect.bottom>0){setNear(true);return;}const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setNear(true);observer.disconnect();}},{rootMargin:'180px'});observer.observe(node);return()=>observer.disconnect();},[src]);
 return <video {...props} ref={ref} src={near?src:undefined} poster={poster||undefined} preload={near?(poster?'metadata':'auto'):'none'} playsInline onLoadedMetadata={e=>{if(!poster&&Number.isFinite(e.currentTarget.duration)&&e.currentTarget.duration>.1)e.currentTarget.currentTime=.1;}}/>;
}
