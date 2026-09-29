import {
  FIREBASE_ENVIRONMENT_KEY, resolveFirebaseEnvironment,
  isFirebaseEnvironmentAdmin, buildFirebaseFunctionsUrl,
  moveFirebaseBrowserState, initializeFirebaseBrowserState,
} from "./core/firebaseEnvironmentPolicy.js";
// src/firebaseConfig.js
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  serverTimestamp,
  connectFirestoreEmulator,
  waitForPendingWrites,
} from "firebase/firestore";
import {
  getAuth,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signInWithCredential,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { getStorage } from "firebase/storage";
import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";

const productionConfig = {
  apiKey: "AIzaSyAZrrpMFISsCGOf9d-LXbFm4Yxr7CxdLx8",
  authDomain: "five-asides-near-me.firebaseapp.com",
  projectId: "five-asides-near-me",
  storageBucket: "five-asides-near-me.firebasestorage.app",
  messagingSenderId: "476068979586",
  appId: "1:476068979586:web:597442dfeef28212ece59b",
  measurementId: "G-9SK24PYCX1",
};

const stagingConfig = {
  apiKey: "AIzaSyBUY_fCGBcWrdEnta_I-7bonL-Yg3VpjFk",
  authDomain: "five-asides-near-me-staging.firebaseapp.com",
  projectId: "five-asides-near-me-staging",
  storageBucket: "five-asides-near-me-staging.firebasestorage.app",
  messagingSenderId: "236261073578",
  appId: "1:236261073578:web:0a7b12d95f85caad8b26d3",
};

// Production must be explicit.
// Anything else defaults safely to staging.
export const defaultFirebaseEnvironment =
  import.meta.env.VITE_FIREBASE_ENV === "production"
    ? "production"
    : "staging";

export const firebaseEnvironmentSwitchEnabled =
  (import.meta.env.DEV || import.meta.env.MODE === "staging") &&
  !Capacitor.isNativePlatform() &&
  import.meta.env.VITE_USE_FIRESTORE_EMULATOR !== "true" &&
  import.meta.env.VITE_USE_FUNCTIONS_EMULATOR !== "true";

let requestedEnvironment = null;
if (typeof window !== "undefined" && firebaseEnvironmentSwitchEnabled) {
  try {
    requestedEnvironment = window.localStorage.getItem(FIREBASE_ENVIRONMENT_KEY);
  } catch {
    // Keep the configured environment when browser storage is unavailable.
  }
}

export const activeFirebaseEnvironment = resolveFirebaseEnvironment(
  defaultFirebaseEnvironment,
  firebaseEnvironmentSwitchEnabled,
  requestedEnvironment,
);
const firebaseEnv = activeFirebaseEnvironment;

if (typeof window !== "undefined") {
  initializeFirebaseBrowserState(
    window.localStorage, window.sessionStorage, firebaseEnv,
  );
}

const useFirestoreEmulator =
  import.meta.env.VITE_USE_FIRESTORE_EMULATOR === "true";

const firebaseConfig =
  firebaseEnv === "production" ? productionConfig : stagingConfig;

console.log("🔥 Firebase environment:", firebaseEnv);
console.log("🔥 Firebase project:", firebaseConfig.projectId);
console.log(
  "🧪 Firestore emulator:",
  useFirestoreEmulator ? "enabled" : "disabled"
);

export const app = initializeApp(firebaseConfig);

// Firestore
export const db = getFirestore(app);
export { serverTimestamp };

// Only allow emulator outside production
if (
  firebaseEnv !== "production" &&
  useFirestoreEmulator &&
  typeof window !== "undefined"
) {
  try {
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    console.log("🧪 Connected Firestore to emulator at 127.0.0.1:8080");
  } catch (error) {
    console.warn(
      "Firestore emulator connection skipped:",
      error?.message || error
    );
  }
}

// Auth
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();

async function getNativeGoogleCredential() {
  const nativeResult =
    await FirebaseAuthentication.signInWithGoogle();

  const idToken =
    nativeResult?.credential?.idToken || null;
  const accessToken =
    nativeResult?.credential?.accessToken || null;

  if (!idToken) {
    throw new Error(
      "Native Google sign-in did not return an ID token."
    );
  }

  return GoogleAuthProvider.credential(
    idToken,
    accessToken
  );
}

export async function signInWithGoogle() {
  if (Capacitor.isNativePlatform()) {
    const credential = await getNativeGoogleCredential();
    return signInWithCredential(auth, credential);
  }

  return signInWithPopup(auth, provider);
}

export async function reauthenticateWithGoogle(user) {
  const targetUser = user || auth.currentUser;

  if (!targetUser) {
    throw new Error(
      "No authenticated Firebase user is available."
    );
  }

  if (Capacitor.isNativePlatform()) {
    const credential = await getNativeGoogleCredential();

    return reauthenticateWithCredential(
      targetUser,
      credential
    );
  }

  const webProvider = new GoogleAuthProvider();

  webProvider.setCustomParameters({
    prompt: "select_account",
  });

  return reauthenticateWithPopup(
    targetUser,
    webProvider
  );
}

export async function logOut() {
  try {
    await signOut(auth);
  } finally {
    if (Capacitor.isNativePlatform()) {
      await FirebaseAuthentication.signOut();
    }
  }
}

// Storage
export const storage = getStorage(app);

export const isProductionFirebase = firebaseEnv === "production";
export const isStagingFirebase = firebaseEnv === "staging";
export const activeFirebaseProjectId = firebaseConfig.projectId;
export function getActiveFirebaseFunctionsBaseUrl({
  allowExplicit = true, allowEmulator = true,
} = {}) {
  return buildFirebaseFunctionsUrl({
    projectId: activeFirebaseProjectId,
    production: isProductionFirebase,
    explicit: String(import.meta.env.VITE_FUNCTIONS_BASE_URL || ""),
    // A URL configured for the original build must not follow an override.
    allowExplicit: allowExplicit &&
      activeFirebaseEnvironment === defaultFirebaseEnvironment,
    allowEmulator,
    emulator: import.meta.env.VITE_USE_FUNCTIONS_EMULATOR === "true",
    hostname: typeof window === "undefined" ? "" : window.location.hostname,
  });
}

let environmentSwitchInProgress = false;

export async function switchFirebaseEnvironment(nextEnvironment) {
  if (!firebaseEnvironmentSwitchEnabled) {
    throw new Error("Environment switching is unavailable in this build.");
  }
  if (!["staging", "production"].includes(nextEnvironment)) {
    throw new Error("Choose Staging or Production.");
  }
  if (nextEnvironment === activeFirebaseEnvironment) return;
  if (environmentSwitchInProgress) return;

  environmentSwitchInProgress = true;
  let timeout;
  try {
    await auth.authStateReady();
    const user = auth.currentUser;
    if (!isFirebaseEnvironmentAdmin(user)) {
      throw new Error("Only the verified superadmin can switch environments.");
    }
    const token = await user.getIdTokenResult();
    if (token.claims.email_verified !== true ||
        String(token.claims.email || "").toLowerCase() !==
          String(user.email || "").toLowerCase()) {
      throw new Error("Your verified superadmin sign-in is required.");
    }

    await Promise.race([
      waitForPendingWrites(db),
      new Promise((_, reject) => {
        timeout = window.setTimeout(() => reject(new Error(
          "Pending changes have not finished saving. Retry when connected."
        )), 10000);
      }),
    ]);
    if (auth.currentUser?.uid !== user.uid) {
      throw new Error("Your signed-in account changed. Please retry.");
    }

    moveFirebaseBrowserState(
      window.localStorage, window.sessionStorage,
      activeFirebaseEnvironment, nextEnvironment,
    );
    try {
      window.localStorage.setItem(FIREBASE_ENVIRONMENT_KEY, nextEnvironment);
    } catch (error) {
      moveFirebaseBrowserState(
        window.localStorage, window.sessionStorage,
        nextEnvironment, activeFirebaseEnvironment,
      );
      throw error;
    }
    window.location.assign(window.location.pathname);
  } finally {
    window.clearTimeout(timeout);
    environmentSwitchInProgress = false;
  }
}

export function returnToConfiguredFirebaseEnvironment() {
  if (!firebaseEnvironmentSwitchEnabled) return;
  moveFirebaseBrowserState(
    window.localStorage, window.sessionStorage,
    activeFirebaseEnvironment, defaultFirebaseEnvironment,
  );
  window.localStorage.removeItem(FIREBASE_ENVIRONMENT_KEY);
  window.location.assign(window.location.pathname);
}

if (typeof window !== "undefined" && firebaseEnvironmentSwitchEnabled) {
  window.addEventListener("storage", event => {
    if (event.key === FIREBASE_ENVIRONMENT_KEY) {
      // Other open tabs must not continue using the previous project.
      window.location.assign(window.location.pathname);
    }
  });
}
