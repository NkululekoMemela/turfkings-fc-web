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
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { getStorage } from "firebase/storage";

const productionConfig = {
  apiKey: "AIzaSyCRzc7SfwgSnTeuYdoZMlXydBwwEoIozZE",
  authDomain: "turfkings-fc.firebaseapp.com",
  projectId: "turfkings-fc",
  storageBucket: "turfkings-fc.firebasestorage.app",
  messagingSenderId: "221145711848",
  appId: "1:221145711848:web:4102a693f2634128e0755d",
  measurementId: "G-T1R4WCY56V",
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

export function signInWithGoogle() {
  return signInWithPopup(auth, provider);
}

export function logOut() {
  return signOut(auth);
}

// Storage
export const storage = getStorage(app);

export const isProductionFirebase = firebaseEnv === "production";
export const isStagingFirebase = firebaseEnv === "staging";
export const activeFirebaseProjectId = firebaseConfig.projectId;