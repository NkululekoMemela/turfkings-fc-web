import {createContext,useContext} from "react";
export const PlayerNumberContext=createContext((raw,label)=>label);
export const usePlayerNumberLabel=()=>useContext(PlayerNumberContext);
