export function fieldFixtureStartTiming({season,fixture,now=Date.now()}) {
 const day=(season?.matchDays||[]).find(d=>d.id===fixture?.matchDayId);
 const date=String(day?.dateLocal||'');
 const opensAtMs=Date.parse(`${date}T00:00:00+02:00`);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(opensAtMs))throw Error('This match day has an invalid date.');
 const raw=String(fixture?.scheduledLocal||`${date}T00:00:00`);
 const kickoff=Date.parse(/[Zz]$|[+-]\d{2}:\d{2}$/.test(raw)?raw:`${raw}+02:00`);
 if(!Number.isFinite(kickoff))throw Error('This fixture has an invalid start time.');
 const end=kickoff+(Number(season.matchSeconds)||3600)*1000;
 return {opensAtMs,needsConfirmation:now<kickoff-1800000||now>end+1800000,scheduledLocal:raw};
}
export function assertFieldStartTiming({season,fixture,confirmed=false,now=Date.now()}) {
 const timing=fieldFixtureStartTiming({season,fixture,now});
 if((timing.needsConfirmation||now<timing.opensAtMs)&&confirmed!==true)throw Error('Confirm Official play outside the scheduled match time, or choose Practice.');
 return timing;
}
