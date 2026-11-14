const test=require("node:test"),assert=require("node:assert/strict");
const {fixture}=require("./helpers/playerWorkflowFirestore.cjs");
const {handle}=require("../functions/companyClubs.cjs");
const {weeksFor}=require("../functions/companyWeeklyBookings.cjs");
const {createHash}=require("node:crypto"),hash=s=>createHash("sha256").update(s).digest("hex");
const player={uid:"player",email:"p@example.com",email_verified:true},operator={uid:"ops",email:"nkululekolerato@gmail.com",email_verified:true};
const schedule={playDay:"Wednesday",timezone:"Africa/Johannesburg",playTime:"17:30"};
const org="companyOrganizations/acme",club="clubs/acme-fc";
function setup(){
 const f=fixture({
 [org]:{status:"active",name:"Acme",clubIds:["acme-fc"],roles:{coordinator:["company_admin"]}},
 [club]:{clubType:"company",companyId:"acme",schedule},
 [club+"/members/player"]:{uid:"player",playerId:"p1",status:"active"},
 [club+"/members/other"]:{uid:"other",playerId:"p2",status:"active"},
 });
 const run=(action,fields={},user=player)=>handle({db:f.db,user,body:{action,clubId:"acme-fc",...fields}});
 return {...f,run};
}
test("a company booking is eligible immediately without a personal receipt or public staff number",async()=>{
 const {run,records}=setup(),week=weeksFor(schedule)[0],body={week,staffNumber:"EMP-001",booked:true};
 await run("weeklyBooking",body);
 await run("weeklyBooking",body);
 const path=club+"/matchSignups/company_"+hash(player.uid),row=records.get(path);
 assert.deepEqual(row.paidWeeks,[week]);assert.equal(row.paymentActuallyReceived,false);
 assert.equal(row.paymentMethod,"company_invoice");assert.equal(row.staffNumber,undefined);
 await assert.rejects(run("weeklyBooking",body,{...player,uid:"other"}),/already registered/);
 await assert.rejects(run("weeklyBooking",{...body,isPracticeMode:true}),/Official/);
 await run("weeklyBooking",{...body,booked:false});
 assert.deepEqual(records.get(path).paidWeeks,[]);
});
test("invoices use verified attendance selections, deduplicate staff per day and record settlement separately",async()=>{
 const {run,records}=setup();
 records.set(org+"/staffNumbers/"+hash("player"),{staffNumber:"EMP-001"});
 records.set(org+"/staffNumbers/"+hash("other"),{staffNumber:"EMP-002"});
 const row={createdAt:"2026-09-23T17:00:00Z",results:[{}],playerAppearances:[{playerId:"p1",matchesPlayed:1},{playerId:"p2",matchesPlayed:0}]};
 records.set(club+"/state/main",{state:{seasons:[{matchDayHistory:[row],friendlyMatchDayHistory:[row]}]}});
 const month="2026-09";
 await assert.rejects(run("weeklyInvoicePreview",{month}),/billing access/);
 const {candidates}=await run("weeklyInvoicePreview",{month},operator);
 assert.equal(candidates.length,1);
 const issue={month,lineIds:[candidates[0].id],unitMinor:6500,confirmed:true};
 const {invoice}=await run("weeklyInvoiceIssue",issue,operator);
 assert.equal(invoice.totalMinor,6500);assert.equal(invoice.status,"issued");
 assert.equal((await run("weeklyInvoiceIssue",issue,operator)).invoice.id,invoice.id);
 const coordinator={...player,uid:"coordinator"};
 assert.equal((await run("weeklyInvoiceView",{month},coordinator)).invoice.lines[0].staffNumber,"EMP-001");
 await assert.rejects(run("weeklyInvoicePaid",{month,reference:"EFT-22"},coordinator),/Only FANM/);
 assert.equal((await run("weeklyInvoicePaid",{month,reference:"EFT-22"},operator)).invoice.status,"paid");
});
