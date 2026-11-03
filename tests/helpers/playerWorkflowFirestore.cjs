function fixture(initial = {}) {
  const records=new Map(Object.entries(initial));
  const snap=path=>({id:path.split("/").at(-1),ref:ref(path),exists:records.has(path),data:()=>records.has(path)?{...records.get(path)}:undefined});
  const query=(path,group=false,filters=[])=>({
    path,
    where:(key,op,value)=>query(path,group,[...filters,[key,op,value]]),
    limit:()=>query(path,group,filters),
    get:async()=>{
      const docs=[...records.keys()].filter(key=>group?key.split("/").at(-2)===path:key.startsWith(path+"/") && key.split("/").length===path.split("/").length+1).filter(key=>filters.every(([field,op,value])=>op==="=="&&records.get(key)[field]===value)).map(snap);
      return {docs,size:docs.length,empty:!docs.length};
    },
    doc:id=>ref(path+"/"+id),
  });
  const ref=path=>({path,id:path.split("/").at(-1),get:async()=>snap(path),collection:name=>query(path+"/"+name),parent:{path:path.split("/").slice(0,-1).join("/"),parent:{id:path.split("/").at(-3),collection:name=>query(path.split("/").slice(0,-2).join("/")+"/"+name)}}});
  const db={doc:ref,collection:path=>query(path),collectionGroup:path=>query(path,true),runTransaction:async fn=>{
    const writes=[];
    const tx={get:async r=>r.get?r.get():snap(r.path),getAll:async(...refs)=>refs.map(r=>snap(r.path)),set:(r,data,options)=>writes.push([r.path,data,Boolean(options?.merge)]),update:(r,data)=>writes.push([r.path,data,true]),delete:r=>writes.push([r.path,null,false])};
    const result=await fn(tx);
    for(const [path,data,merge]of writes)if(data===null)records.delete(path);else records.set(path,{...(merge?records.get(path):{}),...data});
    return result;
  }};
  return {db,records,ref};
}
module.exports={fixture};
