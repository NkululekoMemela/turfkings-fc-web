const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{Module}=require('node:module'),React=require('react'),{transformSync}=require('esbuild');
const walk=e=>!e||typeof e!=='object'?[]:[e,...React.Children.toArray(e.props?.children).flatMap(walk)];
function setup(t,confirm){let tree,removed=0;const before=global.document;global.document={activeElement:{focus(){}},createElement:()=>({remove(){removed++;}}),body:{appendChild(){}},addEventListener(){},removeEventListener(){}};t.after(()=>{if(before===undefined)delete global.document;else global.document=before;});
 const file=path.resolve(__dirname,'../src/components/FieldOfficialStartPrompt.jsx'),m=new Module(file);m.filename=file;m.paths=module.paths;m.require=name=>name==='react'?React:name==='react-dom/client'?{createRoot:()=>({render:e=>{tree=e;},unmount(){}})}:name.endsWith('FieldDialog.jsx')?{fieldConfirm:confirm}:require(name);m._compile(transformSync(fs.readFileSync(file,'utf8'),{loader:'jsx',format:'cjs'}).code,file);
 const promise=m.exports.chooseFieldOfficialStart('2099-01-01T18:00');return {promise,buttons:walk(tree).filter(e=>e.type==='button'),removed:()=>removed};
}
test('Official cannot proceed without the second confirmation; declining still allows Practice',async t=>{
 let checked=0;const f=setup(t,async message=>{checked++;assert.match(message,/Official record/);assert.match(message,/changed match date/);assert.match(message,/choose Practice/);return false;});let resolved=false;f.promise.then(()=>resolved=true);
 await f.buttons[1].props.onClick();assert.equal(checked,1);assert.equal(resolved,false);f.buttons[0].props.onClick();assert.equal(await f.promise,'practice');
});
test('confirming the guard returns Official once',async t=>{const f=setup(t,async()=>true);await f.buttons[1].props.onClick();assert.equal(await f.promise,'official');assert.equal(f.removed(),1);});
test('Cancel never requests Official confirmation or starts a match',async t=>{const f=setup(t,()=>{throw Error('must not confirm');});f.buttons[2].props.onClick();assert.equal(await f.promise,'cancel');});
