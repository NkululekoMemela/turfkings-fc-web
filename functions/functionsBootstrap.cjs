// Discovery and existing functions keep the original entry point.
// Shop instances load only the HTTP endpoint needed for their target.
module.exports = process.env.FUNCTION_TARGET === "kitShop" ?
  require("./kitShopHttp.cjs") : require("./index.js");
