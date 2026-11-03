// Keep discovery complete; isolate frequently used HTTP targets on cold start.
const targets={kitShop:"./kitShopHttp.cjs",companyClubs:"./companyClubsHttp.cjs"};
module.exports=require(targets[process.env.FUNCTION_TARGET]||"./index.js");
