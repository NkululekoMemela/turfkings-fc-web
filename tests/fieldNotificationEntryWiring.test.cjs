const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync(require('node:path').join(__dirname,'../src/App.jsx'),'utf8');
const anchor='            setFieldNavTarget({\n              page: ["field_chat"';
const start=app.indexOf(anchor),end=app.indexOf('            });',start)+'            });'.length;
assert(start>=0&&end>start);
for(const type of ['field_chat','field_club_chat','field_story'])test(`Field tap ${type} carries recipient context independently of the sender`,()=>{
 let target;
 vm.runInNewContext(app.slice(start,end),{data:{type,clubId:'message-club'},venueId:'field',activeClubId:'my-club',identity:{memberId:'my-member'},Date,setFieldNavTarget:value=>target=value});
 if(type==='field_story'){assert.equal(target.entryRequest,null);return;}
 assert.equal(target.page,'chat');assert.equal(target.entryRequest.preferredClubId,'my-club');assert.equal(target.entryRequest.preferredMemberId,'my-member');assert.equal(target.entryRequest.privateClubId,type==='field_chat'?'':'message-club');assert.equal(target.entryRequest.venueId,'field');
});
