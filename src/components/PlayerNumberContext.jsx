import React,{createContext,useContext} from "react";
import CompactPlayerNumber from "./CompactPlayerNumber.jsx";
export const PlayerNumberContext=createContext((raw,label)=>label);
export const usePlayerNumberLabel=()=>useContext(PlayerNumberContext);
export function InlineLineupNumber({raw,teamId}){const label=useContext(PlayerNumberContext),row=label.resolve?.(raw,teamId);return label.enabled?<CompactPlayerNumber number={row?.number??null} name={row?.name||String(raw||"Player")} disabled={!label.canEdit||!row} onCommit={label.canEdit&&row?value=>label.edit(teamId,row.key,value):undefined}/>:null;}
