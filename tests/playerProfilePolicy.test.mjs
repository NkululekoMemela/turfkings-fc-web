import test from "node:test";
import assert from "node:assert/strict";
import {ownsPlayerProfile, parseJerseyNumber, validatePlayerProfile} from "../src/core/playerProfilePolicy.mjs";
test("membership ownership requires verification and rejects a different bound UID", () => {
  const user = {uid:"one",email:"me@example.com",emailVerified:true};
  assert.equal(ownsPlayerProfile({uid:"two",email:user.email},user), false);
  assert.equal(ownsPlayerProfile({email:user.email},user), true);
  assert.equal(ownsPlayerProfile({uid:"one"},{...user,emailVerified:false}), false);
});
test("zero is a number; empty is unassigned; malformed numbers are rejected", () => {
  assert.equal(parseJerseyNumber("0"),0);
  assert.equal(parseJerseyNumber(""),null);
  assert.equal(parseJerseyNumber(null),null);
  assert.equal(parseJerseyNumber("07"),7);
  for (const value of ["-1","1.5","#","1000","7e1"]) assert.throws(() => parseJerseyNumber(value));
});
test("profile fields cannot inject roles, membership status or ownership", () => {
  const patch=validatePlayerProfile({fullName:" A Player ",shortName:" A ",jerseyNumber:"9",role:"admin",uid:"someone",status:"active"});
  assert.equal(patch.fullName,"A Player"); assert.equal(patch.jerseyNumber,9);
  for (const key of ["role","uid","status"]) assert.equal(key in patch,false);
});
