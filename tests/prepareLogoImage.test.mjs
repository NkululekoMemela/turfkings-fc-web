import test from 'node:test';import assert from 'node:assert/strict';
import {prepareLogoImage} from '../src/core/prepareLogoImage.js';
test('PNG, JPG and WebP use one bounded image path and always release their preview URL',async()=>{
 const original={Image:globalThis.Image,document:globalThis.document,create:URL.createObjectURL,revoke:URL.revokeObjectURL};const revoked=[],sizes=[];
 URL.createObjectURL=()=> 'blob:test';URL.revokeObjectURL=url=>revoked.push(url);
 globalThis.Image=class {width=4000;height=2000;async decode(){}};
 globalThis.document={createElement:()=>{const canvas={getContext:()=>({drawImage:()=>{sizes.push([canvas.width,canvas.height]);}}),toDataURL:()=> 'data:image/png;base64,AAAA'};return canvas;}};
 try{for(const type of ['image/png','image/jpeg','image/webp'])assert.match(await prepareLogoImage({type,size:100}),/^data:image\/png/);assert.deepEqual(sizes,[[1024,512],[1024,512],[1024,512]]);assert.equal(revoked.length,3);await assert.rejects(prepareLogoImage({type:'image/svg+xml',size:100}),/PNG/);await assert.rejects(prepareLogoImage({type:'image/png',size:21*1024*1024}),/20 MB/);}finally{globalThis.Image=original.Image;globalThis.document=original.document;URL.createObjectURL=original.create;URL.revokeObjectURL=original.revoke;}
});
