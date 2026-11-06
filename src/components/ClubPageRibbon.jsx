import React,{createContext,useContext,useLayoutEffect,useRef} from 'react';
import FieldPageFrame from './FieldPageFrame.jsx';
import './ClubPageRibbon.css';
const Context=createContext({club:{name:'Your Club'},mode:'Friendly',onHome:null});
export function ClubRibbonProvider({club,mode,onHome,children}){return <Context.Provider value={{club,mode,onHome}}>{children}</Context.Provider>;}
export default function ClubPageRibbon({title,onHome,meta}){
 const context=useContext(Context),ref=useRef(null);
 useLayoutEffect(()=>{const node=ref.current,parent=node?.parentElement,root=node?.closest('.app-root');if(!node||!parent||!root)return;
  const measure=()=>{const style=getComputedStyle(parent),rootStyle=getComputedStyle(root),bounds=parent.getBoundingClientRect(),outer=root.getBoundingClientRect();node.style.setProperty('--club-ribbon-left',`${Math.max(0,bounds.left+parseFloat(style.paddingLeft||0)-outer.left)}px`);node.style.setProperty('--club-ribbon-right',`${Math.max(0,outer.right-bounds.right+parseFloat(style.paddingRight||0))}px`);node.style.setProperty('--club-ribbon-top',`${parseFloat(style.paddingTop||0)+parseFloat(rootStyle.paddingTop||0)}px`);};
  measure();const observer=new ResizeObserver(measure);observer.observe(parent);observer.observe(root);return()=>observer.disconnect();
 },[]);
 const club=context.club||{};
 return <><div ref={ref} className="club-page-ribbon"><FieldPageFrame venue={{...club,name:club.name||'Your Club',logoUrl:club.logoUrl||club.logo||club.branding?.logoUrl}} page="club" homeLabel="Club home" titleOverride={title} modeLabel={context.mode||'Friendly'} onHome={onHome||context.onHome}/></div>{meta&&<div className="club-ribbon-context">{meta}</div>}</>;
}
