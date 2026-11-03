import {SHOP_PRICES,formatShopPrice} from "./shopShowcase.mjs";
export function clubKitInterestDraft(){
 const top=formatShopPrice(SHOP_PRICES.top),shorts=formatShopPrice(SHOP_PRICES.shorts),both=formatShopPrice(SHOP_PRICES.top+SHOP_PRICES.shorts);
 return {question:"Who wants a club kit?",icon:"👥",merchandiseId:"club-kit",options:[`Top + shorts · ${both}`,`Top · ${top}`,`Shorts · ${shorts}`,"Not now"]};
}
export function pollMerchandiseId(value){return value === "club-kit" ? "club-kit" : "";}

export function compactKitPollOption(label){
 const text=String(label||"").trim();
 const match=text.match(/^Interested in (top \+ shorts|top only|shorts only) \((R[0-9,.]+)\)$/i);
 if(match)return ({"top + shorts":"Top + shorts","top only":"Top","shorts only":"Shorts"}[match[1].toLowerCase()])+" · "+match[2];
 return /^Not at the moment$/i.test(text)?"Not now":text;
}

export function compactKitPollQuestion(question){
 const text=String(question||"").trim();
 return /^Who is interested in ordering a club kit\?\s+Top\s/i.test(text)?"Who wants a club kit?":text;
}
