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
  if(![challenge.a,challenge.b].includes(winner))throw Error('Choose the winner.');
  if(blackFoul)return {...challenge,scoreA:winner===challenge.a?7:0,scoreB:winner===challenge.b?7:0,winner,blackBall:false,blackFoul:true};
  if(blackBall)return {...challenge,scoreA:0,scoreB:0,winner,blackBall:true,blackFoul:false};
  const a=Number(scoreA),b=Number(scoreB);
  if(scoreA===''||scoreB===''||![a,b].every(n=>Number.isInteger(n)&&n>=0&&n<=7))throw Error('Enter each player’s coloured balls, from 0 to 7.');
  return {...challenge,scoreA:a,scoreB:b,winner,blackBall:Boolean(blackBall),blackFoul:false};
}

// Rotate the least-used players first; with four or more, both previous players rest.
export function nextPoolPair(players,matches,mode='rotation') {
  if(players.length<2)return null;
  const valid=new Set(players.map(p=>p.id));
  const games=matches.filter(m=>valid.has(m.a)&&valid.has(m.b));
  const last=games[games.length-1];
  const usage=new Map(players.map((p,i)=>[p.id,{played:0,last:-1,order:i}]));
  const pairCount=new Map();
  for(let i=0;i<games.length;i++) {
    const m=games[i];for(const id of [m.a,m.b]){usage.get(id).played++;usage.get(id).last=i;}
    const key=[m.a,m.b].sort().join('|');pairCount.set(key,(pairCount.get(key)||0)+1);
  }
  const rank=(x,y)=>usage.get(x.id).played-usage.get(y.id).played||usage.get(x.id).last-usage.get(y.id).last||usage.get(x.id).order-usage.get(y.id).order;
  if(mode==='winner'&&last&&valid.has(last.winner)) {
    const challengers=players.filter(p=>p.id!==last.winner).sort((x,y)=>usage.get(x.id).last-usage.get(y.id).last||rank(x,y));
    return {a:last.winner,b:challengers[0].id};
  }
  let eligible=players.filter(p=>!last||![last.a,last.b].includes(p.id));
  if(eligible.length<2) {
    const rested=eligible.map(p=>p.id);
    eligible=players.slice().sort(rank);
    if(rested.length===1) {
      const other=eligible.find(p=>p.id!==rested[0]);return {a:rested[0],b:other.id};
    }
  }
  eligible.sort(rank);
  const a=eligible[0];
  const opponents=eligible.slice(1).sort((x,y)=>{
    const ux=usage.get(x.id),uy=usage.get(y.id);
    return ux.played-uy.played||ux.last-uy.last||(pairCount.get([a.id,x.id].sort().join('|'))||0)-(pairCount.get([a.id,y.id].sort().join('|'))||0)||ux.order-uy.order;
  });
  return {a:a.id,b:opponents[0].id};
}
export function poolMatchBadges(players,matches) {
  const streak=new Map(players.map(p=>[p.id,0])),earned=new Map(players.map(p=>[p.id,''])),awards={};
  for(const m of matches) {
    if(!streak.has(m.a)||!streak.has(m.b)||![m.a,m.b].includes(m.winner))continue;
    const loser=m.winner===m.a?m.b:m.a;
    earned.set(loser,earned.get(loser)+streakBadges(streak.get(loser)));streak.set(loser,0);
    streak.set(m.winner,streak.get(m.winner)+1);
    awards[m.id]=earned.get(m.winner)+streakBadges(streak.get(m.winner));
  }
  return awards;
}
