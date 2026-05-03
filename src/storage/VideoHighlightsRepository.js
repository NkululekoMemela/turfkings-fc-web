// src/storage/VideoHighlightsRepository.js

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

import { db, storage } from "../firebaseConfig.js";
import { curateHighlights } from "../core/VideoHighlightCuration.js";

// ============================
// ROOT STRUCTURE
// video_highlights/{matchId}/
//    raw/              temporary current-week clips
//    archived/         weekly winners: top 2 goals, best save, best skill
//    votes/            user votes
//    cleanup_queue/    non-winners waiting for admin review/confirmation
// ============================

const DEFAULT_CLEANUP_GRACE_HOURS = 24;

function matchRef(matchId) {
  return doc(db, "video_highlights", matchId);
}

const rawRef = (id) => collection(matchRef(id), "raw");
const archiveRef = (id) => collection(matchRef(id), "archived");
const votesRef = (id) => collection(matchRef(id), "votes");
const cleanupQueueRef = (id) => collection(matchRef(id), "cleanup_queue");

function rawDoc(matchId, clipId) {
  return doc(rawRef(matchId), clipId);
}

function archiveDoc(matchId, clipId) {
  return doc(archiveRef(matchId), clipId);
}

function voteDoc(matchId, userId) {
  return doc(votesRef(matchId), userId);
}

function cleanupQueueDoc(matchId, clipId) {
  return doc(cleanupQueueRef(matchId), clipId);
}

// ============================
// HELPERS
// ============================

function cleanFirestorePayload(input) {
  const { file, previewFile, localFile, blob, ...safe } = input || {};
  return safe;
}

function safeString(value) {
  return String(value || "").trim();
}

function getClipId(highlight) {
  return safeString(highlight?.clipId || highlight?.id || highlight?.highlightId || "");
}

function addHours(date, hours) {
  const d = date instanceof Date ? date : new Date(date || Date.now());
  const safeDate = Number.isNaN(d.getTime()) ? new Date() : d;
  safeDate.setHours(safeDate.getHours() + Number(hours || 0));
  return safeDate;
}

function normalizeProgressPayload(progress, fallbackStage = "storage") {
  if (progress && typeof progress === "object") return progress;
  const percent = Number(progress || 0);
  return {
    stage: fallbackStage,
    percent: Number.isFinite(percent) ? percent : 0,
  };
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

        onProgress?.({
          ...normalizeProgressPayload(progress),
          stage: "storage",
          percent: progress,
          bytesTransferred: snapshot.bytesTransferred,
          totalBytes: snapshot.totalBytes,
          storagePath: path,
        });
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

  onProgress?.({
    stage: "metadata",
    percent: 0,
    message: "Preparing video upload...",
  });

  const uploaded = await uploadHighlightVideoFile({
    file,
    matchId,
    clipId: base.clipId,
    source: base.source || "manual_upload",
    onProgress,
  });

  onProgress?.({
    stage: "firestore",
    percent: 95,
    message: "Saving video highlight details...",
  });

  const saved = await saveRawHighlightDoc({
    matchId,
    highlight: {
      ...base,
      ...uploaded,
    },
  });

  onProgress?.({
    stage: "complete",
    percent: 100,
    message: "Video highlight upload complete.",
  });

  return saved;
}

// ============================
// LOAD RAW / ARCHIVED
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

export async function loadArchivedHighlightsFromFirebase(matchId) {
  if (!matchId) return [];

  const q = query(archiveRef(matchId), orderBy("archivedAtISO", "desc"));
  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
}

export async function loadVideoCleanupQueueFromFirebase(matchId) {
  if (!matchId) return [];

  const q = query(cleanupQueueRef(matchId), orderBy("cleanupMarkedAtISO", "desc"));
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
  curationRunId = "",
  curationMeta = {},
}) {
  if (!matchId) throw new Error("Missing matchId.");

  const batch = writeBatch(db);
  const archivedAtISO = new Date().toISOString();

  (highlights || []).forEach((h) => {
    const safeHighlight = cleanFirestorePayload(h);
    const clipId = getClipId(safeHighlight);
    if (!clipId) return;

    batch.set(
      archiveDoc(matchId, clipId),
      {
        ...safeHighlight,
        clipId,
        id: safeHighlight.id || clipId,
        matchId,
        archived: true,
        status: "archived",
        curationRunId: curationRunId || null,
        curationMeta: cleanFirestorePayload(curationMeta),
        archivedAtISO,
        archivedAt: archivedAtISO,
        updatedAtServer: serverTimestamp(),
      },
      { merge: true }
    );
  });

  await batch.commit();

  return highlights || [];
}

// ============================
// CURATION + CLEANUP QUEUE
// ============================

