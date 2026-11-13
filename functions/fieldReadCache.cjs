// Request-local document reuse for read-only Field views. No cross-user cache.
const fieldReadCaches=new WeakSet();
function cacheFieldReads(transaction){
 if(fieldReadCaches.has(transaction))return transaction;
 const pending=new Map();
 function get(ref){
  if(!ref.path)return transaction.get(ref);
  if(!pending.has(ref.path))pending.set(ref.path,transaction.get(ref));
  return pending.get(ref.path);
 }
 async function getAll(...refs){
  const missing=[...new Map(refs.filter(ref=>!pending.has(ref.path)).map(ref=>[ref.path,ref])).values()];
  if(missing.length){
   const batch=transaction.getAll(...missing);
   missing.forEach((ref,index)=>pending.set(ref.path,batch.then(snaps=>snaps[index])));
  }
  return Promise.all(refs.map(ref=>pending.get(ref.path)));
 }
 const cache={get,getAll};
 fieldReadCaches.add(cache);
 return cache;
}
module.exports={cacheFieldReads};
