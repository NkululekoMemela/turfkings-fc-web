import {SHOP_PRICES,formatShopPrice} from "./shopShowcase.mjs";
export function clubKitInterestDraft(){
 const top=formatShopPrice(SHOP_PRICES.top),shorts=formatShopPrice(SHOP_PRICES.shorts),both=formatShopPrice(SHOP_PRICES.top+SHOP_PRICES.shorts);
 return {question:`Who is interested in ordering a club kit? Top ${top}, shorts ${shorts}, both ${both} (badge and number included).`,icon:"👥",merchandiseId:"club-kit",options:[`Interested in top + shorts (${both})`,`Interested in top only (${top})`,`Interested in shorts only (${shorts})`,"Not at the moment"]};
}
export function pollMerchandiseId(value){return value === "club-kit" ? "club-kit" : "";}
