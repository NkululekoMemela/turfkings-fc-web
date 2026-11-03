const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
const {build}=require('esbuild'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
async function component(entry){const r=await build({entryPoints:[path.resolve(__dirname,'../src/components',entry)],bundle:true,write:false,format:'cjs',platform:'node',packages:'external',plugins:[{name:'offline-map',setup(b){b.onResolve({filter:/HomePage_HUB_GoogleVenueInput|ClubKitColours/},a=>({path:a.path,namespace:'offline'}));b.onLoad({filter:/.*/,namespace:'offline'},()=>({contents:'export default function Map(){return null};export function ClubKitColours(){return "Club kit colours"}'}));}}]});const filename=path.join(__dirname,'generated-profile.cjs'),m=new Module(filename,module);m.filename=filename;m.paths=module.paths;m._compile(r.outputFiles[0].text,filename);return m.exports.default;}
test('shared profile form uses Field labels and full Field names without changing Community Club defaults',async()=>{
 const Form=await component('HomePage_HUB/HomePage_HUB_ClubRegisterForm.jsx'),props={clubDraft:{clubName:'Takkers Canal Walk Field'},onChange:()=>{}};
 const field=renderToStaticMarkup(React.createElement(Form,{...props,entityType:'field',showPlaySchedule:false}));assert.match(field,/Field details/);assert.match(field,/Field name/);assert.match(field,/maxLength="100"/i);assert.doesNotMatch(field,/Club kit colours/);assert.match(field,/Field ID/);
 const club=renderToStaticMarkup(React.createElement(Form,props));assert.match(club,/Club details/);assert.match(club,/Club name/);assert.match(club,/maxLength="16"/i);assert.match(club,/Club kit colours/);
});
test('Field and Club contact verification wording remains scoped to its profile',async()=>{
 const Form=await component('HomePage_HUB/HomePage_HUB_CaptainVerification.jsx'),props={clubDraft:{clubName:'Wynberg MM'},onClubDraftChange:()=>{}};
 assert.match(renderToStaticMarkup(React.createElement(Form,{...props,entityType:'field'})),/Verify Field contact/);assert.match(renderToStaticMarkup(React.createElement(Form,props)),/Verify captain/);
});
test('invalid closing hours render a visible error and invalid input',async()=>{
 const Form=await component('FieldScheduleInputs.jsx');const html=renderToStaticMarkup(React.createElement(Form,{draft:{operatingHours:{Monday:{status:'open',opens:'12:00',closes:'11:00'}}},onChange:()=>{}}));assert.match(html,/role="alert"/);assert.match(html,/Closing time must be after opening time/);assert.match(html,/aria-invalid="true"/);
});
