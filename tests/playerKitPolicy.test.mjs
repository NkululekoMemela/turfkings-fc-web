import test from "node:test";
import assert from "node:assert/strict";
import {buildKitRoster,validateKitTeams,numberForName,jerseyNumber,kitRosterSignature} from "../functions/playerKitPolicy.mjs";
const row=(key,number,extra={})=>({key,name:key,number,...extra});
const team=(id,players)=>({id,label:id,players});
test("zero is a real number; blanks are unassigned and malformed numbers are rejected",()=>{
 assert.equal(jerseyNumber(0),0);assert.equal(jerseyNumber("000"),0);assert.equal(jerseyNumber(""),null);
 for(const input of [-1,"1.5","1e2",1000,"#4",false])assert.throws(()=>jerseyNumber(input));
});
test("duplicates are rejected within a team, including zero, but allowed across opponents",()=>{
 assert.throws(()=>validateKitTeams([team("A",[row("one",0),row("two","0")])]),/#0/);
 assert.throws(()=>validateKitTeams([team("A",[row("one",8),row("two","08")])]),/#8/);
 assert.equal(validateKitTeams([team("A",[row("one",8)]),team("B",[row("two",8)])]).length,2);
});
test("captains can leave unresolved numbers, referees must record a real kit exception",()=>{
 const draft=[team("A",[row("one",null),row("two",null)])];
 assert.doesNotThrow(()=>validateKitTeams(draft));assert.throws(()=>validateKitTeams(draft,{referee:true}),/Verify one/);
 const checked=[team("A",[row("one",null,{noNumberReason:"inside_out"}),row("two",null,{noNumberReason:"no_bib"})])];
 assert.equal(validateKitTeams(checked,{referee:true})[0].players[0].number,null);
 assert.throws(()=>validateKitTeams([team("A",[row("one",null,{noNumberReason:"anything"})])],{referee:true}));
});
test("captain match overrides preserve zero and explicit blank; profile changes do not replace them",()=>{
 const profiles=[{id:"ace",fullName:"Alex Player",shortName:"Ace",jerseyNumber:9}];
 const seeded=buildKitRoster([{id:"A",players:["ace"]}],profiles);assert.equal(seeded[0].players[0].number,9);
 assert.equal(buildKitRoster([{id:"A",players:["ace"],kitNumbers:{ace:{number:0}}}],profiles)[0].players[0].number,0);
 assert.equal(buildKitRoster([{id:"A",players:["ace"],kitNumbers:{ace:{number:null}}}],profiles)[0].players[0].number,null);
 assert.equal(profiles[0].jerseyNumber,9);
});
test("Field submitted numbers take precedence over the player's current profile",()=>{
 const data=buildKitRoster([{id:"club",players:[{id:"ace",sourcePlayerId:"ace",fullName:"Alex Player",jerseyNumber:4}]}],[{id:"ace",fullName:"Alex Player",jerseyNumber:9}]);
 assert.equal(data[0].players[0].number,4);
});
test("lineup guest and bench players are included once; identity aliases resolve renamed players",()=>{
 const teams=buildKitRoster([{id:"A",players:["ace"]}],[{id:"ace",fullName:"Alex Player",aliases:["Old Name"],jerseyNumber:0}],{A:{positions:{p1:"Old Name"},benchSnapshot:["Guest"],guestPlayers:["Guest"]}});
 assert.equal(teams[0].players.length,2);assert.equal(numberForName(teams,"Old Name","A"),"#0");
 assert.equal(numberForName(teams,"Guest","A"),"No number");
});
test("ambiguous names never receive another player's number",()=>{
 const teams=buildKitRoster([{id:"A",players:["one"]},{id:"B",players:["two"]}],[{id:"one",fullName:"Same Name",jerseyNumber:4},{id:"two",fullName:"Same Name",jerseyNumber:9}]);
 assert.equal(numberForName(teams,"Same Name"),"");assert.equal(numberForName(teams,"Same Name","B"),"#9");
});
test("a roster change invalidates verification while number changes do not change player identity",()=>{
 const a=[team("A",[row("one",4)])],b=[team("A",[row("one",5)])],c=[team("A",[row("two",4)])];
 assert.equal(kitRosterSignature(a),kitRosterSignature(b));assert.notEqual(kitRosterSignature(a),kitRosterSignature(c));
});
