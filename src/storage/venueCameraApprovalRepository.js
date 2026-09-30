import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "../firebaseConfig.js";

function requestRef({ venueId, seasonId, fixtureId, uid }) {
  if (![venueId, seasonId, fixtureId, uid].every(Boolean)) {
    throw new Error("The Field camera request is incomplete.");
  }
  return doc(
    db, "leagueVenues", venueId, "seasons", seasonId,
    "cameraRequests", `${fixtureId}__${uid}`
  );
}

export async function requestVenueCameraAccess({
  venueId, seasonId, fixtureId, requesterName = "",
}) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in to request Field camera access.");
  const ref = requestRef({ venueId, seasonId, fixtureId, uid });
  const existing = await getDoc(ref);
  if (existing.exists() && existing.data().status === "pending") {
    return existing.data();
  }

  const request = {
    venueId, seasonId, fixtureId,
    requestedByUid: uid,
    requesterName: String(requesterName || "Cameraman").trim().slice(0, 80),
    status: "pending",
    requestedAtMs: Date.now(),
  };
  if (existing.exists()) {
    request.requestedAtMs = Math.max(
      request.requestedAtMs,
      Number(existing.data().requestedAtMs || 0) + 1
    );
  }
  await setDoc(ref, request);
  return request;
}

export function watchVenueCameraRequest({
  venueId, seasonId, fixtureId, onData, onError,
}) {
  const uid = auth.currentUser?.uid;
  if (!uid) return () => {};
  return onSnapshot(
    requestRef({ venueId, seasonId, fixtureId, uid }),
    (snapshot) => onData(snapshot.exists() ? snapshot.data() : null),
    onError
  );
}

export function watchVenueCameraRequests({
  venueId, seasonId, onData, onError,
}) {
  return onSnapshot(
    collection(db, "leagueVenues", venueId, "seasons",
      seasonId, "cameraRequests"),
    (snapshot) => onData(snapshot.docs.map((item) => ({
      id: item.id, ...item.data(),
    }))),
    onError
  );
}

export async function decideVenueCameraRequest({
  venueId, seasonId, fixtureId, uid, approved,
}) {
  const approverUid = auth.currentUser?.uid;
  if (!approverUid) throw new Error("Sign in as the officiating Field official.");
  await updateDoc(
    requestRef({ venueId, seasonId, fixtureId, uid }),
    {
      status: approved ? "approved" : "denied",
      approvedByUid: approverUid,
      decidedAtMs: Date.now(),
    }
  );
}
