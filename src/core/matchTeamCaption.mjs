export function matchTeamCaption(team={}) {
 const name=String(team.label||team.name||'Team');
 const person=team.captain;
 const captain=typeof person==='string'?person:[person?.fullName,person?.name,person?.displayName].find(value=>typeof value==='string'&&value.trim())||'';
 return captain.trim()?`${name} (c: ${captain.trim()})`:name;
}
