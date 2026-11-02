import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
function guard(practice,season){
 const file=practice?'FieldPracticePage.jsx':'VenueEntryPage.jsx',source=fs.readFileSync(new URL('../src/pages/'+file,import.meta.url),'utf8');
 const start=practice?'  async function startMatch() {':'        onStartMatch={async () => {';
 const body=source.slice(source.indexOf(start)+start.length);
 const prefix=body.slice(0,body.indexOf(practice?'    setBusy(true);':'          if (fieldStartPendingRef.current)'));
 const messages=[],pages=[];
 const deps={busy:false,expired:false,liveMatch:null,season,venueSeason:season,fieldSeasonNeedsAnnouncement:s=>!s?.announcedAtMs,fieldAlert:async s=>messages.push(s),setPage:s=>pages.push(s),setVenuePage:s=>pages.push(s)};
 const run=new Function(...Object.keys(deps),'return async()=>{'+prefix+'return "start";}')(...Object.values(deps));
 return {run,messages,pages};
}
for(const practice of [true,false])test(`${practice?'Practice':'Official'} Start Match explains the missing season without opening setup or navigating`,async()=>{
 for(const season of [null,{id:'draft',status:'active'}]){const h=guard(practice,season);assert.equal(await h.run(),undefined);assert.deepEqual(h.messages,['Start the league first, then start its first match.']);assert.deepEqual(h.pages,[]);}
 const ready=guard(practice,{id:'season',announcedAtMs:123});assert.equal(await ready.run(),'start');assert.equal(ready.messages.length,0);
});
