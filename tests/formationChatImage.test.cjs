const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{Module}=require('node:module'),{transformSync}=require('esbuild');
function setup(){const auth={currentUser:{uid:'user',emailVerified:true}},objects=new Map(),writes=[];
 const sdk={ref:(_s,p)=>({path:p}),getDownloadURL:async r=>{if(objects.has(r.path))return objects.get(r.path);const e=Error('Missing');e.code='storage/object-not-found';throw e;},uploadString:async(r,data,format,metadata)=>{writes.push({path:r.path,data,format,metadata});objects.set(r.path,'https://firebasestorage.googleapis.com/v0/b/bucket/o/'+encodeURIComponent(r.path));}};
 const file=path.resolve(__dirname,'../src/storage/formationChatImage.js'),m=new Module(file);m.filename=file;m.paths=module.paths;m.require=n=>n==='firebase/storage'?sdk:{auth,storage:{}};m._compile(transformSync(fs.readFileSync(file,'utf8'),{loader:'js',format:'cjs'}).code,file);return {auth,writes,upload:m.exports.uploadFormationChatImage};
}
const draft={kind:'formation',clipId:'image-one',venueId:'field',ownerUid:'user',environment:'official',imageData:'data:image/png;base64,AAAA',matchId:'formation__season__w1',title:'Club · 2026-11-01'};
test('the shared card becomes a dated image attachment with no inline image data in the message',async()=>{
 const f=setup(),image=await f.upload(draft,'field');assert.equal(f.writes.length,1);assert.equal(f.writes[0].path,'leagueVenues/field/chatImages/user/image-one.png');assert.equal(image.kind,'formation');assert.equal(image.title,draft.title);assert.equal(image.imageData,undefined);assert.equal(image.ownerUid,undefined);await f.upload(draft,'field');assert.equal(f.writes.length,1);
});
test('Practice, wrong account, wrong venue and oversized images cannot upload into Official chat',async()=>{
 for(const patch of [{environment:'practice'},{ownerUid:'other'},{venueId:'other'},{imageData:'data:image/png;base64,'+'A'.repeat(1300000)},{clipId:'../wrong'}]){const f=setup();await assert.rejects(f.upload({...draft,...patch},'field'));assert.equal(f.writes.length,0);}
});
