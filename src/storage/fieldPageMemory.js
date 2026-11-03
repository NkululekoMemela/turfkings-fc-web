import {onAuthStateChanged} from "firebase/auth";
import {auth} from "../firebaseConfig.js";

const pages = new Map();
let owner = auth.currentUser?.uid || "";

onAuthStateChanged(auth, user => {
  const next = user?.uid || "";
  if (next !== owner) pages.clear();
  owner = next;
});

export function fieldPageKey(...parts) {
  return JSON.stringify([auth.currentUser?.uid || "", ...parts]);
}
export function readFieldPage(key) {
  const entry = pages.get(key);
  if (!entry || Date.now() - entry.at > 120000) {
    pages.delete(key);
    return null;
  }
  return entry.value;
}
export function saveFieldPage(key, value) {
  if (!auth.currentUser?.uid) return;
  const userId = JSON.parse(key)[0];
  if (userId !== auth.currentUser.uid) return;
  pages.set(key, {at: Date.now(), value});
  if (pages.size > 30) pages.delete(pages.keys().next().value);
}
