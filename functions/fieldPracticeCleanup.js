const {Timestamp} = require("firebase-admin/firestore");

function safeId(value) {
  return typeof value === "string" && value.length > 0 &&
    value !== "." && value !== ".." && !value.includes("/");
}

async function cleanExpired({db, now = Date.now()}) {
  const base = db.collection("practiceSessions")
    .where("kind", "==", "venueLeague").limit(100);
  let cursor = null;
  let removed = 0;

  while (true) {
    const page = await (cursor ? base.startAfter(cursor) : base).get();
    if (!page.docs.length) break;

    for (const snapshot of page.docs) {
      const session = snapshot.data();
      const expired = typeof session.expiresAt?.toMillis === "function" &&
        session.expiresAt.toMillis() <= now;
      if (!expired && session.status !== "ended") continue;
      if (session.environment !== "practice" ||
          session.sessionId !== snapshot.id ||
          !safeId(snapshot.id) || !safeId(session.venueId)) continue;

      const root = db.doc(
        `sandboxes/practice/leagueVenues/${session.venueId}/sessions/${snapshot.id}`
      );
      // Revoke access first. Failed deletion remains safe to retry.
      await snapshot.ref.update({
        status: "expired",
        cleanupStartedAt: Timestamp.fromMillis(now),
      });
      await db.recursiveDelete(root);
      await snapshot.ref.delete();
      removed++;
    }

    cursor = page.docs[page.docs.length - 1];
    if (page.docs.length < 100) break;
  }
  return {removed};
}

module.exports = {cleanExpired};
