import { app, activeFirebaseProjectId } from "../firebaseConfig.js";
import {
  getFirestore, connectFirestoreEmulator,
  doc, collection, getDoc, getDocs,
} from "firebase/firestore/lite";

const portalDb = getFirestore(app);
if (import.meta.env.VITE_USE_FIRESTORE_EMULATOR === "true" &&
    activeFirebaseProjectId !== "five-asides-near-me") {
  connectFirestoreEmulator(portalDb, "127.0.0.1", 8080);
}
export const readPortalMembership = clubId =>
  getDoc(doc(portalDb, "clubFieldMemberships", clubId));
export const readPortalMember = (clubId, memberId) =>
  getDoc(doc(portalDb, "clubs", clubId, "members", memberId));
export const readPortalMembers = clubId =>
  getDocs(collection(portalDb, "clubs", clubId, "members"));

export function readPortalClub(clubId) {
  return getDoc(doc(portalDb, "clubs", clubId));
}
