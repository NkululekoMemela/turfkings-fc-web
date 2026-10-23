// Agreed launch prices. This public preview does not create orders or reserve stock.
export const SHOP_PRICES=Object.freeze({bib:9500,top:40000,shorts:30000,hirePerMatch:500});
export const BIB_PACK_SIZES=Object.freeze([6,12]);
export function bibPackTotal(size){if(!BIB_PACK_SIZES.includes(size))throw new Error('Choose a 6 or 12-bib pack.');return SHOP_PRICES.bib*size;}
export function formatShopPrice(minor){return new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR',maximumFractionDigits:0}).format(minor/100);}
export function previewBibColour(value){const s=String(value||'').toLowerCase();return ({blue:'blue',gold:'gold',green:'green',orange:'orange','#2563eb':'blue','#3b82f6':'blue','#15803d':'green','#16a34a':'green','#84cc16':'green','#f97316':'orange','#fb923c':'orange','#c4a46b':'gold'})[s]||'blue';}
export function conceptColours(club={}){const valid=value=>/^#[0-9a-f]{6}$/i.test(value||'');const usesClubColours=valid(club.homeColor)&&valid(club.awayColor);return {home:usesClubColours?club.homeColor:'#126d50',away:usesClubColours?club.awayColor:'#f1eee5',usesClubColours};}
