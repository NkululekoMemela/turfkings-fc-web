import useClubRibbonEdges from './useClubRibbonEdges.js';
import React,{createContext,useContext,useLayoutEffect,useRef} from 'react';
import FieldPageFrame from './FieldPageFrame.jsx';
import './ClubPageRibbon.css';
const Context=createContext({club:{name:'Your Club'},mode:'Friendly',onHome:null});
export function ClubRibbonProvider({club,mode,onHome,children}){return <Context.Provider value={{club,mode,onHome}}>{children}</Context.Provider>;}
export default function ClubPageRibbon({showLogo = false, title,onHome,meta}){
 const context=useContext(Context),ref=useClubRibbonEdges();
 const club=context.club||{};
 return <><div ref={ref} className="club-page-ribbon"><FieldPageFrame showLogo={showLogo} venue={{...club,name:club.name||'Your Club',logoUrl:club.logoUrl||club.logo||club.branding?.logoUrl}} page="club" homeLabel="Club home" titleOverride={title} modeLabel={context.mode||'Friendly'} onHome={onHome||context.onHome}/></div>{meta&&<div className="club-ribbon-context">{meta}</div>}</>;
}
