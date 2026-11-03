export function clubKitColours(draft){
 const homeColor=String(draft?.homeColor||"").trim(),awayColor=String(draft?.awayColor||"").trim();
 if(!/^#[0-9a-f]{6}$/i.test(homeColor)||!/^#[0-9a-f]{6}$/i.test(awayColor))throw new Error("Choose the club’s traditional Home and Away colours.");
 return {homeColor:homeColor.toLowerCase(),awayColor:awayColor.toLowerCase()};
}
