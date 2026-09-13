import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig.js";

const DEVICE_ID_KEY = "fanm_native_push_device_id_v1";

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
  if (!authUser?.uid || !activeClubId) return () => {};

  const listenerHandles = [];
  const deviceId = getOrCreateDeviceId();

  listenerHandles.push(
    await PushNotifications.addListener(
      "registration",
      async ({ value: token }) => {
        try {
          const registrationId = `${authUser.uid}_${deviceId}`;

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
            "[NativePush] Registration saved:",
            token
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
      notification => {
        console.info(
          "[NativePush] Notification received:",
          notification
        );
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