export async function markVideoCleanupCandidatesForAdminReview({
  matchId,
  cleanupCandidates,
  curationRunId = "",
  curationMeta = {},
  graceHours = DEFAULT_CLEANUP_GRACE_HOURS,
}) {
  if (!matchId) throw new Error("Missing matchId.");

  const safeCandidates = Array.isArray(cleanupCandidates) ? cleanupCandidates : [];
  if (!safeCandidates.length) return [];

  const batch = writeBatch(db);
  const cleanupMarkedAt = new Date();
  const cleanupMarkedAtISO = cleanupMarkedAt.toISOString();
  const cleanupEligibleAtISO = addHours(cleanupMarkedAt, graceHours).toISOString();

  safeCandidates.forEach((candidate) => {
    const safeCandidate = cleanFirestorePayload(candidate);
    const clipId = getClipId(safeCandidate);
    if (!clipId) return;

    const payload = {
      ...safeCandidate,
      clipId,
      id: safeCandidate.id || clipId,
      matchId,
      cleanupStatus: "pending_admin_review",
      cleanupReason: safeCandidate.cleanupReason || "Not selected for weekly winners",
      curationRunId: curationRunId || null,
      curationMeta: cleanFirestorePayload(curationMeta),
      cleanupMarkedAtISO,
      cleanupEligibleAtISO,
      updatedAtServer: serverTimestamp(),
    };

    batch.set(cleanupQueueDoc(matchId, clipId), payload, { merge: true });
    batch.set(rawDoc(matchId, clipId), payload, { merge: true });
  });

  await batch.commit();

  return safeCandidates.map((candidate) => ({
    ...candidate,
    cleanupStatus: "pending_admin_review",
    cleanupMarkedAtISO,
    cleanupEligibleAtISO,
    curationRunId: curationRunId || null,
  }));
}

export async function runVideoHighlightCuration({
  matchId,
  highlights = null,
  votesByUser = null,
  limits,
  curationMeta = {},
  graceHours = DEFAULT_CLEANUP_GRACE_HOURS,
} = {}) {
  if (!matchId) throw new Error("Missing matchId.");

  const safeHighlights = Array.isArray(highlights)
    ? highlights
    : await loadRawHighlightsFromFirebase(matchId);

  const safeVotesByUser = votesByUser && typeof votesByUser === "object"
    ? votesByUser
    : await loadHighlightVotesFromFirebase(matchId);

  const curationRunId = `video-curation-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  const selection = curateHighlights({
    highlights: safeHighlights,
    votesByUser: safeVotesByUser,
    limits,
  });

  const winners = selection.winners || [];
  const cleanupCandidates = selection.cleanupCandidates || [];

  await archiveWinningHighlightsToFirebase({
    matchId,
    highlights: winners,
    curationRunId,
    curationMeta,
  });

  const queuedCleanupCandidates = await markVideoCleanupCandidatesForAdminReview({
    matchId,
    cleanupCandidates,
    curationRunId,
    curationMeta,
    graceHours,
  });

  const runSummary = {
    curationRunId,
    matchId,
    curationMeta: cleanFirestorePayload(curationMeta),
    counts: selection.counts,
    winnerCount: winners.length,
    cleanupCandidateCount: queuedCleanupCandidates.length,
    ranAtISO: new Date().toISOString(),
    cleanupGraceHours: Number(graceHours || DEFAULT_CLEANUP_GRACE_HOURS),
  };

  await setDoc(
    doc(matchRef(matchId), "curation", curationRunId),
    {
      ...runSummary,
      ranAtServer: serverTimestamp(),
    },
    { merge: true }
  );

  return {
    ...selection,
    winners,
    cleanupCandidates: queuedCleanupCandidates,
    curationRunId,
    runSummary,
  };
}

export async function confirmAndDeleteVideoCleanupCandidates({
  matchId,
  cleanupCandidates,
  requireEligibleWindow = false,
} = {}) {
  if (!matchId) throw new Error("Missing matchId.");

  const candidates = Array.isArray(cleanupCandidates) && cleanupCandidates.length
    ? cleanupCandidates
    : await loadVideoCleanupQueueFromFirebase(matchId);

  const deleted = [];
  const skipped = [];
  const now = Date.now();

  for (const candidate of candidates) {
    const clipId = getClipId(candidate);
    if (!clipId) {
      skipped.push({ ...candidate, reason: "Missing clipId" });
      continue;
    }

    const eligibleAt = new Date(candidate.cleanupEligibleAtISO || 0).getTime();
    const isEligible = !requireEligibleWindow || !eligibleAt || eligibleAt <= now;

    if (!isEligible) {
      skipped.push({ ...candidate, reason: "Cleanup window has not elapsed yet" });
      continue;
    }

    await deleteRawHighlightFromFirebase({
      matchId,
      clipId,
      storagePath: candidate.storagePath,
    });

    await deleteDoc(cleanupQueueDoc(matchId, clipId));

    deleted.push({ ...candidate, clipId });
  }

  return {
    deleted,
    skipped,
    deletedCount: deleted.length,
    skippedCount: skipped.length,
  };
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
  loadArchivedHighlightsFromFirebase,
  loadVideoCleanupQueueFromFirebase,
  saveHighlightVotesToFirebase,
  loadHighlightVotesFromFirebase,
  archiveWinningHighlightsToFirebase,
  markVideoCleanupCandidatesForAdminReview,
  runVideoHighlightCuration,
  confirmAndDeleteVideoCleanupCandidates,
  clearRawHighlightsFromFirebase,
  deleteRawHighlightFromFirebase,
};

export default VideoHighlightsRepository;