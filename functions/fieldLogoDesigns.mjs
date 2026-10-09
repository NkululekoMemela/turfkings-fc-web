// Shared scalable artwork: no image generation API or external fonts.
export const MASCOTS = ["lion", "eagle", "wolf", "panther", "stag", "springbok", "phoenix", "elephant", "falcon", "stadium", "football", "pitch", "goal", "floodlights", "arena", "terraces", "boots", "whistle", "trophy", "centre-circle", "corner-flag", "field-pin", "matchday", "stadium-arch", "football-crown"];
export const FRAMES = ["shield", "open", "round", "diamond", "arch", "soft-shield", "oval"];
export const PALETTES = [
  ["Electric emerald", "#063c32", "#28edaa", "#ffffff"],
  ["Royal blue", "#091e55", "#398bff", "#ffffff"],
  ["Scarlet & platinum", "#570a23", "#ff385d", "#ffffff"],
  ["Amethyst", "#25104e", "#ac68ff", "#ffffff"],
  ["Ocean cyan", "#073644", "#18dded", "#ffffff"],
  ["Midnight & gold", "#141b2b", "#ffc83d", "#ffffff"],
];
export const NAME_STYLES = ["auto", "ring", "banner", "stacked", "top", "inside"];
export const DESIGN_COUNT = MASCOTS.length * FRAMES.length * PALETTES.length * 2;
// Keep the first ten identities compatible; add fifteen football-led identities.
function decode(index) {
  const n=MASCOTS.length, f=FRAMES.length;
  return {mascot:MASCOTS[index%n],frame:FRAMES[Math.floor(index/n)%f],palette:Math.floor(index/(n*f))%6,ornament:Math.floor(index/(n*f*6))};
}
function encode(s) {return MASCOTS.indexOf(s.mascot)+MASCOTS.length*(FRAMES.indexOf(s.frame)+FRAMES.length*(s.palette+6*s.ornament));}
const opening=Array.from({length:25},(_,i)=>{
  if(i<10) {
    const j=(i*137)%600;
    return {mascot:MASCOTS[j%10],frame:FRAMES[Math.floor(j/10)%5],palette:Math.floor(j/50)%6,ornament:Math.floor(j/300)};
  }
  const frames=["round","soft-shield","arch","oval","soft-shield","open","round","oval","shield","round","arch","open","soft-shield","arch","oval"];
  return {mascot:MASCOTS[i],frame:frames[i-10],palette:(i-10)%6,ornament:0};
});
const openingIds=new Set(opening.map(encode));
const remaining=Array.from({length:DESIGN_COUNT},(_,i)=>(i*137)%DESIGN_COUNT).filter(i=>!openingIds.has(i));
export function stockSpec(sequence) {
  if(!Number.isInteger(sequence)||sequence<0||sequence>=DESIGN_COUNT) throw new Error("Design collection exhausted.");
  return sequence<25 ? {...opening[sequence]} : decode(remaining[sequence-25]);
}
export function validSpec(s) {
  return Boolean(s && MASCOTS.includes(s.mascot) && FRAMES.includes(s.frame) && Number.isInteger(s.palette) && s.palette >= 0 && s.palette < PALETTES.length && [0, 1].includes(s.ornament)
    && (s.nameStyle === undefined || NAME_STYLES.includes(s.nameStyle))
    && (s.lettering === undefined || ["full", "initials", "custom"].includes(s.lettering))
    && (s.shortName === undefined || typeof s.shortName === "string" && s.shortName.length <= 24));
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]));
// Organic silhouettes, negative space and fine engraved contours.
const artwork = {
  lion: `<path fill="url(#metal)" d="M293 99c-42-22-101-8-128 26-30 12-52 41-53 72-28 27-28 67-9 91-11 32 6 69 38 80 12 35 51 53 83 40 29 22 66 18 86-7 37-3 65-27 72-58-27 15-52 3-57-18l-7-29 27-24 30-6 8-20-22-18 6-20-25-16-11-32-20-10z"/>
    <path fill="url(#ink)" d="M270 117c-44-7-73 12-79 37-39 6-60 35-47 66-31 21-36 54-15 82-9 31 16 60 43 61 13 26 35 31 58 17 25 15 41 10 57-8-34 4-58-17-65-43-22-11-32-33-21-54-29-13-32-41-11-59-14-29-1-58 28-65 8-16 22-26 52-34z"/>
    <path fill="#fff" d="M288 144c-16-3-29 8-30 22l18 16 18-10 10 20 33 10-18 16 13 12 25 13-5 9-36 3-14 18-23-10-22-3c-16-23-18-47-7-68l-19-23 22-20z"/>
    <path fill="url(#ink)" d="M298 192l23 7-16 8-10-4zM336 236l18 6-9 8-15-4z"/>
    <path d="M170 149c-30 29-33 60-14 91m-24 19c-12 32 0 55 25 66m26 10c9 21 26 32 42 27M227 175c-24 15-32 37-21 63m11 21c-13 16-10 39 10 55m16 9c4 18 16 31 33 34M279 278c13 7 22 6 33-1M292 290c7 13 17 19 31 18"/>
    <path d="M169 185l-11 29m-23 64 9 23m44 48 16 11M235 184l-10 22m10 74 4 18" stroke="#fff" stroke-opacity=".5"/>`,
  wolf: `<path fill="url(#metal)" d="M150 194q-14-44-7-85 2-13 14-6c23 12 44 28 63 49 31-9 59-9 86 0l31-45q10-14 16 0c11 27 17 51 10 77 20 17 34 36 39 60q-29 6-53 26c-15 14-20 41-38 57q-10 38-32 65-18 21-37 3l-34-28-27-17c-22-32-32-73-31-103q-21-8-39-26z"/>
    <path fill="url(#ink)" d="M158 128l16 68 43-22zM344 132l-29 45 39 10zM169 229l65 4-38 34-39-9zM311 231l52-18-20 42-29 14z"/>
    <path fill="#fff" d="M252 166l-23 79-29 48 42 58 17 47 26-36 13-57 20-22-25-45-17-63z"/>
    <path fill="url(#ink)" d="M241 297l43-4 15 15-30 28-24-16z"/>
    <path d="M266 333l-4 25m-18-11 18 11 19-10M193 184l-13 29m17 62-8 36 23 28M312 187l22 12m-4 82-12 34M164 269l14 45m41 46 19 25"/>
    <path d="M199 241l15-5m120-10-11 10M246 198l-10 36" stroke="#fff" stroke-width="4"/>`,
  panther: `<path fill="url(#metal)" d="M174 151c-17-41-63-38-66-1-2 22 10 35 34 34l-11 38c8 21 24 30 37 43l12 59 76 77 76-77 12-59c13-13 29-22 37-43l-11-38c24 1 36-12 34-34-3-37-49-40-66 1-53-29-111-29-164 0z"/>
    <path fill="url(#ink)" d="M171 169c-9-23-28-25-30-10-2 10 11 15 30 10M341 169c9-23 28-25 30-10 2 10-11 15-30 10M170 194c25 0 42 11 59 30l-36-2-16-11zM342 194c-25 0-42 11-59 30l36-2 16-11z"/>
    <path fill="#fff" d="M234 239l22-12 22 12 22 34 15 24-27 44-32 40-32-40-27-44 15-24z"/>
    <path fill="url(#ink)" d="M229 271l27-12 27 12-27 28zM228 335l28 12 28-12-28 34z"/>
    <path d="M256 299v32m-32-2q32 18 64 0M193 247l-31 21m38-4-44 24m158-41 31 21m-38-4 44 24M186 296l17 30m123-30-17 30"/>
    <path d="M186 207l19 5m121-5-19 5" stroke="#fff" stroke-width="4"/>`,
  elephant: `<path fill="url(#metal)" d="M303 127c-37-36-102-26-124 17-52-7-90 21-90 65-1 38 28 76 68 74l20-22c11 22 28 38 48 43l12 49c5 21 21 45 48 47 39 3 62-30 55-61-5 23-18 30-29 24-11-6-14-23-11-47l10-80 23-17-10-29 1-29-20-12z"/>
    <path fill="url(#ink)" d="M175 167c-38-16-68 6-67 43 1 26 21 45 48 48l21-25c-13-19-16-42-2-66z"/>
    <path fill="#fff" d="M240 267c21 4 30-3 42-16-7 33-28 58-62 55-16-2-31-7-43-21 25 4 46-3 63-18z"/>
    <path d="M211 148c30-23 62-20 85-3M184 160c-15 38-7 81 17 102M218 174l21-5m-15 11 9 1M288 305l-23 3m22 18-18 1m20 18-16-1M119 196c-5 19 0 32 14 42M201 215l7 28"/>`,
  stag: `<path d="M229 194c-50-29-88-67-91-112m34 78-53-27-22-37m42-13 18-33m-1 80 22-32m-40 20-38-18M283 194c50-29 88-67 91-112m-34 78 53-27 22-37m-42-13-18-33m1 80-22-32m40 20 38-18" stroke="url(#metal)" stroke-width="10"/>
    <path fill="url(#metal)" d="M224 184l-73-32c5 35 24 56 64 63l6 63 13 40 22 57 22-57 13-40 6-63c40-7 59-28 64-63l-73 32-32-18z"/>
    <path fill="#fff" d="M256 184l-20 89 20 70 20-70z"/>
    <path fill="url(#ink)" d="M221 231l23 12-12 12-15-10M291 231l-23 12 12 12 15-10M242 307l14 17 14-17z"/>
    <path d="M171 171l39 24m131-24-39 24M228 268l6 21m50-21-6 21M236 333l20 29 20-29"/>`,
  springbok: `<path d="M234 178c-37-25-55-77-30-118-5 45 9 68 37 92m37 26c37-25 55-77 30-118 5 45-9 68-37 92" stroke="url(#metal)" stroke-width="10"/>
    <path fill="url(#metal)" d="M231 170l-74-27c7 36 35 57 71 61l-9 53 12 60 25 68 25-68 12-60-9-53c36-4 64-25 71-61l-74 27-25-16z"/>
    <path fill="#fff" d="M256 172l-14 71 4 76 10 38 10-38 4-76z"/>
    <path fill="url(#ink)" d="M226 219l16 12-9 18-15-11M286 219l-16 12 9 18 15-11M244 311l12 15 12-15z"/>
    <path d="M179 159l43 27m111-27-43 27M228 253l7 41m49-41-7 41M208 93l8 15m-4 4 9 15m83-34-8 15m4 4-9 15"/>`,
  falcon: `<path fill="url(#metal)" d="M205 122c37-39 105-28 118 12l46 24-57 12c-4 24-10 48-28 71 34 51 43 96 9 139l-58-23-46-11c-25-25-33-63-21-101l-36 68c-7-60 10-122 53-160z"/>
    <path fill="url(#ink)" d="M210 181c-42 45-45 106-17 146l37 12c-14-39-8-68 21-94l26-54-34-22z"/>
    <path fill="#fff" d="M232 130c23-13 48-9 60 6l-30 9-11 35-14-7-6-29zM269 231c26 25 43 73 28 106l-31-18-26-43z"/>
    <path fill="url(#ink)" d="M279 140l17 1-9 10-14-4z"/>
    <path d="M207 216l-21 59m36-40-18 65m32-49-17 64M261 335l-3 34 29 10m-43-36-11 26-26 9M265 376h41m-119 4h47M276 261l14 35"/>
    <path d="M305 152l35 7" stroke="#fff"/>`,
  stadium: `<path fill="url(#metal)" d="M106 213c27-82 272-82 300 0v82c-45 87-252 87-300 0z"/>
    <ellipse fill="url(#ink)" cx="256" cy="219" rx="151" ry="69"/>
    <ellipse fill="url(#metal)" cx="256" cy="229" rx="117" ry="46"/>
    <path fill="url(#ink)" d="M170 229l86-30 86 30-86 31z"/>
    <path stroke="#fff" d="M195 229l61-20 61 20-61 21zM256 209v41m-22-21 22-7 22 7-22 7zM194 158V95m124 63V95M130 183v-51m252 51v-51"/>
    <path fill="#fff" d="M179 86h30v14h-30zM303 86h30v14h-30zM115 123h30v14h-30zM367 123h30v14h-30z"/>
    <path d="M129 278v27m25-18v32m29-21v33m30-23v33m43-24v31m43-40v33m30-43v33m29-45v32m25-41v27"/>
    <path d="M120 277c55 56 217 68 272 0M129 313c63 47 194 46 254 0" stroke="#fff" stroke-opacity=".6"/>`,
};
function football(cx=256,cy=240,r=107) {
  const k=r/107;
  return `<g transform="translate(${cx} ${cy}) scale(${k}) translate(-256 -240)"><circle cx="256" cy="240" r="107" fill="#fff" stroke="url(#ink)" stroke-width="7"/><path d="M256 194l43 32-16 49h-54l-16-49zM194 159l14 31-42 38-16-3M318 159l-14 31 42 38 16-3M163 299l44-7 18 44M349 299l-44-7-18 44M243 134l13 28 13-28" fill="url(#ink)"/><path d="M256 162v32m-48-4 5 36m91-36-5 36m-92 66 22-17m76 17-22-17M256 275v42M166 228l-14 47m194-47 14 47M225 336l31-19 31 19" stroke="url(#ink)" stroke-width="4" fill="none"/><circle cx="256" cy="240" r="111" fill="none" stroke="url(#metal)" stroke-width="5"/></g>`;
}
Object.assign(artwork, {
  football: football(256,240,143),
  pitch: `<rect x="132" y="94" width="248" height="294" rx="24" fill="url(#metal)"/><rect x="146" y="108" width="220" height="266" rx="15" fill="url(#ink)" stroke="#fff" stroke-width="4"/><path d="M146 241h220M201 108v54h110v-54M226 108v23h60v-23M201 374v-54h110v54M226 374v-23h60v23" stroke="#fff" stroke-width="4"/><circle cx="256" cy="241" r="38" stroke="#fff" stroke-width="4"/><circle cx="256" cy="241" r="5" fill="#fff"/>`,
  goal: `<path d="M116 312V142q0-13 13-13h254q13 0 13 13v170" stroke="url(#metal)" stroke-width="18"/><path d="M140 302V156h232v146M140 189h232m-232 37h232m-232 37h232M177 156v146m38-146v146m41-146v146m41-146v146m38-146v146" stroke="#fff" stroke-width="3" stroke-opacity=".8"/><path d="M91 333q165 29 330 0" stroke="url(#metal)" stroke-width="7"/>${football(256,297,62)}`,
  floodlights: `<path d="M143 307V122m226 185V122" stroke="url(#metal)" stroke-width="10"/><rect x="106" y="93" width="74" height="38" rx="10" fill="url(#metal)"/><rect x="332" y="93" width="74" height="38" rx="10" fill="url(#metal)"/><path d="M121 104v16m22-16v16m22-16v16m182-16v16m22-16v16m22-16v16" stroke="#fff" stroke-width="5"/><path d="M117 152l43 17m-27-23 43 44M395 152l-43 17m27-23-43 44" stroke="#fff" stroke-width="4"/>${football(256,250,85)}`,
  arena: `<ellipse cx="256" cy="205" rx="149" ry="65" fill="url(#metal)"/><path d="M107 204v84q149 112 298 0v-84" fill="url(#metal)"/><ellipse cx="256" cy="205" rx="127" ry="47" fill="url(#ink)"/><ellipse cx="256" cy="214" rx="98" ry="29" fill="#fff"/><path d="M185 214l71-21 71 21-71 21zM256 193v42M130 258v29m30-16v34m32-26v40m32-34v43m32-40v43m32-46v43m32-49v40m32-48v34m30-47v29" stroke="url(#ink)" stroke-width="4"/><path d="M107 241q149 92 298 0" stroke="#fff" stroke-width="4"/>`,
  terraces: `<path d="M106 287V180q0-28 26-33l41-8v148M181 287V157q0-20 20-20h110q20 0 20 20v130M339 287V139l41 8q26 5 26 33v107" fill="url(#metal)"/><path d="M120 182h42m-42 30h42m-42 30h42m-42 30h42M350 182h42m-42 30h42m-42 30h42m-42 30h42M195 165h122m-122 31h122m-122 31h122m-122 31h122" stroke="#fff" stroke-width="5"/><path d="M111 320q145-58 290 0l-39 42H150z" fill="url(#ink)" stroke="url(#metal)" stroke-width="5"/><path d="M173 326h166M256 315v37" stroke="#fff" stroke-width="3"/>`,
  boots: `<path d="M139 250q11-54 20-93l68 19-8 71q47 12 66 32l74 8q29 3 34 28 4 22-22 25H148q-28-4-19-34z" fill="url(#metal)"/><path d="M157 174l51 15-7 57-58 19" fill="#fff"/><path d="M199 263l39 16m-48 1 33 14m-43 2 28 10" stroke="url(#ink)" stroke-width="8"/><path d="M130 321h258" stroke="url(#ink)" stroke-width="9"/><rect x="160" y="338" width="24" height="21" rx="5" fill="#fff"/><rect x="223" y="338" width="24" height="21" rx="5" fill="#fff"/><rect x="333" y="338" width="24" height="21" rx="5" fill="#fff"/>`,
  whistle: `<path d="M223 182h129q19 0 19 19v40h-69c8 45-17 93-65 97-48 4-83-24-83-68 0-35 25-69 69-69z" fill="url(#metal)"/><circle cx="230" cy="271" r="40" fill="url(#ink)"/><circle cx="230" cy="271" r="24" fill="#fff"/><rect x="262" y="197" width="66" height="18" rx="5" fill="url(#ink)"/><path d="M161 270c-78-30-82-131-22-145 47-10 76 31 55 51" stroke="#fff" stroke-width="6"/><path d="M378 164l19-19m-14 42h32m-43-41v-27" stroke="url(#metal)" stroke-width="6"/>`,
  trophy: `<path d="M201 104h110v106q0 54-55 84-55-30-55-84z" fill="url(#metal)"/><path d="M201 127h-45q-12 89 63 110M311 127h45q12 89-63 110" stroke="#fff" stroke-width="10"/><path d="M256 285v42m-56 30h112M231 327h50l18 30h-86z" fill="url(#metal)" stroke="url(#metal)" stroke-width="12"/><circle cx="256" cy="173" r="27" fill="#fff"/><path d="M256 151l20 14-8 23h-24l-8-23z" fill="url(#ink)"/>`,
  "centre-circle": `<circle cx="256" cy="245" r="125" fill="url(#metal)"/><circle cx="256" cy="245" r="106" fill="url(#ink)"/><path d="M256 139v212" stroke="#fff" stroke-width="4"/><circle cx="256" cy="245" r="60" fill="none" stroke="#fff" stroke-width="5"/>${football(256,245,41)}`,
  "corner-flag": `<path d="M216 310V107" stroke="#fff" stroke-width="9"/><path d="M221 112q78-22 139 13-58 48-139 25z" fill="url(#metal)"/><path d="M116 337l98-39 148 43M171 345q13-23 52-28" stroke="url(#metal)" stroke-width="7" stroke-linecap="round"/>${football(296,284,52)}`,
  "field-pin": `<path d="M256 103c-75 0-123 53-123 116 0 74 80 143 111 166q12 9 24 0c31-23 111-92 111-166 0-63-48-116-123-116z" fill="url(#metal)"/>${football(256,221,83)}`,
  matchday: `<rect x="127" y="131" width="258" height="227" rx="27" fill="url(#metal)"/><rect x="141" y="188" width="230" height="156" rx="16" fill="url(#ink)"/><path d="M190 112v46m132-46v46" stroke="#fff" stroke-width="13"/>${football(256,265,65)}<circle cx="165" cy="214" r="6" fill="#fff"/><circle cx="347" cy="214" r="6" fill="#fff"/>`,
  "stadium-arch": `<path d="M108 253c0-193 296-193 296 0" stroke="url(#metal)" stroke-width="17"/><path d="M124 234v73m44-128v114m44-138v125m44-134v127m44-118v125m44-101v114m44-59v73" stroke="#fff" stroke-width="3"/><path d="M127 292q129-75 258 0v40q-129 51-258 0z" fill="url(#metal)"/><ellipse cx="256" cy="292" rx="106" ry="31" fill="url(#ink)"/><path d="M196 292h120M256 277v30" stroke="#fff" stroke-width="3"/>`,
  "football-crown": `<path d="M160 129l11-36 50 29 35-44 35 44 50-29 11 36-11 26H171z" fill="url(#metal)" stroke-linejoin="round"/><circle cx="171" cy="95" r="9" fill="#fff"/><circle cx="256" cy="77" r="9" fill="#fff"/><circle cx="341" cy="95" r="9" fill="#fff"/>${football(256,269,94)}`,
});

