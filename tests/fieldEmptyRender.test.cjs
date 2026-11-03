const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');const {build}=require('esbuild'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
async function component(entry){const r=await build({entryPoints:[path.resolve(__dirname,'../src',entry)],bundle:true,write:false,format:'cjs',platform:'node',packages:'external',loader:{'.css':'empty'},plugins:[{name:'offline',setup(b){b.onResolve({filter:/fieldPageMemory|fieldManifestSubscription|fieldSeasonSquadRepository|firebaseConfig|^firebase\//},a=>({path:a.path,namespace:'offline'}));b.onLoad({filter:/.*/,namespace:'offline'},()=>({contents:'export const fieldPageKey=(...args)=>JSON.stringify(args);export const readFieldPage=()=>null;export const saveFieldPage=()=>{};export const subscribeFieldManifest=()=>()=>{};export const getFieldMatchDaySquads=async()=>({clubs:[]});'}));}}]});const file=path.join(__dirname,'generated-empty.cjs'),m=new Module(file,module);m.filename=file;m.paths=module.paths;m._compile(r.outputFiles[0].text,file);return m.exports.default;}
test('a newly created Field squads page renders safely without teams, players, season or venue metadata',async()=>{
 const Page=await component('pages/VenueSquadsPage.jsx');for(const props of [{venue:{id:'new-field'},season:null},{venue:null,season:undefined},{venue:{id:'new-field'},season:{id:'s',matchDays:{}}}]){
  const html=renderToStaticMarkup(React.createElement(Page,props));assert.match(html,/No upcoming published match day yet/);
 }
});
test('spectator live views retain the Field ribbon while the referee booth keeps its dedicated canvas',async()=>{
 const Frame=await component('components/FieldPageFrame.jsx');const spectator=renderToStaticMarkup(React.createElement(Frame,{venue:{name:'Field'},page:'live'},'Live scores'));assert.match(spectator,/field-ribbon-logo/);assert.match(spectator,/Live scores/);
 const referee=renderToStaticMarkup(React.createElement(Frame,{venue:{name:'Field'},page:'live',refereeMode:true},'Referee controls'));assert.doesNotMatch(referee,/field-ribbon-logo/);assert.match(referee,/Referee controls/);
});
