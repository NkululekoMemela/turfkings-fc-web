const clean = value => String(value || "").trim();
const email = value => clean(value).toLowerCase();
const validId = value => typeof value === "string" &&
  /^[A-Za-z0-9_-]{1,150}$/.test(value);

async function resolve({db, user, venueId, clubId, staff = {}}) {
  if (staff.status === "active" && clean(staff.name)) {
    return {name: clean(staff.name).slice(0, 160), clubId: "", memberId: ""};
  }
  const fallback = {name: "Field visitor", clubId: "", memberId: ""};
  if (!validId(clubId)) return fallback;

  const membership = await db.doc(`clubFieldMemberships/${clubId}`).get();
  if (membership.data()?.status !== "active" ||
      membership.data()?.venueId !== venueId) return fallback;

  const members = db.collection(`clubs/${clubId}/members`);
  const queries = [members.where("uid", "==", user.uid).limit(2).get()];
  if (user.email_verified === true && email(user.email)) {
    queries.push(members.where("email", "==", email(user.email)).limit(2).get());
  }
  const snapshots = await Promise.all(queries);
  const matches = new Map();
  for (const snapshot of snapshots) {
    for (const doc of snapshot.docs) {
      const member = doc.data();
      if ((member.status || "active") === "active" &&
          (member.uid === user.uid ||
            (user.email_verified === true && email(user.email) &&
             email(member.email) === email(user.email)))) {
        matches.set(doc.id, {id: doc.id, ...member});
      }
    }
  }
  if (matches.size !== 1) return fallback;
  const member = [...matches.values()][0];
  let player = {};
  if (validId(member.playerId)) {
    const snapshot = await db.doc(`clubs/${clubId}/players/${member.playerId}`).get();
    player = snapshot.data() || {};
  }
  const name = clean(player.fullName || player.name || player.playerName ||
    member.fullName || member.name);
  return name ? {
    name: name.slice(0, 160), clubId, memberId: member.id,
  } : fallback;
}

module.exports = {resolve};
