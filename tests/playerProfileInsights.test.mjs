import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPlayerProfileInsights,collectProfileSeasonRecords,buildProfileMemberResolver} from '../src/core/playerProfileInsights.mjs';
import {ownsPlayerProfile,validatePlayerProfile,nextProfileAliases} from '../src/core/playerProfilePolicy.mjs';
const members=[{id:'a',uid:'u1',playerId:'old_a',fullName:'Alice',shortName:'Ace',profileNameAliases:['Old Alice'],createdAt:'2026-01-01',status:'active'},
 {id:'b',playerId:'b',fullName:'Bob',createdAt:'2026-01-01',status:'active'}];
const day=(n,appearances=[],events=[])=>({id:'day'+n,createdAt:`2026-02-0${n}T20:00:00Z`,playerAppearances:appearances,allEvents:events});
const build=(season,more={})=>buildPlayerProfileInsights({season,members,memberId:'a',...more});
test('AuthContext wrapper exposes verified Firebase identity',()=>assert.equal(ownsPlayerProfile({uid:'u1'},{firebaseUser:{uid:'u1',emailVerified:true}}),true));
test('numbered bib requires colour and number; no bib clears stale colour',()=>{
 const value={fullName:'Alice',shortName:'Ace',ownsNumberedBib:'yes',jerseyNumber:'0',bibColor:'Orange'};
 assert.equal(validatePlayerProfile(value).jerseyNumber,0);
 assert.equal(validatePlayerProfile({...value,ownsNumberedBib:'no'}).bibColor,'');
 assert.throws(()=>validatePlayerProfile({...value,bibColor:''}));assert.throws(()=>validatePlayerProfile({...value,jerseyNumber:''}));
});
test('name changes preserve historical aliases and ambiguous names do not merge players',()=>{
 assert.equal(buildProfileMemberResolver(members)('Old Alice'),'a');
 assert.equal(buildProfileMemberResolver(members)('', 'old_a'),'a');
 assert.equal(buildProfileMemberResolver([...members,{id:'c',shortName:'Ace'}])('Ace'),'');
 assert.deepEqual(nextProfileAliases(members[0],{fullName:'New Alice',shortName:'New Ace'}),['Old Alice','Alice','Ace']);
});
test('duplicate event copies, guests, ties and competition separation',()=>{
 const goal={id:'g1',type:'goal',matchNo:1,scorer:'Old Alice'};
 const season={matchDayHistory:[day(1,[],[goal,goal,{id:'g2',type:'goal',scorer:'Bob'},{id:'g3',type:'goal',scorer:'Ace',scorerType:'guest'}])],friendlyMatchDayHistory:[day(2,[],[{id:'f',type:'goal',scorer:'Ace',matchType:'FRIENDLY'}])]};
 assert.equal(build(season).player.goals,1);assert.equal(build(season).statements[0].text,'Joint Top goal scorer');
 assert.equal(build(season,{mode:'FRIENDLY'}).player.goals,1);
 assert.equal(collectProfileSeasonRecords({currentEvents:[goal]}).events.length,0);
});
test('zero appearances are not attendance; two games on one date count as one match day',()=>{
 const season={friendlyMatchDayHistory:[day(1,[{playerId:'old_a',matchesPlayed:1},{playerId:'b',matchesPlayed:0}]),{...day(1,[{playerId:'old_a',matchesPlayed:1}]),id:'game2'}]};
 const result=build(season,{mode:'FRIENDLY'});
 assert.equal(result.player.gamesPlayed,2);assert.equal(result.player.matchDaysPresent,1);assert.equal(result.recordedDays,1);
 assert.equal(result.rows.find(p=>p.id==='b').matchDaysPresent,0);
});
test('late joiners do not receive false absence rankings',()=>{
 const season={matchDayHistory:[1,2,3].map(n=>day(n,[{playerId:'old_a',matchesPlayed:1},{playerId:'b',matchesPlayed:0}]))};
 const result=build(season,{members:[...members,{id:'late',fullName:'Late',createdAt:'2026-03-01'}],memberId:'late'});
 assert.equal(result.player.attendanceRate,null);assert.equal(result.statements.some(s=>s.key==='low-attendance'),false);
 assert.equal(build(season,{memberId:'b'}).player.attendanceRate,0);
 assert.equal(build(season,{memberId:'b'}).statements.some(s=>s.key==='low-attendance'),true);
});
test('injury status changes count one episode until recovery',()=>{
 const allEvents=['injury_knock','injury_sitting_out','injury_recovered','injury_knock'].map((type,i)=>({id:String(i),type,playerName:'Ace',matchNo:1}));
 assert.equal(build({allEvents}).player.injuryIncidents,2);
});
test('a video leader is not a winner; confirmed awards require matching season and competition',()=>{
 const clip={playerMemberId:'a',activeSeasonId:'S1',matchType:'LEAGUE',type:'skill',likeCount:4};
 assert.equal(build({seasonId:'S1'},{leaders:{skill:{...clip,currentAwardLeader:true}}}).statements[0].text,'Skill of the Season contender');
 assert.deepEqual(build({seasonId:'S1'},{awards:[{...clip,seasonWinner:true},{...clip,activeSeasonId:'S2',type:'goal',seasonWinner:true}]}).statements.map(s=>s.text),['Skill of the Season winner']);
});
