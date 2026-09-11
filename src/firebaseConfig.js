// src/firebaseConfig.js
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  serverTimestamp,
  connectFirestoreEmulator,
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
  apiKey: "AIzaSyBFcUukYHCtQSyA3J5TWfKBc-At7DXFhpE",
  authDomain: "turfkings-staging.firebaseapp.com",
  projectId: "turfkings-staging",
  storageBucket: "turfkings-staging.firebasestorage.app",
  messagingSenderId: "44422849668",
  appId: "1:44422849668:web:03ef479658982972016ed1",
};

// Production must be explicit.
// Anything else defaults safely to staging.
const firebaseEnv =
  import.meta.env.VITE_FIREBASE_ENV === "production"
    ? "production"
    : "staging";

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