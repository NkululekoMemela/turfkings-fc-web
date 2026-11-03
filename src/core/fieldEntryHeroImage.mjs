export function fieldEntryHeroImage(venue){
 return venue?.heroImage || venue?.teamPhoto || venue?.media?.coverImageUrl || "";
}
