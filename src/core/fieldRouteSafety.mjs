export function fieldNavigationReady({identity,choice,canChooseSession}){
 return Boolean(identity)&&(canChooseSession?['official','practice'].includes(choice):true);
}
export function fieldNeedsSeason(page,season){
 return ['squads','formations','stats','fixtures','videos','live'].includes(page)&&!season?.id;
}
export function fieldMatchDays(season){
 return (Array.isArray(season?.matchDays)?season.matchDays:[]).filter(d=>d&&typeof d.id==='string'&&typeof d.dateLocal==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d.dateLocal));
}
export function safeFieldSeason(season){
 if(!season||typeof season!=='object'||Array.isArray(season))return null;
 const list=key=>(Array.isArray(season[key])?season[key]:[]).filter(Boolean);
 return {...season,clubIds:list('clubIds').filter(v=>typeof v==='string'),matchDays:fieldMatchDays(season),fixtures:list('fixtures'),results:list('results'),allEvents:list('allEvents'),matchDayHistory:list('matchDayHistory'),liveMatches:season.liveMatches&&typeof season.liveMatches==='object'?season.liveMatches:{},invitations:season.invitations&&typeof season.invitations==='object'?Object.fromEntries(Object.entries(season.invitations).filter(([,v])=>v&&typeof v==='object')):{}};
}
export function fieldDateLabel(value){const ms=Date.parse(`${value}T12:00:00+02:00`);return Number.isFinite(ms)?new Intl.DateTimeFormat('en-ZA',{day:'2-digit',month:'short',year:'numeric',timeZone:'Africa/Johannesburg'}).format(new Date(ms)):'';}

export function fieldEmptyRouteMessage(page,season){
 if(fieldNeedsSeason(page,season))return page==='squads'?'No squads yet':'No league season yet';
 if(['squads','formations','live'].includes(page)&&!season?.fixtures?.length&&!season?.results?.length&&!season?.matchDayHistory?.length)return 'Fixtures are not published yet';
 return '';
}

export function fieldOpenMatchDays(season) {
 const closed=new Set((season?.matchDayHistory||[]).map(day=>day.scheduledMatchDayId||day.id));
 return fieldMatchDays(season).filter(day=>day.status==="scheduled"&&!closed.has(day.id))
   .sort((a,b)=>a.dateLocal.localeCompare(b.dateLocal));
}
