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

// ✅ Your Firebase config (keep these values exact from the console)
const firebaseConfig = {
  apiKey: "AIzaSyCRzc7SfwgSnTeuYdoZMlXydBwwEoIozZE",
  authDomain: "turfkings-fc.firebaseapp.com",
  projectId: "turfkings-fc",
  storageBucket: "turfkings-fc.firebasestorage.app",
  messagingSenderId: "221145711848",
  appId: "1:221145711848:web:4102a693f2634128e0755d",
  measurementId: "G-T1R4WCY56V"
};

export const app = initializeApp(firebaseConfig);

// Firestore
export const db = getFirestore(app);
export { serverTimestamp }; // handy helper

// Auth
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();

export function signInWithGoogle() {
  return signInWithPopup(auth, provider);
}

export function logOut() {
  return signOut(auth);
}

// ✅ Storage for player photos (or anything else)
export const storage = getStorage(app);
