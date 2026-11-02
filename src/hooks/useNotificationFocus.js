import {useEffect,useState} from 'react';
// Wait for the actual card, then focus once for each notification tap.
export default function useNotificationFocus(request,groupId,items,prefix){
 const [focus,setFocus]=useState({key:'',id:''});
 const id=String(request?.storyId||''),key=`${groupId}:${id}:${request?.openedAt||''}`;
 const available=!!id&&request?.clubId===groupId&&items.some(item=>item.id===id&&!item.archived);
 useEffect(()=>{
  if(!available)return;
  let timer,highlight,stopped=false,attempts=0;
  function locate(){
   if(stopped)return;
   const node=document.getElementById(`${prefix}${id}`);
   if(!node){if(++attempts<30)timer=setTimeout(locate,100);return;}
   setFocus({key,id});
   node.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
   highlight=setTimeout(()=>setFocus(current=>current.key===key?{key,id:''}:current),5000);
  }
  timer=setTimeout(locate,150);
  return()=>{stopped=true;clearTimeout(timer);clearTimeout(highlight);};
 },[key,available,prefix]);
 return focus.key===key?focus.id:'';
}
