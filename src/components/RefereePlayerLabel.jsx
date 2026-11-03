import React from 'react';
import {compactRefereeName} from '../core/fieldFutsalDiscipline.mjs';
import {splitNumberDisplay} from '../core/playerNumberDisplay.mjs';
import './FieldRefereePlayers.css';
export default function RefereePlayerLabel({player,peers=[],numberLabel,displayName}){
 const resolved=numberLabel?.resolve?.(player.name,player.teamId)?.number;
 const fallback=splitNumberDisplay(displayName?.(player.name,player.teamId)||player.name).number.replace(/[()]/g,'');
 const number=resolved??fallback;
 return <strong className="field-referee-player-label" title={player.name}>{number!==''&&number!==null&&number!==undefined&&number!=='-'&&<b>({number})</b>}<span>{compactRefereeName(player.name,peers)}</span></strong>;
}
