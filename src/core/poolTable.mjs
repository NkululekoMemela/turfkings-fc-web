export const POOL_STORAGE_KEY = 'fanm-pool-table-v1';
export const emptyPool = () => ({version:1,players:[],matches:[],challenge:null});
export function streakBadges(streak) {
  return '🔥'.repeat(Math.max(0,streak-2));
}

export function poolStandings(players,matches) {
  const rows=new Map(players.map(p=>[p.id,{...p,played:0,wins:0,losses:0,ballsFor:0,ballsAgainst:0,difference:0,streak:0,bestStreak:0,earnedBadges:''}]));
  for(const m of matches) {
    const a=rows.get(m.a),b=rows.get(m.b);if(!a||!b||![m.a,m.b].includes(m.winner))continue;
    a.played++;b.played++;
    const winner=rows.get(m.winner),loser=m.winner===m.a?b:a;
    winner.wins++;loser.losses++;
    winner.streak++;winner.bestStreak=Math.max(winner.bestStreak,winner.streak);
    loser.earnedBadges+=streakBadges(loser.streak);loser.streak=0;
    a.ballsFor+=m.scoreA;a.ballsAgainst+=m.scoreB;b.ballsFor+=m.scoreB;b.ballsAgainst+=m.scoreA;
    if(!m.blackBall||m.blackFoul){a.difference+=m.scoreA-m.scoreB;b.difference+=m.scoreB-m.scoreA;}
  }
  return [...rows.values()].map(p=>({...p,badges:streakBadges(p.streak)})).sort((a,b)=>b.wins-a.wins||b.difference-a.difference||a.name.localeCompare(b.name));
}
export function poolResult(challenge,scoreA,scoreB,winner,blackBall,blackFoul=false) {
  if(!challenge || challenge.a===challenge.b)throw Error('Choose two different players.');
  if((blackFoul||blackBall)&&![challenge.a,challenge.b].includes(winner))throw Error('Choose the winner.');
  if(blackFoul)return {...challenge,scoreA:winner===challenge.a?7:0,scoreB:winner===challenge.b?7:0,winner,blackBall:false,blackFoul:true};
  if(blackBall)return {...challenge,scoreA:0,scoreB:0,winner,blackBall:true,blackFoul:false};
  const a=Number(scoreA),b=Number(scoreB);
  if(scoreA===''||scoreB===''||![a,b].every(n=>Number.isInteger(n)&&n>=0&&n<=7))throw Error('Enter each player’s coloured balls, from 0 to 7.');
  const automatic=normalPoolWinner(challenge,scoreA,scoreB);
  if(!automatic)throw Error('For a normal finish, one player must have 7 balls and the other 0–6. If both reached black, choose Both players played black.');
  return {...challenge,scoreA:a,scoreB:b,winner:automatic,blackBall:false,blackFoul:false};
}

export function poolMatchBadges(players,matches) {
  const streak=new Map(players.map(p=>[p.id,0])),earned=new Map(players.map(p=>[p.id,''])),awards={};
  for(const m of matches) {
    if(!streak.has(m.a)||!streak.has(m.b)||![m.a,m.b].includes(m.winner))continue;
    const loser=m.winner===m.a?m.b:m.a;
    earned.set(loser,earned.get(loser)+streakBadges(streak.get(loser)));streak.set(loser,0);
    streak.set(m.winner,streak.get(m.winner)+1);
    awards[m.id]=streakBadges(streak.get(m.winner));
  }
  return awards;
}

