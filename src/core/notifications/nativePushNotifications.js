import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { LocalNotifications } from "@capacitor/local-notifications";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig.js";

const DEVICE_ID_KEY = "fanm_native_push_device_id_v1";

function foregroundNotificationId(notification = {}) {
  const source = String(
    notification.id ||
    notification.data?.messageId ||
    notification.data?.paymentId ||
    `${Date.now()}_${Math.random()}`
  );

  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) - hash) + source.charCodeAt(index);
    hash |= 0;
  }

  return Math.max(1, Math.abs(hash));
}

async function showForegroundNotification(notification = {}) {
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

  await LocalNotifications.schedule({
    notifications: [
      {
        id: foregroundNotificationId(notification),
        title,
        body,
        extra: notification.data || {},

        /*
         * This is an immediate foreground presentation, not an
         * alarm-clock event. Prevent Android from opening the
         * separate "Alarms and reminders" permission screen.
         */
        isExactNotification: false,
        schedule: {
          at: new Date(Date.now() + 100),
        },
      },
    ],
  });
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
      async notification => {
        console.info(
          "[NativePush] Notification received:",
          notification
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
