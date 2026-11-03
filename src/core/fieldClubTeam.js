import {buildClubIdentity, DEFAULT_PLATFORM_LOGO} from "./clubIdentity.js";

// Official and Practice render the same Club identity, including built-in badges.
export function buildFieldClubTeam(club = {}) {
  const id = club.clubId || club.id;
  const identity = buildClubIdentity({...club, id});
  return {
    ...club, id, name: identity.name, label: identity.name,
    captain: club.captain || "Club representative",
    logoUrl: identity.logoUrl === DEFAULT_PLATFORM_LOGO ? "" : identity.logoUrl,
    transparentLogoUrl: identity.transparentLogoUrl === DEFAULT_PLATFORM_LOGO
      ? "" : identity.transparentLogoUrl,
    players: club.players || [],
  };
}
