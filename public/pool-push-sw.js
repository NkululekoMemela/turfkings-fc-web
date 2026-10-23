/* Dedicated push-only scope: leaves the app's existing PWA worker unchanged. */
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
function store(mode,work){return new Promise((resolve,reject)=>{const open=indexedDB.open('fanm-pool-push',1);open.onupgradeneeded=()=>open.result.createObjectStore('account');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('account',mode),request=work(tx.objectStore('account'));let value;request.onsuccess=()=>{value=request.result;};tx.oncomplete=()=>{db.close();resolve(value);};tx.onerror=()=>{db.close();reject(tx.error);};};});}
self.addEventListener('message',event=>{if(event.data?.type==='pool-account')event.waitUntil(store('readwrite',table=>table.put(String(event.data.uid||''),self.registration.scope)));});
self.addEventListener('push',event=>event.waitUntil((async()=>{
 let data;try{data=event.data.json();}catch{return;}
 if(data?.type!=='pool_alert'||!/^[A-F0-9]{10}$/.test(data.code||''))return;
 const uid=await store('readonly',table=>table.get(self.registration.scope));if(!uid||uid!==data.recipientUid)return;
 const url=new URL(data.url||'/',self.location.origin);if(url.origin!==self.location.origin)return;
 const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of clients)client.postMessage({type:'pool-push-received',code:data.code,tab:data.tab});
 await self.registration.showNotification(data.title||'Pool night',{body:data.body||'Open your night to review.',tag:data.tag,renotify:false,data:{url:url.href,recipientUid:data.recipientUid}});
})()));
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{
 const uid=await store('readonly',table=>table.get(self.registration.scope));if(uid!==event.notification.data?.recipientUid)return;
 const url=new URL(event.notification.data?.url||'/',self.location.origin);if(url.origin!==self.location.origin)return;
 const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of clients){if(client.url===url.href&&'focus' in client)return client.focus();}
 return self.clients.openWindow(url.href);
})());});
