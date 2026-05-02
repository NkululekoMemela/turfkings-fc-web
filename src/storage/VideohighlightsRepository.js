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
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";

import { db, storage } from "../firebaseConfig";

// ============================
// ROOT STRUCTURE (NEW)
// ============================
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
// UPLOAD VIDEO
// ============================

export async function uploadHighlightVideoFile({
  file,
  matchId,
  clipId,
  source = "manual_upload",
}) {
  if (!file) throw new Error("No video file supplied");

  const path = buildVideoStoragePath({
    file,
    matchId,
    clipId,
    source,
  });

  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, file);

  const url = await getDownloadURL(storageRef);

  return {
    storagePath: path,
    videoUrl: url,
    mediaUrl: url,
    downloadUrl: url,
  };
}

// ============================
// SAVE RAW DOC
// ============================

export async function saveRawHighlightDoc({
  matchId,
  highlight,
}) {
  const payload = {
    ...highlight,
    matchId,
    updatedAtServer: serverTimestamp(),
  };

  await setDoc(
    rawDoc(matchId, payload.clipId),
    payload,
    { merge: true }
  );

  return payload;
}

// ============================
// COMBINED UPLOAD + SAVE
// ============================

export async function uploadAndSaveRawHighlight({
  matchId,
  file,
  highlight,
}) {
  const base = {
    ...highlight,
    matchId,
  };

  const uploaded = await uploadHighlightVideoFile({
    file,
    matchId,
    clipId: base.clipId,
    source: base.source || "manual_upload",
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
  const q = query(
    rawRef(matchId),
    orderBy("createdAt", "desc")
  );

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
  await setDoc(
    voteDoc(matchId, userId),
    {
      ...votes,
      updatedAtServer: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function loadHighlightVotesFromFirebase(matchId) {
  const snap = await getDocs(votesRef(matchId));

  const out = {};
  snap.docs.forEach((d) => {
    out[d.id] = d.data();
  });

  return out;
}

// ============================
// ARCHIVE WINNERS
// ============================

export async function archiveWinningHighlightsToFirebase({
  matchId,
  highlights,
}) {
  const batch = writeBatch(db);

  highlights.forEach((h) => {
    batch.set(
      archiveDoc(matchId, h.clipId),
      {
        ...h,
        archived: true,
        archivedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  });

  await batch.commit();

  return highlights;
}

// ============================
// DELETE RAW (WITH STORAGE)
// ============================

export async function deleteRawHighlightFromFirebase({
  matchId,
  clipId,
  storagePath,
}) {
  await deleteDoc(rawDoc(matchId, clipId));

  if (storagePath) {
    const fileRef = ref(storage, storagePath);
    try {
      await deleteObject(fileRef);
    } catch (e) {
      console.warn("Storage delete failed", e);
    }
  }
}

// ============================
// CLEAR ALL RAW
// ============================

export async function clearRawHighlightsFromFirebase(matchId) {
  const snap = await getDocs(rawRef(matchId));
  const batch = writeBatch(db);

  snap.docs.forEach((d) => {
    batch.delete(d.ref);
  });

  await batch.commit();
}

// ============================
// EXTERNAL IMPORT (Pushit etc.)
// ============================

export async function importExternalHighlight({
  matchId,
  provider = "pushit",
  externalClip,
}) {
  return saveRawHighlightDoc({
    matchId,
    highlight: {
      ...externalClip,
      source: provider,
    },
  });
}

// ============================
// EXPORT
// ============================

const VideoHighlightsRepository = {
  uploadAndSaveRawHighlight,
  loadRawHighlightsFromFirebase,
  saveHighlightVotesToFirebase,
  loadHighlightVotesFromFirebase,
  archiveWinningHighlightsToFirebase,
  clearRawHighlightsFromFirebase,
  deleteRawHighlightFromFirebase,
  importExternalHighlight,
};

export default VideoHighlightsRepository;