import {test} from "node:test";
import assert from "node:assert/strict";
import {clubKitColours} from "../src/core/clubKitColours.mjs";
test("club creation and club details require two valid persistent colours",()=>{
 assert.deepEqual(clubKitColours({homeColor:"#15803D",awayColor:"#FFFFFF"}),{homeColor:"#15803d",awayColor:"#ffffff"});
 for(const draft of [{},{homeColor:"Red",awayColor:"#fff"},{homeColor:"url(unsafe)",awayColor:"#ffffff"}])assert.throws(()=>clubKitColours(draft));
});
