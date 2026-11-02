const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{Module}=require('node:module'),crypto=require('node:crypto');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{transformSync}=require('esbuild');
const file=path.resolve(__dirname,'../src/components/SessionSelector.jsx');
function load(react=React){const m=new Module(file);m.filename=file;m.paths=module.paths;m.require=name=>name==='react'?react:require(name);m._compile(transformSync(fs.readFileSync(file,'utf8'),{loader:'jsx',format:'cjs'}).code,file);return m.exports.default;}
const html=scope=>renderToStaticMarkup(React.createElement(load(),{recordScope:scope}));
test('shared selector preserves the exact audited Club first-render markup',()=>{
 assert.equal(crypto.createHash('sha256').update(html('club')).digest('hex'),'d07c641dbbff4b29815ef9d530529623a286ea739325ab23f155146d46b71e51');
});
test('Field uses exactly the same layout and images, changing only the record scope label',()=>{
 assert.equal(html('Field').replace('official Field records','official club records'),html('club'));
});
const walk=element=>!element||typeof element!=='object'?[]:[element,...React.Children.toArray(element.props?.children).flatMap(walk)];
test('each card calls only its corresponding session handler; busy blocks both cards',()=>{
 let official=0,practice=0;
 const Component=load({...React,useState:()=>[null,()=>{}],useEffect:()=>{}});
 const tree=Component({onOfficial:()=>official++,onPractice:()=>practice++,busy:true});
 const buttons=walk(tree).filter(e=>e.type==='button');assert.equal(buttons.length,2);
 assert.equal(buttons.every(e=>e.props.disabled),true);
 buttons[0].props.onClick();assert.equal(official,1);assert.equal(practice,0);
 buttons[1].props.onClick();assert.equal(official,1);assert.equal(practice,1);
});
test('both surfaces share the original timed emphasis sequence and cancel timers when leaving',t=>{
 const scheduled=[],cleared=[],changes=[];let effect;
 const previous=global.window;global.window={setTimeout:(fn,ms)=>{scheduled.push([fn,ms]);return ms;},clearTimeout:id=>cleared.push(id)};
 t.after(()=>{if(previous===undefined)delete global.window;else global.window=previous;});
 load({...React,useState:()=>[null,value=>changes.push(value)],useEffect:fn=>{effect=fn;}})({});
 const cleanup=effect();assert.deepEqual(scheduled.map(([,ms])=>ms),[4000,6000,8000,10000,12000,14000]);
 scheduled.forEach(([fn])=>fn());assert.deepEqual(changes,['official','practice','official','practice','official',null]);
 cleanup();assert.deepEqual(cleared,scheduled.map(([,ms])=>ms));
});
