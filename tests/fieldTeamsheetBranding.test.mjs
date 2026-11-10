import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {fieldTeamsheetColour} from "../src/core/fieldTeamsheetColour.mjs";

test("Field teamsheets use the assigned fixture colour and avoid guessing from a mixed roster", () => {
  assert.equal(fieldTeamsheetColour({matchColour:"navy blue", kitPlayers:[{bibColor:"Red"}]}), "Navy blue");
  assert.equal(fieldTeamsheetColour({kitPlayers:[{bibColor:"Blue"}, {matchBib:{color:"#0000ff"}}]}), "Blue");
  assert.equal(fieldTeamsheetColour({kitPlayers:[{bibColor:"Blue"}, {bibColor:"Red"}]}), "");
});

test("an Android logo blocked by browser CORS is embedded from the native response", async (t) => {
  const url = "https://firebasestorage.googleapis.com/v0/b/example/o/field.svg?alt=media";
  let requested;
  t.mock.method(globalThis, "fetch", async () => {throw new TypeError("Failed to fetch");});
  globalThis.__getTeamsheetLogo = async options => {
    requested = options;
    return {status:200,headers:{"Content-Type":"image/svg+xml; charset=UTF-8"},data:"PHN2Zy8+"};
  };
  t.after(() => {delete globalThis.__getTeamsheetLogo;});
  const bundle = await build({
    entryPoints:["src/core/fieldTeamsheetExport.mjs"],
    format:"esm",bundle:true,write:false,external:["html-to-image","./saveFieldExport.js"],
    plugins:[{name:"native-logo-boundary",setup(builder){
      builder.onResolve({filter:/^@capacitor\/core$/}, () => ({path:"native",namespace:"test"}));
      builder.onLoad({filter:/^native$/,namespace:"test"}, () => ({
        contents:"export const Capacitor={isNativePlatform:()=>true}; export const CapacitorHttp={get:opts=>globalThis.__getTeamsheetLogo(opts)};"
      }));
    }}],
  });
  const {embedTeamsheetLogo} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
  assert.equal(await embedTeamsheetLogo(url), "data:image/svg+xml;base64,PHN2Zy8+");
  assert.equal(requested.url, url);
  assert.equal(requested.responseType, "arraybuffer");
  await assert.rejects(embedTeamsheetLogo("http://localhost/pwa/icon.png"), TypeError);
});
