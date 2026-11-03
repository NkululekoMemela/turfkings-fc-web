const formats = {
  "5_V_5": 5, "6_V_6": 6, "7_V_7": 7, "11_V_11": 11,
};

export function seasonContributionPlan({
  totalCents, squadSize, gameFormat, maximum = 30,
}) {
  const minimum = formats[gameFormat];
  if (!minimum || !Number.isInteger(maximum) ||
      !Number.isInteger(squadSize) ||
      squadSize < minimum || squadSize > maximum || maximum > 30) {
    throw new Error("Choose a valid season squad size.");
  }
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
    throw new Error("Enter a valid whole-season Club fee in cents.");
  }
  const base = Math.floor(totalCents / squadSize);
  if (base < 1) throw new Error("The contribution is too small.");
  const remainder = totalCents % squadSize;
  return {
    currency: "ZAR", totalCents, squadSize,
    contributions: Array.from({length: squadSize}, (_, index) =>
      base + (index < remainder ? 1 : 0)),
  };
}

export function createSeasonSquadInvitations({
  plan, players, invitedByUid, now = Date.now(),
}) {
  if (!invitedByUid || !Number.isFinite(now) ||
      !Array.isArray(players) || players.length !== plan?.squadSize ||
      !Array.isArray(plan.contributions) ||
      plan.contributions.length !== players.length ||
      plan.currency !== "ZAR" ||
      !Number.isSafeInteger(plan.totalCents) ||
      plan.contributions.some(value =>
        !Number.isSafeInteger(value) || value <= 0) ||
      plan.contributions.reduce((sum, value) => sum + value, 0) !== plan.totalCents) {
    throw new Error("Select the agreed squad and contribution plan.");
  }
  const seenPlayers = new Set();
  const seenMembers = new Set();
  return players.map((player, index) => {
    const {sourcePlayerId, memberId, fullName} = player || {};
    if (typeof sourcePlayerId !== "string" || !sourcePlayerId ||
        sourcePlayerId.includes("/") ||
        typeof memberId !== "string" || !memberId || memberId.includes("/") ||
        typeof fullName !== "string" || !fullName.trim() ||
        seenPlayers.has(sourcePlayerId) || seenMembers.has(memberId)) {
      throw new Error("Choose distinct registered players linked to Club members.");
    }
    seenPlayers.add(sourcePlayerId);
    seenMembers.add(memberId);
    return {
      sourcePlayerId, memberId, fullName: fullName.trim(),
      invitationStatus: "pending",
      contributionCents: plan.contributions[index], currency: "ZAR",
      paymentStatus: "pending",
      invitedByUid, invitedAtMs: now,
    };
  });
}

export function respondSeasonSquadInvitation({
  invitation, response, actorMemberId, now = Date.now(),
}) {
  if (!invitation || !actorMemberId ||
      invitation.memberId !== actorMemberId) {
    throw new Error("Only the invited member can answer this invitation.");
  }
  if (!["accepted", "declined"].includes(response) || !Number.isFinite(now)) {
    throw new Error("Accept or decline the invitation.");
  }
  if (invitation.invitationStatus === response) return invitation;
  if (invitation.invitationStatus !== "pending") {
    throw new Error("This invitation has already been answered.");
  }
  return {...invitation, invitationStatus: response, respondedAtMs: now};
}

export function confirmSeasonSquadPayment({
  invitation, confirmedByUid, now = Date.now(),
}) {
  if (!confirmedByUid || !Number.isFinite(now)) {
    throw new Error("An authorized Club official must confirm payment.");
  }
  if (invitation?.invitationStatus !== "accepted") {
    throw new Error("The player must accept the season invitation first.");
  }
  if (!Number.isSafeInteger(invitation.contributionCents) ||
      invitation.contributionCents <= 0 || invitation.currency !== "ZAR") {
    throw new Error("The agreed contribution is invalid.");
  }
  if (invitation.paymentStatus === "paid") return invitation;
  return {
    ...invitation, paymentStatus: "paid",
    paidCents: invitation.contributionCents,
    paymentConfirmedByUid: confirmedByUid, paymentConfirmedAtMs: now,
  };
}
