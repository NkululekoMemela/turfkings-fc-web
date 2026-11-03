const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const valid=time=>typeof time==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(time);
export function fieldHoursError(hours={}){
 for(const day of DAYS){const row=hours?.[day];if(!row?.status)continue;
  if(!['open','closed','24h'].includes(row.status))return `Choose valid operating hours for ${day}.`;
  if(row.status==='open'){
   if(!valid(row.opens)||!valid(row.closes))return `Set opening and closing times for ${day}.`;
   if(row.closes<=row.opens)return `Closing time must be after opening time for ${day}. Use Open 24 hours if appropriate.`;
  }
 }return '';
}
export function fieldOperatingHoursLine(field={},now=Date.now()){
 const sources=[field,field.schedule,field.raw,field.raw?.schedule].filter(Boolean);
 const hours=Object.assign({},...sources.slice().reverse().map(source=>source.operatingHours||{}));
 const timezone=sources.find(source=>source.timezone)?.timezone||'Africa/Johannesburg';
 let day;try{day=new Intl.DateTimeFormat('en-ZA',{weekday:'long',timeZone:timezone}).format(new Date(now));}catch{day=new Intl.DateTimeFormat('en-ZA',{weekday:'long',timeZone:'Africa/Johannesburg'}).format(new Date(now));}
 const row=hours[day];
 if(row?.status==='closed')return 'Closed today';
 if(row?.status==='24h')return 'Open 24 hours';
 if(row?.status==='open')return valid(row.opens)&&valid(row.closes)&&row.closes>row.opens?`Open ${row.opens}–${row.closes}`:'';
 for(const source of sources){
  const summary=source.operatingHoursSummary;
  if(typeof summary==='string'&&summary.trim())return summary;
  const opens=source.playTime||source.openingTime,closes=source.playEndTime||source.closingTime;
  if(valid(opens)&&valid(closes)&&closes>opens)return `Open ${opens}–${closes}`;
  const times=String(source.weeklyPlayTime||'').match(/(?:[01]\d|2[0-3]):[0-5]\d/g);
  if(times?.length===2&&times[1]>times[0])return source.weeklyPlayTime;
 }
 return '';
}
