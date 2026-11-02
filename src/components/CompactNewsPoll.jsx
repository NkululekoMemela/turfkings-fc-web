import React,{cloneElement,useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import './CompactNewsPoll.css';
export default function CompactNewsPoll({children,totalVotes=0,forceOpen=false}){
 const [open,setOpen]=useState(forceOpen),root=useRef(null),id=useId(),[hasImage,setHasImage]=useState(false);
 useEffect(()=>{if(forceOpen)setOpen(true);},[forceOpen]);
 useLayoutEffect(()=>{
  const element=root.current,media=element?.querySelector('.compact-poll-media-content');setHasImage(Boolean(media)&&element?.querySelector('.compact-poll-media')?.dataset.playerPortrait!=='true');if(!element||!media)return;
  const measure=()=>element.style.setProperty('--compact-poll-image-height',`${Math.max(1,Math.round(media.getBoundingClientRect().height/3))}px`);
  measure();const observer=typeof ResizeObserver==='function'?new ResizeObserver(measure):null;observer?.observe(media);media.addEventListener('load',measure,true);
  return()=>{observer?.disconnect();media.removeEventListener('load',measure,true);};
 },[children]);
 const toggle=()=>{setOpen(value=>!value);if(open)requestAnimationFrame(()=>root.current?.scrollIntoView({block:'start',behavior:'auto'}));};
 return <>{cloneElement(children,{ref:root,id,className:`${children.props.className||''} compact-news-poll-layout${open?' is-expanded':''}`})}{hasImage&&<div className="compact-poll-footer"><button type="button" className="secondary-btn compact-poll-expand" aria-expanded={open} aria-controls={id} onClick={toggle}>{open?'Show less image':'Show full image'} <span aria-hidden="true">{open?'⌃':'⌄'}</span></button></div>}</>;
}
