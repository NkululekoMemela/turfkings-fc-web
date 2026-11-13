const {test}=require("node:test");
const assert=require("node:assert/strict");
const {settings}=require("../functions/yearEndEvent.cjs");
const draft={date:"2099-12-05",arrival:"18:00",program:"19:30",venue:"Haveva",dress:"Smart",player:10000,guest:7500,cooler:18000,bottle:8000,maxGuests:3,capacity:60};
test("event validation retains exact prices, capacity and SAST start time",()=>{
 const event=settings(draft);
 assert.equal(event.player,10000);
 assert.equal(event.maxGuests,3);
 assert.equal(new Date(event.startsAt).toISOString(),"2099-12-05T16:00:00.000Z");
 for(const patch of [{date:"2099-02-30"},{guest:-1},{maxGuests:21},{capacity:0},{arrival:"24:00"}]){
   assert.throws(()=>settings({...draft,...patch}),/Check the event/);
 }
});
