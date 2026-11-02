const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync(require('node:path').join(__dirname,'../src/App.jsx'),'utf8');
const start=app.indexOf('        const directDestination=notificationDestination(data);'),end=app.indexOf('        if (data.type === "pool_alert")',start);
assert(start>=0&&end>start);
for(const [type,expected]of [['club_story','news'],['club_poll','news'],['match_day_cancelled','signup'],['match_ticket_available','signup']])test(`cold-launch ${type} keeps its exact destination instead of the administrator Entry route`,async()=>{
 const {notificationDestination}=await import('../src/core/notificationDestination.mjs');
 const state={},ref={current:false},data={type,clubId:'other',storyId:'story',pollId:'poll',creditId:'credit',matchDayId:'week'};
 const context={data,notificationDestination,nativeStartupRoutedRef:ref,activeClubId:'current',Date,PAGE_NEWS:'news',PAGE_MATCH_SIGNUP:'signup',buildClubIdentity:x=>x};
 for(const name of ['setNativeStartupReady','setNativeChatOpenRequest','setSessionMode','writeSessionModeIntent','setShowSessionSelector','setSelectedHomeClub','setNativeTicketOpenRequest','setNativePollOpenRequest','setPage'])context[name]=value=>state[name]=value;
 vm.runInNewContext('(function(){'+app.slice(start,end)+'})()',context);
 assert.equal(ref.current,true);assert.equal(state.setNativeStartupReady,true);assert.equal(state.setPage,expected);assert.equal(state.setSessionMode,'official');assert.equal(state.setShowSessionSelector,false);assert.equal(state.setSelectedHomeClub.id,'other');
 assert.equal(expected==='news'?state.setNativePollOpenRequest.storyId:state.setNativeTicketOpenRequest.creditId,expected==='news'?'story':'credit');
});