function wing(side, phoenix) {
  const feathers = Array.from({length: 7}, (_, i) => {
    const x = 69 + i * 17, y = 107 + i * 9;
    return `<path fill="url(#metal)" d="M246 230Q${x+35} ${y+13} ${x+8} ${y+2}q-15-4-8 14 20 58 82 104q24 16 49 25z"/><path d="M${x+14} ${y+25}q28 42 66 68" stroke="#fff" stroke-opacity=".42" stroke-width="2"/>`;
  }).join("");
  return `<g${side ? ' transform="translate(512 0) scale(-1 1)"' : ''}>${feathers}${phoenix ? '<path fill="url(#metal)" d="M83 117q-21-38 6-75-4 37 26 44l35 54z"/>' : ''}</g>`;
}
function bird(phoenix) {
  return `${wing(false,phoenix)}${wing(true,phoenix)}<path fill="url(#metal)" d="M236 196l-6-30c-3-27 25-45 51-30l36 23-43 6 8 41 17 54-29 52-14 41-14-41-29-52z"/><path fill="#fff" d="M248 160l24-16 20 12-29 8-4 32-11-9zM241 218l15 42 15-42 7 44-22 40-22-40z"/><path fill="url(#ink)" d="M267 150l11 4-9 7z"/><path d="M233 284l-14 28-22 6m82-34 14 28 22 6M240 315l-6 30m38-30 6 30"/>${phoenix ? '<path fill="url(#metal)" d="M256 327q-63 17-58 66 15-21 32-17-6 22 26 52 32-30 26-52 17-4 32 17 5-49-58-66z"/><path d="M256 343v62m-10-50-20 20m40-20 20 20"/>' : '<path fill="url(#metal)" d="M242 320l-23 61 37-14 37 14-23-61z"/>'}`;
}
function wrapName(text, width=text.length>55 ? 26 : 17) {
  const words=text.split(/\s+/), lines=[""];
  for (const word of words) {
    if (word.length > width) {
      if (!lines[lines.length-1]) lines.pop();
      for(let i=0;i<word.length;i+=width) lines.push(word.slice(i,i+width));
    } else {
      const last=lines.length-1;
      if (lines[last] && `${lines[last]} ${word}`.length > width) lines.push(word);
      else lines[last]=`${lines[last] || ""} ${word}`.trim();
    }
  }
  return lines.filter(Boolean);
}
function fitSize(text,width,max=44,min=24) {return Math.max(min,Math.min(max,width/(Math.max(1,text.length)*.63)));}
function blockText(text,y,width=420,max=44,columns=text.length>55 ? 26 : 17) {
  const lines=wrapName(text,columns);
  const size=Math.max(22,Math.min(max, ...lines.map(l=>fitSize(l,width,max,22)),100/lines.length));
  return lines.map((l,i)=>`<text x="256" y="${y+i*(size+5)}" font-size="${size}"${l.length>26 ? ` textLength="${width}" lengthAdjust="spacingAndGlyphs"` : ''}>${esc(l)}</text>`).join("");
}
function arcLetters(text, bottom=false) {
  const chars=Array.from(text);
  const font=fitSize(text,465,bottom?40:43,26);
  const widths=chars.map(c=>/^[I1 .'!]$/.test(c)?font*.34:font*.68);
  const total=widths.reduce((a,b)=>a+b,0), radius=194;
  let cursor=-total/2;
  return chars.map((c,i)=>{
    const angle=(cursor+widths[i]/2)/radius;
    cursor+=widths[i];
    const x=256+radius*Math.sin(angle), y=245+(bottom?1:-1)*radius*Math.cos(angle);
    return `<text transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${((bottom?-1:1)*angle*180/Math.PI).toFixed(2)})" font-size="${font}" text-anchor="middle">${esc(c)}</text>`;
  }).join("");
}
export function renderFieldLogo(spec, name="Your Field") {
  if (!validSpec(spec)) throw new Error("Choose a valid logo design.");
  const full=String(name || "Your Field").trim().slice(0,100);
  const text=(spec.lettering === "initials" ? full.split(/\s+/).map(w=>Array.from(w)[0]).slice(0,6).join("") : spec.lettering === "custom" && spec.shortName?.trim() ? spec.shortName.trim() : full).toUpperCase();
  const [, dark, accent, light]=PALETTES[spec.palette];
  const automatic={lion:"banner",eagle:"top",wolf:"ring",panther:"inside",stag:"ring",springbok:"stacked",phoenix:"stacked",elephant:"top",falcon:"banner",stadium:"inside",football:"ring",pitch:"banner",goal:"stacked",floodlights:"inside",arena:"banner",terraces:"stacked",boots:"ring",whistle:"stacked",trophy:"inside","centre-circle":"ring","corner-flag":"banner","field-pin":"stacked",matchday:"inside","stadium-arch":"banner","football-crown":"ring"};
  let layout=spec.nameStyle && spec.nameStyle !== "auto" ? spec.nameStyle : automatic[spec.mascot];
  // Long names keep generous lettering rather than squeezing around a circle.
  if (layout === "ring" && text.length>36 || layout === "inside" && text.length>30 || text.length>55) layout="stacked";
  const long=wrapName(text).length>2;
  if (layout==="inside" && spec.frame==="open") layout="stacked";
  const centerY=layout==="top" ? 287 : layout==="inside" ? 177 : layout==="stacked" ? 216 : 233;
  const shapes={shield:'M105 104Q256 53 407 104v174q-16 105-151 159Q121 383 105 278Z',round:'M256 57a184 184 0 1 1 0 368 184 184 0 1 1 0-368Z',diamond:'M272 65L426 225q16 16 0 32L272 417q-16 16-32 0L86 257q-16-16 0-32L240 65q16-16 32 0Z',arch:'M98 247Q98 65 256 65q158 0 158 182v170H98Z',open:'', 'soft-shield':'M142 80H370q42 0 42 42v133q0 108-156 176Q100 363 100 255V122q0-42 42-42Z',oval:'M256 58c117 0 170 77 170 183S373 424 256 424 86 347 86 241 139 58 256 58Z'};
  const shape=shapes[spec.frame];
  const frameTransform=layout==="top" ? 'translate(256 280) scale(.82) translate(-256 -241)' : layout==="stacked" ? 'translate(256 218) scale(.86) translate(-256 -241)' : '';
  const frame=shape ? `<g transform="${frameTransform}"><path d="${shape}" fill="url(#ink)" stroke="url(#metal)" stroke-width="9"/><path d="${shape}" transform="translate(256 241) scale(.935) translate(-256 -241)" fill="none" stroke="#fff" stroke-opacity=".62" stroke-width="1.6"/></g>` : '';
  const outer=layout==="ring" ? `<circle cx="256" cy="245" r="225" fill="url(#ink)" stroke="url(#metal)" stroke-width="6"/><circle cx="256" cy="245" r="165" fill="none" stroke="url(#metal)" stroke-width="2"/>` : '';
  const scale=layout==="ring" ? .72 : layout==="inside" ? .70 : long ? .79 : .87;
  const art=artwork[spec.mascot] || bird(spec.mascot==="phoenix");
  const mascot=`<g transform="translate(256 ${centerY}) scale(${scale}) translate(-256 -245)" stroke="${dark}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none">${art}</g>`;
  let lettering="";
  if(layout==="ring") {
    const words=text.split(/\s+/); let split=Math.ceil(words.length/2);
    if(words.length===1) split=1;
    const top=words.slice(0,split).join(" "), bottom=words.slice(split).join(" ");
    lettering=arcLetters(top)+(bottom ? arcLetters(bottom,true) : '<path d="M86 270l5 12 13 1-10 8 3 13-11-7-11 7 3-13-10-8 13-1zM426 270l5 12 13 1-10 8 3 13-11-7-11 7 3-13-10-8 13-1z" fill="url(#metal)"/>');
  } else if(layout==="banner") {
    const n=wrapName(text).length, h=Math.min(129,56+n*26), y=374-(n>2 ? 23 : 0);
    lettering=`<path d="M39 ${y+10}h63v${h-15}H39l19-${Math.round(h/2)}zM473 ${y+10}h-63v${h-15}h63l-19-${Math.round(h/2)}z" fill="${accent}"/><path d="M66 ${y}Q256 ${y-17} 446 ${y}v${h-12}q-190-17-380 0z" fill="url(#ink)" stroke="url(#metal)" stroke-width="4"/>${blockText(text,y+38,355,41)}`;
  } else if(layout==="top") {
    lettering=`${blockText(text,48,430,46)}<path d="M125 ${long?151:126}h262" stroke="url(#metal)" stroke-width="3"/>`;
  } else if(layout==="inside") {
    const y=310;
    lettering=`<path d="M115 ${y-23}Q256 ${y-40} 397 ${y-23}v100H115Z" fill="url(#ink)" clip-path="url(#badgeClip)"/>${blockText(text,y+9,240,34,11)}`;
  } else {
    lettering=`<path d="M170 388h172" stroke="url(#metal)" stroke-width="3"/>${blockText(text,long?405:424,450,47)}`;
  }
  const leaves=spec.ornament && layout!=="ring" ? `<g fill="url(#metal)" stroke="${dark}" stroke-width="1" opacity=".95">${[false,true].map(reverse=>`<g${reverse?' transform="translate(512 0) scale(-1 1)"':''}><path d="M107 369Q44 300 69 207" fill="none" stroke="${accent}" stroke-width="3"/>${Array.from({length:7},(_,i)=>`<path d="M${65+i*3} ${220+i*20}q-34-16-30-38 33 10 30 38q27-15 28-38-30 9-28 38Z"/>`).join('')}</g>`).join('')}</g>` : '';
  const font='Arial,Helvetica,sans-serif';
  const textFill = ["top", "stacked"].includes(layout) ? dark : "#fff";
  const textStroke = ["top", "stacked"].includes(layout) ? "#fff" : dark;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024" viewBox="0 0 512 512"><title>${esc(full)} · ${esc(spec.mascot)}</title><defs><clipPath id="badgeClip"><path d="${shape}"/></clipPath><linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff"/><stop offset=".22" stop-color="${accent}"/><stop offset=".48" stop-color="${light}"/><stop offset=".62" stop-color="${accent}"/><stop offset="1" stop-color="${accent}"/></linearGradient><linearGradient id="ink" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="${dark}"/><stop offset="1" stop-color="#060e1b"/></linearGradient><path id="topArc" d="M62 245a194 194 0 0 1 388 0"/><path id="bottomArc" d="M62 245a194 194 0 0 0 388 0"/></defs>${outer}${frame}${leaves}${mascot}<g fill="${textFill}" font-family="${font}" font-weight="900" text-anchor="middle" paint-order="stroke" stroke="${textStroke}" stroke-width="1.6" stroke-linejoin="round">${lettering}</g></svg>`;
  return svg.replace(/<linearGradient[\s\S]*?<\/linearGradient>/g," ").replaceAll("url(#metal)",accent).replaceAll("url(#ink)",dark);
}
export const svgDataUrl = svg => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
