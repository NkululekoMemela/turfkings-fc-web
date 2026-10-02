import {
  collection, doc, onSnapshot, runTransaction, serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "../firebaseConfig.js";

export function watchVenueStaffPermissions(venueId, uid, onValue, onError) {
  return onSnapshot(
    doc(db, "leagueVenues", venueId, "staffPermissions", uid),
    snapshot => onValue(snapshot.exists() ? snapshot.data() : {}),
    onError,
  );
}

export function watchAllVenueStaffPermissions(venueId, onValue, onError) {
  return onSnapshot(
    collection(db, "leagueVenues", venueId, "staffPermissions"),
    snapshot => onValue(Object.fromEntries(
      snapshot.docs.map(item => [item.id, item.data()])
    )),
    onError,
  );
}

export async function saveVenueStaffPermissions({
  venueId, staffUid, endMatchDay, endSeason,
}) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in to manage staff powers.");
  if (typeof endMatchDay !== "boolean" || typeof endSeason !== "boolean") {
    throw new Error("Choose valid staff powers.");
  }

  return runTransaction(db, async transaction => {
    const venueRef = doc(db, "leagueVenues", venueId);
    const staffRef = doc(db, "leagueVenues", venueId, "staff", staffUid);
    const permissionRef = doc(
      db, "leagueVenues", venueId, "staffPermissions", staffUid
    );
    const venueSnapshot = await transaction.get(venueRef);
    const staffSnapshot = await transaction.get(staffRef);

    if (!venueSnapshot.exists() ||
        venueSnapshot.data().ownerUid !== uid) {
      throw new Error("Only the Field creator can assign these powers.");
    }
    if (staffUid === uid) {
      throw new Error("The Field creator already holds these powers.");
    }
    if (!staffSnapshot.exists() ||
        staffSnapshot.data().status !== "active" ||
        staffSnapshot.data().uid !== staffUid) {
      throw new Error("This staff member must sign in and claim their profile first.");
    }

    transaction.set(permissionRef, {
      uid: staffUid,
      endMatchDay,
      endSeason,
      updatedByUid: uid,
      updatedAt: serverTimestamp(),
    });
  });
}
