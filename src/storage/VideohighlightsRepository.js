// src/storage/VideohighlightsRepository.js

import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";

import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";

import { db, storage } from "../firebaseConfig";

// ============================
// ROOT STRUCTURE
// video_highlights/{matchId}/
//    raw/
//    archived/
//    votes/
// ============================

function matchRef(matchId) {
  return doc(db, "video_highlights", matchId);
}

const rawRef = (id) => collection(matchRef(id), "raw");
const archiveRef = (id) => collection(matchRef(id), "archived");
const votesRef = (id) => collection(matchRef(id), "votes");

function rawDoc(matchId, clipId) {
  return doc(rawRef(matchId), clipId);
}

function archiveDoc(matchId, clipId) {
  return doc(archiveRef(matchId), clipId);
}

function voteDoc(matchId, userId) {
  return doc(votesRef(matchId), userId);
}

// ============================
// HELPERS
// ============================

function cleanFirestorePayload(input) {
  const { file, previewFile, localFile, blob, ...safe } = input || {};
  return safe;
}

// ============================
// STORAGE PATH
// ============================

export function buildVideoStoragePath({
  matchId,
  clipId,
  file,
  source = "manual_upload",
}) {
  const ext = file?.name?.split(".").pop() || "mp4";
  return `video_highlights/${matchId}/raw/${source}/${clipId}.${ext}`;
}

// ============================
// UPLOAD WITH PROGRESS
// ============================

export async function uploadHighlightVideoFile({
  file,
  matchId,
  clipId,
  source = "manual_upload",
  onProgress,
}) {
  if (!file) throw new Error("No video file supplied");

  const path = buildVideoStoragePath({
    file,
    matchId,
    clipId,
    source,
  });

  const storageRef = ref(storage, path);

  return new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const progress =
          snapshot.totalBytes > 0
            ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
            : 0;

        onProgress?.(progress);
      },
      (error) => {
        reject(error);
      },
      async () => {
        try {
          const url = await getDownloadURL(uploadTask.snapshot.ref);

          resolve({
            storagePath: path,
            videoUrl: url,
            mediaUrl: url,
            downloadUrl: url,
          });
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

// ============================
// SAVE RAW DOC
// ============================

export async function saveRawHighlightDoc({ matchId, highlight }) {
  const safeHighlight = cleanFirestorePayload(highlight);

  const payload = {
    ...safeHighlight,
    matchId,
    updatedAtServer: serverTimestamp(),
  };

  if (!payload.clipId) {
    throw new Error("Missing clipId while saving highlight metadata.");
  }

  await setDoc(rawDoc(matchId, payload.clipId), payload, { merge: true });

  return payload;
}

// ============================
// COMBINED UPLOAD + SAVE
// ============================

export async function uploadAndSaveRawHighlight({
  matchId,
  file,
  highlight,
  onProgress,
}) {
  if (!matchId) throw new Error("Missing matchId.");
  if (!file) throw new Error("Missing video file.");

  const safeHighlight = cleanFirestorePayload(highlight);

  const base = {
    ...safeHighlight,
    matchId,
  };

  if (!base.clipId) {
    throw new Error("Missing clipId.");
  }

  const uploaded = await uploadHighlightVideoFile({
    file,
    matchId,
    clipId: base.clipId,
    source: base.source || "manual_upload",
    onProgress,
  });

  return saveRawHighlightDoc({
    matchId,
    highlight: {
      ...base,
      ...uploaded,
    },
  });
}

// ============================
// LOAD RAW
// ============================

export async function loadRawHighlightsFromFirebase(matchId) {
  if (!matchId) return [];

  const q = query(rawRef(matchId), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
}

// ============================
// VOTES
// ============================

export async function saveHighlightVotesToFirebase({
  matchId,
  userId,
  votes,
}) {
  if (!matchId) throw new Error("Missing matchId.");
  if (!userId) throw new Error("Missing userId.");

  await setDoc(
    voteDoc(matchId, userId),
    {
      ...cleanFirestorePayload(votes),
      updatedAtServer: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function loadHighlightVotesFromFirebase(matchId) {
  if (!matchId) return {};

  const snap = await getDocs(votesRef(matchId));

  const out = {};
  snap.docs.forEach((d) => {
    out[d.id] = d.data();
  });

  return out;
}

// ============================
// ARCHIVE
// ============================

export async function archiveWinningHighlightsToFirebase({
  matchId,
  highlights,
}) {
  if (!matchId) throw new Error("Missing matchId.");

  const batch = writeBatch(db);

  (highlights || []).forEach((h) => {
    const safeHighlight = cleanFirestorePayload(h);
    if (!safeHighlight.clipId) return;

    batch.set(
      archiveDoc(matchId, safeHighlight.clipId),
      {
        ...safeHighlight,
        archived: true,
        archivedAt: new Date().toISOString(),
        updatedAtServer: serverTimestamp(),
      },
      { merge: true }
    );
  });

  await batch.commit();

  return highlights || [];
}

// ============================
// DELETE
// ============================

export async function deleteRawHighlightFromFirebase({
  matchId,
  clipId,
  storagePath,
}) {
  if (!matchId) throw new Error("Missing matchId.");
  if (!clipId) throw new Error("Missing clipId.");

  await deleteDoc(rawDoc(matchId, clipId));

  if (storagePath) {
    const fileRef = ref(storage, storagePath);

    try {
      await deleteObject(fileRef);
    } catch (e) {
      console.warn("[TK HIGHLIGHTS] Storage delete failed:", e);
    }
  }
}

// ============================
// CLEAR RAW
// ============================

export async function clearRawHighlightsFromFirebase(matchId) {
  if (!matchId) return;

  const snap = await getDocs(rawRef(matchId));
  const batch = writeBatch(db);

  snap.docs.forEach((d) => {
    batch.delete(d.ref);
  });

  await batch.commit();
}

// ============================
// EXPORT
// ============================

const VideoHighlightsRepository = {
  uploadAndSaveRawHighlight,
  uploadHighlightVideoFile,
  saveRawHighlightDoc,
  loadRawHighlightsFromFirebase,
  saveHighlightVotesToFirebase,
  loadHighlightVotesFromFirebase,
  archiveWinningHighlightsToFirebase,
  clearRawHighlightsFromFirebase,
  deleteRawHighlightFromFirebase,
};

export default VideoHighlightsRepository;