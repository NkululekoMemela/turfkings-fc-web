export const cleanProfileText = value => String(value ?? "").trim();
export function resolveProfileAuthUser(user) { return user?.firebaseUser || user || null; }
export function ownsPlayerProfile(member, userLike) {
  const user = resolveProfileAuthUser(userLike);
  if (!member || !user?.uid || !user.emailVerified) return false;
  if (member.uid) return member.uid === user.uid;
  return Boolean(user.email && cleanProfileText(member.email).toLowerCase() === user.email.toLowerCase());
}
export function parseJerseyNumber(value) {
  const text = cleanProfileText(value);
  if (!text) return null;
  if (!/^\d{1,3}$/.test(text)) throw new Error("Enter a whole jersey number from 0 to 999, or leave it blank.");
  return Number(text);
}
export function validatePlayerProfile(draft) {
  const fullName = cleanProfileText(draft.fullName);
  const shortName = cleanProfileText(draft.shortName);
  const whatsappNumber = cleanProfileText(draft.whatsappNumber);
  if (!fullName || fullName.length > 100) throw new Error("Enter your full name, up to 100 characters.");
  if (!shortName || shortName.length > 60) throw new Error("Enter your nickname, up to 60 characters.");
  if (whatsappNumber && !/^\+?[\d ()-]{7,25}$/.test(whatsappNumber)) throw new Error("Enter a valid WhatsApp number with its country code.");
  const ownsNumberedBib = draft.ownsNumberedBib === true || draft.ownsNumberedBib === "yes";
  const bibColor = ownsNumberedBib ? cleanProfileText(draft.bibColor) : "";
  if (ownsNumberedBib && (!bibColor || bibColor.length > 40)) throw new Error("Enter the colour of your numbered bib.");
  const jerseyNumber = parseJerseyNumber(draft.jerseyNumber);
  if (ownsNumberedBib && jerseyNumber === null) throw new Error("Enter the number on your bib.");
  return {fullName, shortName, whatsappNumber, phoneNumber: whatsappNumber, jerseyNumber, ownsNumberedBib, bibColor};
}
export function profileFingerprint(member = {}) {
  return JSON.stringify(["fullName", "shortName", "email", "whatsappNumber", "phoneNumber", "photoData", "photoUrl", "jerseyNumber", "playerId", "ownsNumberedBib", "bibColor", "ownsHomeShirt", "ownsAwayShirt", "additionalBibs", "homeShirtColor", "awayShirtColor", "profileNameAliases"].map(key => member[key] ?? null));
}
export function nextProfileAliases(member, draft) {
  return [...new Set([...(member.profileNameAliases || []), member.fullName, member.shortName].map(cleanProfileText).filter(name => name && name !== draft.fullName && name !== draft.shortName))].slice(-20);
}
