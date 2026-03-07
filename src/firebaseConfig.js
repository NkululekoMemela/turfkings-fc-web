// src/firebaseConfig.js
import { initializeApp } from "firebase/app";
import { getFirestore, serverTimestamp } from "firebase/firestore";
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

const useStaging = import.meta.env.VITE_USE_STAGING === "true";
const firebaseConfig = useStaging ? stagingConfig : productionConfig;

console.log("🔥 Firebase mode:", useStaging ? "staging" : "production");
console.log("🔥 Firebase project:", firebaseConfig.projectId);

export const app = initializeApp(firebaseConfig);

// Firestore
export const db = getFirestore(app);
export { serverTimestamp };

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