export const pairKey=(a,b)=>JSON.stringify([a,b].sort());
export function migratePool(p){
 return {...p,version:1,sessionId:p.sessionId||crypto.randomUUID(),gamesSpent:p.gamesSpent??p.matches.length,mode:p.mode||'rotation',tables:p.tables||1,active:p.active|| (p.challenge?[{...p.challenge,table:1}]:[]),challenge:null,coins:Number.isInteger(p.coins)?p.coins:null,coinCheckpoint:p.coinCheckpoint??p.matches.length,coinSpan:p.coinSpan??null,lowCoinAck:p.lowCoinAck??false,players:p.players.map(x=>({...x,present:x.present!==false,joinedAtGame:x.joinedAtGame||0,arrival:x.arrival||'normal'}))};
}
export const coinsLeft=p=>p.coins===null?null:Math.max(0,p.coins-p.active.length);
export function coinReminder(p){if(p.coins===null)return false;return !p.lowCoinAck&&coinsLeft(p)<=3 || p.coinSpan>0&&(p.gamesSpent??p.matches.length)-p.coinCheckpoint>=Math.ceil(p.coinSpan/2);}
export function reconcileCoins(p,n){if(!Number.isInteger(n)||n<0)throw Error('Enter a whole number of unused coins.');return {...p,coins:n+p.active.length,coinCheckpoint:p.gamesSpent??p.matches.length,coinSpan:n+p.active.length,lowCoinAck:n<=3};}
export function opponents(p,id){return p.players.filter(x=>x.id!==id).map(x=>{const games=p.matches.filter(m=>[m.a,m.b].includes(id)&&[m.a,m.b].includes(x.id));const wins=games.filter(m=>m.winner===id).length;return {...x,played:games.length,wins,losses:games.length-wins,difference:games.reduce((v,m)=>v+(m.a===id?m.scoreA-m.scoreB:m.scoreB-m.scoreA),0)};});}
// Lowest encounter count wins first; rest is a preference, never a pairing veto.
export function nextPoolPair(p,table=1){
 const busy=new Set(p.active.flatMap(m=>[m.a,m.b]));const present=p.players.filter(x=>x.present!==false);const available=present.filter(x=>!busy.has(x.id));if(available.length<2)return null;
 const counts=new Map(),usage=new Map(p.players.map(x=>[x.id,{played:0,sinceJoin:0,last:-1}]));
 p.matches.forEach((m,i)=>{counts.set(pairKey(m.a,m.b),(counts.get(pairKey(m.a,m.b))||0)+1);[m.a,m.b].forEach(id=>{const u=usage.get(id);if(u){u.played++;u.last=i;if(i>=(p.players.find(x=>x.id===id).joinedAtGame||0))u.sinceJoin++;}});});
 p.active.forEach(m=>counts.set(pairKey(m.a,m.b),(counts.get(pairKey(m.a,m.b))||0)+1));
 const last=p.matches.filter(m=>(m.table||1)===table).at(-1);
 // Late players inherit the encounter floor at arrival, so old fixtures do not force a catch-up marathon.
 for(let i=0;i<present.length;i++)for(let j=i+1;j<present.length;j++){
  const a=present[i],b=present[j],joined=Math.max(a.joinedAtGame||0,b.joinedAtGame||0);
  if(!joined)continue;
  const before=p.players.filter(x=>(x.joinedAtGame||0)<joined);const oldCounts=[];
  for(let u=0;u<before.length;u++)for(let v=u+1;v<before.length;v++)oldCounts.push(p.matches.slice(0,joined).filter(m=>pairKey(m.a,m.b)===pairKey(before[u].id,before[v].id)).length);
  const key=pairKey(a.id,b.id);counts.set(key,(counts.get(key)||0)+(oldCounts.length?Math.min(...oldCounts):0));
 }
 const credit=x=>{const prior=p.matches.slice(0,x.joinedAtGame||0);const others=p.players.filter(y=>y.id!==x.id&&(y.joinedAtGame||0)<=(x.joinedAtGame||0));return others.length?Math.floor(prior.reduce((n,m)=>n+Number(others.some(y=>y.id===m.a))+Number(others.some(y=>y.id===m.b)),0)/others.length):0;};
 const normalTarget=Math.min(...present.map(x=>usage.get(x.id).sinceJoin+credit(x)));
 const eligibleCatch=x=>x.arrival==='catchup'&&(p.coins===null||p.coins>(p.gamesSpent??p.matches.length)-p.coinCheckpoint)&&usage.get(x.id).played<Math.max(...present.map(y=>usage.get(y.id).played))&&usage.get(x.id).sinceJoin+credit(x)<=normalTarget+1;
 const pace=x=>usage.get(x.id).sinceJoin+credit(x)-(eligibleCatch(x)?1:0);
 const wait=(x,y)=>pace(x)-pace(y)||usage.get(x.id).last-usage.get(y.id).last||x.id.localeCompare(y.id);
 if(p.mode==='winner'&&last&&available.some(x=>x.id===last.winner)){const b=available.filter(x=>x.id!==last.winner).sort((x,y)=>usage.get(x.id).last-usage.get(y.id).last||wait(x,y))[0];return {a:last.winner,b:b.id};}
 const all=[];for(let i=0;i<present.length;i++)for(let j=i+1;j<present.length;j++)all.push(counts.get(pairKey(present[i].id,present[j].id))||0);
 const established=present.filter(x=>!(x.joinedAtGame>0));const existingCounts=[];
 for(let i=0;i<established.length;i++)for(let j=i+1;j<established.length;j++)existingCounts.push(counts.get(pairKey(established[i].id,established[j].id))||0);
 const base=existingCounts.length?Math.min(...existingCounts):Math.min(...all);
 for(let i=0;i<present.length;i++)for(let j=i+1;j<present.length;j++)if(present[i].joinedAtGame>0||present[j].joinedAtGame>0){const key=pairKey(present[i].id,present[j].id);counts.set(key,Math.max(base,counts.get(key)||0));}
 const floor=base;const pairs=[];
 for(let i=0;i<available.length;i++)for(let j=i+1;j<available.length;j++){const a=available[i],b=available[j];if((counts.get(pairKey(a.id,b.id))||0)!==floor)continue;pairs.push({a:a.id,b:b.id,pace:pace(a)+pace(b),rest:Number(last&&[last.a,last.b].includes(a.id))+Number(last&&[last.a,last.b].includes(b.id)),wait:usage.get(a.id).last+usage.get(b.id).last});}
 pairs.sort((x,y)=>x.pace-y.pace||x.rest-y.rest||x.wait-y.wait||pairKey(x.a,x.b).localeCompare(pairKey(y.a,y.b)));
 return pairs[0]||null;
}
export function beginPoolGame(p,table,pair,manual=false){
 if(!Number.isInteger(table)||table<1||table>p.tables||p.active.some(m=>m.table===table))throw Error('Choose a free table.');
 if(p.coins===null)throw Error('Set tonight’s coins first.');if(coinsLeft(p)<1)throw Error('No unallocated coins. Update the remaining coins.');
 if(!pair||pair.a===pair.b||[pair.a,pair.b].some(id=>!p.players.some(x=>x.id===id&&x.present!==false)||p.active.some(m=>[m.a,m.b].includes(id))))throw Error('Choose two available players.');
 return {...p,active:[...p.active,{id:crypto.randomUUID(),a:pair.a,b:pair.b,table,manual,createdAt:Date.now()}]};
}
export function finishPoolGame(p,id,result){const m=p.active.find(x=>x.id===id);if(!m)throw Error('This game is no longer active.');if(p.coins===null)throw Error('Set the unused coins first.');return {...p,active:p.active.filter(x=>x.id!==id),matches:[...p.matches,{...result,...m,finishedAt:Date.now()}],coins:Math.max(0,p.coins-1),gamesSpent:(p.gamesSpent??p.matches.length)+1};}
export function suggestedPoolPairs(p){const pairs={};let draft=p;for(let table=1;table<=p.tables;table++){if(draft.active.some(m=>m.table===table))continue;const pair=nextPoolPair(draft,table);pairs[table]=pair;if(pair)draft={...draft,active:[...draft.active,{...pair,table,id:`suggestion-${table}`} ]};}return pairs;}

export function normalPoolWinner(challenge,scoreA,scoreB){
 if(!challenge||scoreA===''||scoreB==='')return '';
 const a=Number(scoreA),b=Number(scoreB);
 if(![a,b].every(n=>Number.isInteger(n)&&n>=0&&n<=7))return '';
 return a===7&&b<7?challenge.a:b===7&&a<7?challenge.b:'';
}
