const {context}=require("./kitBulk.cjs");
const {buildClubYearStats}=require("./clubYearStatsPolicy.cjs");
async function handle({db,user,body}){
  const deny=message=>Object.assign(new Error(message),{status:403});
  let ctx;
  try{ctx=await context(db,user,body.clubId);}
  catch{throw deny("Sign in with an active Club captain or administrator account.");}
  if(!ctx.captain)throw deny("Only Club captains and administrators can open this report.");
  if(body.environment==="practice")throw deny("Open Official for yearly Club statistics.");
  const year=Number(body.year);
  if(!Number.isInteger(year)||year<2000||year>2100)
    throw Object.assign(new Error("Choose a valid calendar year."),{status:400});
  const root=db.doc("clubs/"+body.clubId);
  const [stateSnap,membersSnap]=await Promise.all([
    root.collection("state").doc("main").get(),root.collection("members").get()
  ]);
  const stored=stateSnap.data()||{};
  const state=stored.state||stored;
  const members=membersSnap.docs.map(doc=>({...doc.data(),id:doc.id}));
  let report=buildClubYearStats({state,members,year});
  if(!report.recordedDays){
    const seasons=await root.collection("seasons").get();
    const batches=await Promise.all(seasons.docs
      .filter(doc=>!doc.data().isPracticeSeason&&!/^practice/i.test(doc.id))
      .map(async doc=>{
        const rows=await doc.ref.collection("attendance").get();
        return rows.docs.map(row=>({...row.data(),seasonId:doc.id}));
      }));
    report=buildClubYearStats({state,members,year,fallbackRows:batches.flat()});
  }
  return report;
}
module.exports={handle};
