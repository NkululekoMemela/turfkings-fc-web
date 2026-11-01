const test=require('node:test'),assert=require('node:assert/strict');const {fixture}=require('./helpers/playerWorkflowFirestore.cjs');const {save}=require('../functions/clubMatchNumbers.cjs');
const user={uid:'admin',email_verified:true},body={clubId:'club',seasonId:'season',teamId:'A',teamKind:'league',playerKey:'p1',number:22};
function setup(){return fixture({'clubs/club':{ownerUid:'admin'},'clubs/club/state/main':{state:{activeSeasonId:'season',unrelated:{scores:[7,2]},seasons:[{seasonId:'season',teams:[{id:'A',players:['p1','p2']}],fiveVFiveTeams:[{id:'friendly',players:['p1','p2']}]}]}},'clubs/club/publicPlayers/p1':{fullName:'Alex One',jerseyNumber:8},'clubs/club/publicPlayers/p2':{fullName:'Bea Two',jerseyNumber:23},'clubs/club/members/captain':{uid:'captain',status:'active',role:'captain'},'clubs/club/members/player':{uid:'player',status:'active',role:'player'}});}
test('a confirmed number edit persists directly on an already-set team, without resaving squads or changing profiles',async()=>{
 const f=setup(),result=await save({db:f.db,user,body});assert.equal(result.saved,true);const state=f.records.get('clubs/club/state/main').state;assert.equal(state.seasons[0].teams[0].kitNumbers.p1.number,22);assert.deepEqual(state.unrelated,{scores:[7,2]});assert.equal(f.records.get('clubs/club/publicPlayers/p1').jerseyNumber,8);assert.equal(state.updatedAt,result.updatedAt);
 const readAgain=f.records.get('clubs/club/state/main').state.seasons[0].teams[0];assert.equal(readAgain.kitNumbers.p1.number,22);
});
test('captains can correct numbers, while ordinary users, removed captains, camera accounts and stale seasons cannot',async()=>{
 const f=setup();await save({db:f.db,user:{uid:'captain',email_verified:true},body});
 for(const who of [{uid:'player',email_verified:true},{uid:'outsider',email_verified:true},{...user,cameraSession:true},{uid:'admin'}])await assert.rejects(save({db:f.db,user:who,body}));
 f.records.get('clubs/club/members/captain').status='removed';await assert.rejects(save({db:f.db,user:{uid:'captain',email_verified:true},body}));await assert.rejects(save({db:f.db,user,body:{...body,seasonId:'old'}}),/season changed/);
});
test('duplicate numbers, foreign player keys, invalid inputs and Practice writes leave the roster unchanged',async()=>{
 const f=setup(),before=JSON.stringify([...f.records]);for(const change of [{number:23},{playerKey:'outside'},{number:'abc'},{environment:'practice'},{scope:{environment:'practice'}}])await assert.rejects(save({db:f.db,user,body:{...body,...change}}));assert.equal(JSON.stringify([...f.records]),before);
});
test('friendly overrides remain separate and both real zero and an explicit blank survive confirmation',async()=>{
 const f=setup();await save({db:f.db,user,body:{...body,teamKind:'friendly',teamId:'friendly',number:0}});let state=f.records.get('clubs/club/state/main').state;assert.equal(state.seasons[0].fiveVFiveTeams[0].kitNumbers.p1.number,0);assert.equal(state.seasons[0].teams[0].kitNumbers,undefined);await save({db:f.db,user,body:{...body,number:null}});state=f.records.get('clubs/club/state/main').state;assert.equal(state.seasons[0].teams[0].kitNumbers.p1.number,null);
});
