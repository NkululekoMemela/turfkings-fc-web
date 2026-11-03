import {shouldPresentChatNotification} from "../chatNotificationPreferences.js";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { LocalNotifications } from "@capacitor/local-notifications";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../../firebaseConfig.js";

const DEVICE_ID_KEY = "fanm_native_push_device_id_v1";

const FieldNotifications = registerPlugin("FieldNotifications");

async function showForegroundNotification(notification = {}) {
  if (notification.data?.type === "pool_alert") return;
  if (!await shouldPresentChatNotification(notification.data)) return;
  const title = String(
    notification.title ||
    notification.data?.title ||
    "5 Asides Near Me"
  );

  const body = String(
    notification.body ||
    notification.data?.body ||
    "You have a new notification."
  );

  const data=notification.data||{};
  if(Capacitor.getPlatform()==="android"){
    if(data.nativePresented!=="true"){
      const key=String(notification.id||data.pollId||data.storyId||data.matchDayId||Date.now());
      let id=0;for(let i=0;i<key.length;i++)id=((id<<5)-id+key.charCodeAt(i))|0;
      await FieldNotifications.show({id:Math.max(1,id&0x7fffffff),title,body,notification:{...notification,title,body,data}});
    }
    return;
  }
  window.dispatchEvent(new CustomEvent("fanm-notification",{detail:{...notification,title,body}}));
  // Android uses the notification tray; web keeps the compact banner.
}

function getOrCreateDeviceId() {
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;

    const generated =
      globalThis.crypto?.randomUUID?.() ||
      `device_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    window.localStorage.setItem(DEVICE_ID_KEY, generated);
    return generated;
  } catch {
    return `device_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
}

export function isNativePushAvailable() {
  return Capacitor.isNativePlatform();
}

export async function initialiseNativePushNotifications({
  authUser,
  identity,
  activeClubId,
  onNotificationOpened,
}) {
  if (!isNativePushAvailable()) return () => {};
  if (!authUser?.uid) return () => {};
  const firebaseUser=auth.currentUser;
  if(firebaseUser?.uid!==authUser.uid)return () => {};
  const claims=(await firebaseUser.getIdTokenResult()).claims;
  if(claims.cameraSession || !claims.email_verified)return () => {};

  const listenerHandles = [];
  const onToastOpen=event=>onNotificationOpened?.(event.detail);
  window.addEventListener("fanm-notification-open",onToastOpen);
  listenerHandles.push({remove:()=>window.removeEventListener("fanm-notification-open",onToastOpen)});
  const deviceId = getOrCreateDeviceId();
  if (Capacitor.getPlatform() === "android" &&
      Capacitor.isPluginAvailable("FieldNotifications")) {
    listenerHandles.push(await FieldNotifications.addListener(
      "opened", notification => onNotificationOpened?.(notification)
    ));
  }


  listenerHandles.push(
    await PushNotifications.addListener(
      "registration",
      async ({ value: token }) => {
        try {
          if(auth.currentUser?.uid!==authUser.uid)return;
          const registrationId = `${authUser.uid}_${deviceId}`;
          await setDoc(doc(db,"notificationRegistrations",deviceId),{
            token,enabled:true,firebaseUid:authUser.uid,deviceId,
            platform:Capacitor.getPlatform(),rendererVersion:"2",updatedAt:serverTimestamp(),
          });
          if(!activeClubId)return;
          await setDoc(
            doc(
              db,
              "clubs",
              activeClubId,
              "notificationDevices",
              registrationId
            ),
            {
              token,
              enabled: true,
              platform: Capacitor.getPlatform(),
              appId: "com.fiveasidesnearme.app",
              firebaseUid: authUser.uid,
              email: authUser.email || identity?.email || "",
              memberId:
                identity?.memberId || authUser.memberId || "",
              playerId:
                identity?.playerId || authUser.playerId || "",
              displayName:
                identity?.fullName ||
                identity?.shortName ||
                authUser.fullName ||
                authUser.shortName ||
                "",
              role:
                identity?.role ||
                identity?.actingRole ||
                authUser.role ||
                "player",
              clubId: activeClubId,
              deviceId,
              registeredAt: serverTimestamp(),
              lastSeenAt: serverTimestamp(),
            },
            { merge: true }
          );

          console.info(
            "[NativePush] Registration saved."
          );
        } catch (error) {
          console.error(
            "[NativePush] Failed saving registration:",
            error
          );
        }
      }
    )
  );

  listenerHandles.push(
    await PushNotifications.addListener(
      "registrationError",
      error => {
        console.error("[NativePush] Registration error:", error);
      }
    )
  );

  listenerHandles.push(
    await PushNotifications.addListener(
      "pushNotificationReceived",
      async notification => {
        console.info(
          "[NativePush] Notification received:",
          notification.data?.type || "update"
        );

        try {
          await showForegroundNotification(notification);
        } catch (error) {
          console.error(
            "[NativePush] Foreground presentation failed:",
            error
          );
        }
      }
    )
  );

  listenerHandles.push(
    await LocalNotifications.addListener(
      "localNotificationActionPerformed",
      action => {
        const notification = {
          id: String(action.notification?.id || ""),
          title: action.notification?.title || "",
          body: action.notification?.body || "",
          data: action.notification?.extra || {},
        };

        console.info(
          "[NativePush] Foreground notification opened:",
          notification
        );

        onNotificationOpened?.(notification);
      }
    )
  );

  listenerHandles.push(
    await PushNotifications.addListener(
      "pushNotificationActionPerformed",
      action => {
        console.info(
          "[NativePush] Notification opened:",
          action.notification
        );

        try {
          onNotificationOpened?.(action.notification);
        } catch (error) {
          console.error(
            "[NativePush] Notification routing failed:",
            error
          );
        }
      }
    )
  );

  let permission = await PushNotifications.checkPermissions();

  if (permission.receive === "prompt") {
    permission = await PushNotifications.requestPermissions();
  }

  if (permission.receive !== "granted") {
    console.info("[NativePush] Permission not granted.");
    return () => {
      listenerHandles.forEach(handle => handle.remove());
    };
  }

  await PushNotifications.register();

  return () => {
    listenerHandles.forEach(handle => handle.remove());
  };
}

export async function disableNativeNotificationRegistration(){
  const uid=auth.currentUser?.uid;if(!uid||!Capacitor.isNativePlatform())return;
  const ref=doc(db,"notificationRegistrations",getOrCreateDeviceId()),snapshot=await getDoc(ref);
  if(snapshot.exists()&&snapshot.data().firebaseUid===uid)await setDoc(ref,{enabled:false,updatedAt:serverTimestamp()},{merge:true});
  await PushNotifications.unregister();
}
