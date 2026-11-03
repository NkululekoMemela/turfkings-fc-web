export function squadKitSummary(players=[]){
 const colours=[...new Set(players.map(p=>p.bibColor||p.matchBib?.color).filter(Boolean))];
 return `${colours.length?`Wear ${colours.join(' / ')} · `:''}${players.map(p=>`${p.jerseyNumber!=null?`(${p.jerseyNumber}) `:''}${p.fullName||p.name||'Player'}`).join(', ')}`.slice(0,600);
}
export function noticePhase(day,fixtures,now=Date.now()){
 const times=fixtures.filter(f=>f.matchDayId===day.id&&f.status==='scheduled').map(f=>Date.parse(f.scheduledLocal?(f.scheduledLocal.match(/[zZ]|[+-]\d\d:\d\d$/)?f.scheduledLocal:f.scheduledLocal+'+02:00'):'')).filter(Number.isFinite);
 if(!times.length)return '';
 const hours=(Math.min(...times)-now)/3600000;
 if(hours<=24&&hours>23.75)return 'captain';
 if(hours<=16&&hours>15.75)return 'admin';
 return '';
}
