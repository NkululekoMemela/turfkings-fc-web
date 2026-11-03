import {
  doc, getDocsFromServer, runTransaction, serverTimestamp,
} from "firebase/firestore";

const ids = values => [...new Set(
  (Array.isArray(values) ? values : []).map(String).filter(Boolean)
)];

function participantKey(data, fallback) {
  return String(
    data.beneficiaryPlayerId || data.playerId ||
    data.beneficiaryStableKey || data.userId || fallback
  ).trim().toLowerCase();
}

function bookedWeeks(data) {
  return ids([
    ...(data.selectedWeeks || []),
    ...(data.primaryPaidWeeks || []),
    ...(data.paidWeeks || []),
  ]);
}

export async function saveSignupWithCapacity({
  db, clubId, ref, data, options,
  pendingCollection, matchCollection, defaultLimit, fixtureLimits = {},
}) {
  const root = doc(db, "clubs", clubId);

  return runTransaction(db, async transaction => {
    const clubSnapshot = await transaction.get(root);
    if (!clubSnapshot.exists()) throw new Error("Club could not be found.");
    const existingSnapshot = await transaction.get(ref);
    const existing = existingSnapshot.data() || {};

    const rootLimit = Number(
      clubSnapshot.data().bookingSettings?.maxPlayers ?? defaultLimit
    );
    if (!Number.isInteger(rootLimit) || rootLimit < 1 || rootLimit > 100) {
      throw new Error("The Club player limit is invalid. Ask the administrator to check it.");
    }

    const requested = bookedWeeks({ ...existing, ...data });
    const previous = bookedWeeks(existing);
    const affected = ids([...requested, ...previous]).sort();
    const locks = affected.map(week => doc(
      db, "clubs", clubId, "bookingCapacityLocks", encodeURIComponent(week)
    ));

    // Every cooperating signup save reads and updates the same game lock.
    // Firestore retries the entire callback when another save wins.
    const lockSnapshots = [];
    for (const lock of locks) {
      lockSnapshots.push(await transaction.get(lock));
    }

    // Fresh queries are repeated on transaction retries.
    const pending = await getDocsFromServer(pendingCollection);
    const matches = await getDocsFromServer(matchCollection);
    const records = [...pending.docs, ...matches.docs];
    const key = participantKey({ ...existing, ...data }, ref.id);

    for (const week of requested) {
      const occupants = new Set();
      for (const record of records) {
        if (record.ref.path === ref.path) continue;
        const value = record.data() || {};
        if (bookedWeeks(value).includes(week)) {
          occupants.add(participantKey(value, record.id));
        }
      }
      const alreadyBooked = previous.includes(week) || occupants.has(key);
      occupants.delete(key);
      const limit = Number(fixtureLimits[week] ?? rootLimit);
      if (!alreadyBooked && occupants.size >= limit) {
        throw new Error(`The game on ${week} is full (${limit} players). Choose another game.`);
      }
    }

    locks.forEach((lock, index) => {
      transaction.set(lock, {
        revision: Number(lockSnapshots[index].data()?.revision || 0) + 1,
        updatedAt: serverTimestamp(),
      });
    });
    if (options) transaction.set(ref, data, options);
    else transaction.set(ref, data);
  });
}
