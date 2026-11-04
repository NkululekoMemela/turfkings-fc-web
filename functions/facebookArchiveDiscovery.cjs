const META = 'facebookHighlightQueue/_archiveDiscovery';
async function discover({db, pageSize = 40, now = Date.now()}) {
  const ref = db.doc(META);
  const state = await db.runTransaction(async tx => {
    const old = (await tx.get(ref)).data() || {};
    if (old.complete && old.version === 2) return {complete:true};
    if (old.leaseUntil > now) return {busy:true};
    const current = old.version === 2 ? old : {};
    tx.set(ref, {...current, version:2, leaseUntil:now + 45000});
    return current;
  });
  if (state.complete) return {complete:true, more:false};
  if (state.busy) return {more:true};
  try {
    let query = db.collectionGroup('archived').orderBy('__name__').limit(pageSize);
    if (state.cursor) query = query.startAfter(db.doc(state.cursor));
    const result = await query.get();
    const {capture} = require('./facebookReview.cjs');
    for (const document of result.docs) {
      await capture({db, path:document.ref.path, h:document.data(), historical:true});
    }
    const complete = result.docs.length < pageSize;
    const cursor = result.docs.at(-1)?.ref.path || state.cursor || '';
    await db.runTransaction(async tx => {
      await tx.get(ref);
      tx.set(ref, {version:2, cursor, complete, leaseUntil:0});
    });
    return {complete, more:!complete};
  } catch (error) {
    await db.runTransaction(async tx => {
      const old = (await tx.get(ref)).data() || {};
      tx.set(ref, {...old, leaseUntil:0});
    });
    throw error;
  }
}
module.exports = {discover};
