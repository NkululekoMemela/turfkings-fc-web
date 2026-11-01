import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
for(const timezone of ['Africa/Johannesburg','UTC','America/Los_Angeles']){
 test(`stories publish now during morning and around midnight in ${timezone}`,()=>{
  execFileSync(process.execPath,['--input-type=module','-e',`
   import assert from 'node:assert/strict';
   import {storyDateInput,storyPublicationTime} from './src/core/storyPublication.mjs';
   for(const hour of [0,3,11,13,23]){
    const now=new Date(2026,10,1,hour,15).getTime();
    assert.equal(storyDateInput(now),'2026-11-01');
    assert.equal(storyPublicationTime('2026-11-01',now),now);
    assert.equal(storyPublicationTime('2026-11-02',now),new Date(2026,10,2).getTime());
    assert(storyPublicationTime('2026-10-31',now)<now);
    assert.equal(storyPublicationTime('2026-02-30',now),now);
    assert.equal(storyPublicationTime('',now),now);
   }
  `],{cwd:new URL('..',import.meta.url),env:{...process.env,TZ:timezone}});
 });
}
