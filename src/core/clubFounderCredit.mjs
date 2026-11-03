// Founder credit is stable; delegated administrators do not replace the creator.
export function clubFounderName(club = {}, administrators = []) {
  const text = value => typeof value === "string" ? value.trim() : "";
  const creatorUid = text(club.createdByUid) || text(club.ownerUid);
  const creator = administrators.find(member => creatorUid &&
    [member.uid, member.authUid, member.userId, member.id].includes(creatorUid));
  return text(creator?.fullName) || text(creator?.name) || text(creator?.shortName) ||
    text(club.createdByName) || text(club.founderName) ||
    [text(club.founderFirstName), text(club.founderSurname)].filter(Boolean).join(" ") ||
    text(club.mainAdminName) || text(club.ownerName) || text(club.owner?.name) ||
    text(club.captain?.name) || text(club.captainName) || text(club.captainFirstName) ||
    text(administrators[0]?.fullName) || text(administrators[0]?.name) ||
    text(administrators[0]?.shortName) || text(club.adminNames?.[0]) || "";
}
