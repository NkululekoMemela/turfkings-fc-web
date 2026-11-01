const test=require('node:test'),assert=require('node:assert/strict');
const {imagePayload,publicImage}=require('../functions/notificationMedia.cjs');
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 512 512"><path fill="green" d="M100 100h300v300H100z"/></svg>';
test('stock logo SVG data URLs and inline SVG retain the exact original artwork',()=>{
 for(const value of ['data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg),'data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64'),svg]){
  const image=imagePayload(value);assert.equal(image.bytes.toString(),svg);assert.equal(image.contentType,'image/svg+xml');assert.equal(image.extension,'svg');
 }
});
test('existing photo formats and HTTPS logos remain supported',async()=>{
 for(const type of ['png','jpeg','webp'])assert.equal(imagePayload(`data:image/${type};base64,YWJj`).bytes.toString(),'abc');
 assert.equal(await publicImage('https://example.com/field.svg'),'https://example.com/field.svg');
});
test('unsafe XML, malformed encodings and oversized images are rejected',()=>{
 for(const value of ['data:image/svg+xml,%xx','<!DOCTYPE svg><svg/>','data:image/svg+xml,'+encodeURIComponent('<!DOCTYPE svg><svg/>'),'data:image/svg+xml,'+encodeURIComponent('<svg><!ENTITY test "x"></svg>'),'data:image/png;base64,'+'a'.repeat(1000001)])assert.equal(imagePayload(value),null);
});
test('stock SVG is published as a real HTTPS image with the correct content type',async()=>{
 const vm=require('node:vm'),fs=require('node:fs');let saved;
 const module={exports:{}};
 const fakeStorage={getStorage:()=>({bucket:()=>({name:'test-bucket',file:name=>({name,getMetadata:async()=>{throw Object.assign(Error('missing'),{code:404});},save:async(bytes,options)=>{saved={name,bytes,options};}})})})};
 vm.runInNewContext(fs.readFileSync(require.resolve('../functions/notificationMedia.cjs'),'utf8'),{module,Buffer,console,require:name=>name==='firebase-admin/storage'?fakeStorage:require(name)});
 const url=await module.exports.publicImage('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg));
 assert.ok(url.startsWith('https://firebasestorage.googleapis.com/v0/b/test-bucket/'));
 assert.ok(saved.name.endsWith('.svg'));assert.equal(saved.bytes.toString(),svg);assert.equal(saved.options.metadata.contentType,'image/svg+xml');
});
