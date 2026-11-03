const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
const {build}=require('esbuild'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
async function component(entry){
 const result=await build({entryPoints:[path.resolve(__dirname,'../src',entry)],bundle:true,write:false,format:'cjs',platform:'node',packages:'external',loader:{'.css':'empty'},plugins:[{name:'offline-repositories',setup(b){
 b.onResolve({filter:/venueLiveMatchRepository|venueVideoHighlightsRepository|firebaseConfig|^firebase\/firestore$/},a=>({path:a.path,namespace:'offline'}));
 b.onLoad({filter:/.*/,namespace:'offline'},()=>({contents:'export const db={};export const getVenueLiveMatchDoc=()=>({});export const onSnapshot=()=>()=>{};export const subscribeToMatchHighlights=()=>()=>{};'}));
 }}]});
 const m=new Module(path.join(__dirname,'generated.cjs'),module);m.filename=path.join(__dirname,'generated.cjs');m.paths=module.paths;m.require=id=>id==='react-dom'?{createPortal:node=>node}:require(id);m._compile(result.outputFiles[0].text,m.filename);return m.exports.default;
}
test('Field spectator page renders live and final score without referee runtime dependencies',async()=>{
 const Page=await component('pages/VenueLeagueSpectatorPage.jsx');
 const props={venue:{id:'field'},season:{id:'season'},teams:[{id:'a',name:'Alpha'},{id:'b',name:'Beta'}]};
 const live=renderToStaticMarkup(React.createElement(Page,{...props,currentLive:{status:'live',teamAId:'a',teamBId:'b',secondsLeft:600,currentEvents:[{type:'goal',teamId:'a',scorer:'One'}]}}));
 assert.match(live,/LIVE MATCH/);assert.match(live,/1 – 0/);assert.match(live,/Alpha/);assert.match(live,/10:00/);
 const final=renderToStaticMarkup(React.createElement(Page,{...props,season:{results:[{status:'completed',fixtureId:'f',teamAId:'a',teamBId:'b',goalsA:3,goalsB:2,completedAtMs:Date.now()}]}}));
 assert.match(final,/FULL TIME/);assert.match(final,/3 – 2/);
 assert.doesNotThrow(()=>renderToStaticMarkup(React.createElement(Page,{venue:{id:'field'},season:null,teams:null})));
});
test('digital referee cards render the issued colour and accessible close action',async()=>{
 const Card=await component('components/DigitalRefereeCard.jsx');
 const oldDocument=global.document;global.document={body:{}};try{
 for(const type of ['yellow_card','red_card']){const html=renderToStaticMarkup(React.createElement(Card,{card:{type,name:'(6) One'},onClose:()=>{}}));assert.match(html,/Close referee card/);assert.match(html,type==='red_card'?/RED CARD/:/YELLOW CARD/);assert.match(html,/\(6\) One/);}
 assert.equal(renderToStaticMarkup(React.createElement(Card,{})),'');
 }finally{global.document=oldDocument;}
});
