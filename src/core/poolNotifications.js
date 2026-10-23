import {Capacitor,registerPlugin} from '@capacitor/core';
import {PushNotifications} from '@capacitor/push-notifications';
import {auth,activeFirebaseProjectId} from '../firebaseConfig.js';
import {poolNightRequest} from '../storage/poolNightGateway.js';
const FieldNotifications=registerPlugin('FieldNotifications');
export function poolNotificationRoute(data){
 if(data?.type!=='pool_alert'||!/^[A-F0-9]{10}$/.test(data.code||''))return null;
 if(data.recipientUid&&auth.currentUser&&auth.currentUser.uid!==data.recipientUid)return null;
 return {code:data.code,recipientUid:data.recipientUid,tab:['players','results','tables'].includes(data.tab)?data.tab:'tables'};
}
export async function poolPushRegistration(){
 const scope=`/pool-push/${activeFirebaseProjectId}/`;
 const reg=await navigator.serviceWorker.register('/pool-push-sw.js',{scope});
 if(!reg.active)await new Promise((resolve,reject)=>{const worker=reg.installing||reg.waiting;if(!worker)return reject(Error('Notification worker is not ready.'));const timer=setTimeout(()=>reject(Error('Notification setup timed out. Retry.')),15000);worker.addEventListener('statechange',()=>{if(worker.state==='activated'){clearTimeout(timer);resolve();}else if(worker.state==='redundant'){clearTimeout(timer);reject(Error('Notification worker could not start.'));}});});
 reg.active?.postMessage({type:'pool-account',uid:auth.currentUser?.uid||''});return reg;
}
export async function enablePoolAlerts({quiet=false}={}){
 const user=auth.currentUser;if(!user||user.isAnonymous)throw Error('Sign in before enabling alerts.');
 if(Capacitor.isNativePlatform()){
  const existing=await PushNotifications.checkPermissions();if(quiet&&existing.receive!=='granted')throw Error('Notification permission is required.');const permission=existing.receive==='granted'?existing:await PushNotifications.requestPermissions();
  if(permission.receive!=='granted')throw Error('Notifications are blocked. Enable them in phone settings. Pending requests remain in Players.');
  if(Capacitor.getPlatform()==='android')await PushNotifications.createChannel({id:'field_invitations',name:'FANM updates',importance:5,visibility:1});
  await new Promise((resolve,reject)=>{
   let handles=[],done=false;
   const finish=async(error)=>{if(done)return;done=true;clearTimeout(timer);for(const handle of handles)await Promise.resolve(handle.remove()).catch(()=>{});error?reject(error):resolve();};
   const timer=setTimeout(()=>finish(Error('Phone registration timed out. Please retry.')),20000);
   (async()=>{
    handles.push(await PushNotifications.addListener('registration',async({value:token})=>{try{if(auth.currentUser?.uid!==user.uid)throw Error('Your signed-in account changed.');await poolNightRequest({action:'registerPush',kind:'native',token});finish();}catch(error){finish(error);}}));
    handles.push(await PushNotifications.addListener('registrationError',()=>finish(Error('Phone notifications could not register. Please retry.'))));
    if(done){for(const handle of handles)await Promise.resolve(handle.remove()).catch(()=>{});return;}
    await PushNotifications.register();
   })().catch(finish);
  });
 }else{
  if(!window.isSecureContext||!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))throw Error('Background alerts are unavailable here. Use a supported browser or the Android app. Pending requests remain in Players.');
  if(quiet&&Notification.permission!=='granted')throw Error('Notification permission is required.');
  const permission=quiet?Notification.permission:await Notification.requestPermission();
  if(permission!=='granted')throw Error('Notifications are blocked. Enable them in browser settings. Pending requests remain in Players.');
  const config=await poolNightRequest({action:'pushConfig'}),reg=await poolPushRegistration();
  const key=Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-config.publicKey.length%4)%4)),char=>char.charCodeAt(0));
  let subscription=await reg.pushManager.getSubscription();
  if(!subscription)subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
  if(auth.currentUser?.uid!==user.uid)throw Error('Your signed-in account changed.');
  await poolNightRequest({action:'registerPush',kind:'web',subscription:subscription.toJSON(),origin:location.origin});
 }
 try{localStorage.setItem(`pool-alerts:${activeFirebaseProjectId}`,user.uid);}catch{}
}
export async function attachPoolNativeEvents(onOpen){
 if(!Capacitor.isNativePlatform())return ()=>{};
 const handles=[];
 try{
  handles.push(await PushNotifications.addListener('pushNotificationActionPerformed',action=>{const route=poolNotificationRoute(action.notification?.data);if(route)onOpen(route);}));
  handles.push(await PushNotifications.addListener('pushNotificationReceived',async notification=>{
   const route=poolNotificationRoute(notification.data);if(!route)return;
   window.dispatchEvent(new CustomEvent('pool-push-received',{detail:route}));
   if(Capacitor.getPlatform()==='android'&&Capacitor.isPluginAvailable('FieldNotifications')){
    try{await FieldNotifications.show({id:Math.abs([...String(notification.data?.eventId||Date.now())].reduce((h,c)=>(h*31+c.charCodeAt(0))|0,0))||1,title:notification.title||'Pool night',body:notification.body||'Open your night to review.',notification});}catch{}
   }
  }));
  if(Capacitor.isPluginAvailable('FieldNotifications'))handles.push(await FieldNotifications.addListener('opened',notification=>{const route=poolNotificationRoute(notification?.data);if(route)onOpen(route);}));
  return ()=>{for(const handle of handles)handle.remove();};
 }catch(error){for(const handle of handles)await Promise.resolve(handle.remove()).catch(()=>{});throw error;}
}
