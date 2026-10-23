import React,{createContext,useContext,useEffect,useLayoutEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import "./HighlightPlayback.css";
const Playback=createContext(null);
export function HighlightPlaybackProvider({children}){
 const [selected,setSelected]=useState(null),[minimized,setMinimized]=useState(false);
 const video=useRef(null),selectedRef=useRef(null);
 const [placement,setPlacement]=useState(null);
 useLayoutEffect(()=>{
  if(!selected)return;
  let frame=0,docked=false;
  const measure=()=>{
   frame=0;
   const anchor=selectedRef.current?.anchor;
   if(!anchor?.isConnected){setPlacement(null);return;}
   const rect=anchor.getBoundingClientRect();
   let top=0,bottom=window.innerHeight;
   for(const element of document.querySelectorAll('.landing-header-sticky,.tk-bottom-nav-flat,.field-bottom-nav')){
    const style=getComputedStyle(element),box=element.getBoundingClientRect();
    if(!['fixed','sticky'].includes(style.position)||!box.height||box.bottom<=0||box.top>=bottom)continue;
    if(box.top<=1)top=Math.max(top,box.bottom);
    else if(box.bottom>=window.innerHeight-1)bottom=Math.min(bottom,box.top);
   }
   // Leave the card only after it has left the usable viewport.
   // A wider return boundary prevents repeated switching near the edge.
   if(!docked&&(rect.bottom<=top||rect.top>=bottom||rect.width<=0))docked=true;
   else if(docked&&rect.top>=top+32&&rect.bottom<=bottom-32&&rect.width>0)docked=false;
   const next=docked?null:{position:'absolute',top:rect.top+window.scrollY,left:rect.left+window.scrollX,width:rect.width,height:rect.height,right:'auto',bottom:'auto',borderRadius:12,zIndex:30};
   setPlacement(previous=>{
    if(previous===null&&next===null)return previous;
    if(previous&&next&&['top','left','width','height'].every(key=>Math.abs(previous[key]-next[key])<0.5))return previous;
    return next;
   });
  };
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure);};
  measure();window.addEventListener('scroll',schedule,true);window.addEventListener('resize',schedule);
  const observer=new ResizeObserver(schedule);if(selectedRef.current?.anchor)observer.observe(selectedRef.current.anchor);
  return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('scroll',schedule,true);window.removeEventListener('resize',schedule);};
 },[selected]);
 const finish=()=>{video.current?.pause();selectedRef.current?.onFinish?.();selectedRef.current=null;setSelected(null);};
 useEffect(()=>()=>{video.current?.pause();selectedRef.current?.onFinish?.();},[]);
 const select=(clip,onPlayed,onFinish,anchor)=>{if(selectedRef.current?.clip.mediaUrl===clip.mediaUrl){setMinimized(false);video.current?.play().catch(()=>{});return;}video.current?.pause();selectedRef.current?.onFinish?.();const value={clip,onPlayed,onFinish,anchor};setPlacement(null);selectedRef.current=value;setSelected(value);setMinimized(false);};
 return <Playback.Provider value={{select,selectedUrl:selected?.clip.mediaUrl||""}}>{children}{selected&&createPortal(<aside className={`fanm-highlight-player ${minimized?"is-minimized":""}`} aria-label="Selected highlight player" data-docked={!placement||minimized?"true":"false"} style={!minimized&&placement?placement:undefined}><div className="fanm-highlight-player-bar" style={placement&&!minimized?{position:"absolute",top:0,left:0,right:0,zIndex:1,background:"linear-gradient(#000b,transparent)"}:undefined}><strong>{selected.clip.playerName||"Highlight"}</strong><button type="button" onClick={()=>{video.current?.pause();setMinimized(v=>!v);}} aria-label={minimized?"Expand highlight player":"Minimize highlight player"}>{minimized?"↗":"−"}</button><button type="button" onClick={finish} aria-label="Close highlight player">×</button></div><video key={selected.clip.mediaUrl} ref={video} className="tkh-video" style={placement&&!minimized?{height:"100%",maxHeight:"none",objectFit:"contain"}:undefined} src={selected.clip.mediaUrl} controls playsInline autoPlay onPlay={()=>selectedRef.current?.onPlayed?.()} onEnded={finish}/></aside>,document.body)}</Playback.Provider>;
}
export function HighlightThumbnail({highlight,onWatched,onFinish}){
 const playback=useContext(Playback),preview=useRef(null),timer=useRef(null),point=useRef(null),held=useRef(false);
 const [previewing,setPreviewing]=useState(false),[previewError,setPreviewError]=useState("");
 const stop=()=>{clearTimeout(timer.current);preview.current?.pause();if(preview.current)preview.current.currentTime=0;setPreviewing(false);};
 useEffect(()=>{const hide=()=>{if(document.hidden)stop();};document.addEventListener("visibilitychange",hide);return()=>{clearTimeout(timer.current);preview.current?.pause();document.removeEventListener("visibilitychange",hide);};},[]);
 const down=e=>{if(e.button!==0||playback?.selectedUrl===highlight.mediaUrl)return;held.current=false;point.current={x:e.clientX,y:e.clientY};timer.current=setTimeout(()=>{held.current=true;setPreviewError("");setPreviewing(true);const element=preview.current;if(element){element.defaultMuted=true;element.muted=true;element.volume=0;}const promise=element?.play();promise?.catch(()=>{setPreviewError("Preview unavailable. Tap to watch.");setPreviewing(false);});},450);};
 return <button type="button" className="fanm-clip-thumb" aria-label={`Watch ${highlight.playerName||"player"} ${highlight.normalizedType||"highlight"}. Hold for muted preview.`} onPointerDown={down} onPointerMove={e=>{if(point.current&&Math.hypot(e.clientX-point.current.x,e.clientY-point.current.y)>12){held.current=true;stop();}}} onPointerUp={stop} onPointerCancel={()=>{held.current=true;stop();}} onPointerLeave={stop} onContextMenu={e=>e.preventDefault()} onClick={e=>{if(held.current){e.preventDefault();held.current=false;return;}playback?.select(highlight,()=>onWatched?.(highlight),onFinish,e.currentTarget);}}>
  <video ref={preview} className="fanm-clip-preview" src={highlight.mediaUrl} poster={highlight.thumbnailUrl||highlight.posterUrl||highlight.previewImageUrl||undefined} muted onVolumeChange={e=>{const element=e.currentTarget;if(!element.muted)element.muted=true;if(element.volume!==0)element.volume=0;}} playsInline preload="metadata" loop tabIndex={-1}/><span className="fanm-clip-overlay"><strong>{highlight.playerName||"Player"}</strong><span>{previewError||(previewing?"Muted preview":playback?.selectedUrl===highlight.mediaUrl?"Now selected":"▶ Hold to preview")}</span></span>
 </button>;
}
