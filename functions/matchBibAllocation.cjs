// A match allocation is not ownership, a purchase or a confirmed supplier booking.
function applyMatchBibs(players, allocations = {}) {
 if (!allocations || typeof allocations !== 'object' || Array.isArray(allocations)) throw Error('Check the match bib allocations.');
 const ids = new Set(players.map(p=>p.sourcePlayerId));
 if (Object.keys(allocations).some(id=>!ids.has(id))) throw Error('Assign bibs only to selected players.');
 return players.map(player=>{
  const bib=allocations[player.sourcePlayerId];
  if (!bib) return player;
  if (!['club','hired'].includes(bib.source) || !/^\d{1,3}$/.test(String(bib.number)) ||
      (bib.source==='hired'&&(Number(bib.number)<1||Number(bib.number)>999)) ||
      typeof bib.color!=='string' || !bib.color.trim() || bib.color.trim().length>40) {
   throw Error('Confirm the source, colour and visible number of each match bib.');
  }
  const matchBib={source:bib.source,number:Number(bib.number),color:bib.color.trim(),available:true};
  return {...player,jerseyNumber:matchBib.number,bibColor:matchBib.color,matchBib};
 });
}
module.exports={applyMatchBibs};
