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
import { getClubDoc } from "../core/clubFirestorePaths.js";
import { CLUB_COLLECTIONS, DEFAULT_CLUB_ID } from "../core/clubPaths.js";

// ============================
// ROOT STRUCTURE
// video_highlights/{matchId}/
//    raw/                  temporary current-week clips
//    archived/             weekly winners: top 2 goals, best save, best skill
//    votes/                user votes
//    cleanup_queue/        non-winners waiting for admin review/confirmation
//    curation/             curation run summaries
//    recording_devices/    phones that confirmed they are recording this match
//    capture_requests/     goal/save/skill capture triggers for camera devices
// ============================

const DEFAULT_CLEANUP_GRACE_HOURS = 24;
const RECORDING_DEVICE_ONLINE_WINDOW_SECONDS = 45;

function matchRef(matchId, clubId = DEFAULT_CLUB_ID) {
  return getClubDoc(db, CLUB_COLLECTIONS.videoHighlights, matchId, clubId);
}

const rawRef = (id) => collection(matchRef(id), "raw");
const archiveRef = (id) => collection(matchRef(id), "archived");
const votesRef = (id) => collection(matchRef(id), "votes");
const cleanupQueueRef = (id) => collection(matchRef(id), "cleanup_queue");
const recordingDevicesRef = (id) => collection(matchRef(id), "recording_devices");
const captureRequestsRef = (id) => collection(matchRef(id), "capture_requests");

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

function recordingDeviceDoc(matchId, deviceId) {
  return doc(recordingDevicesRef(matchId), deviceId);
}

function captureRequestDoc(matchId, requestId) {
  return doc(captureRequestsRef(matchId), requestId);
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

function safeId(value, fallbackPrefix = "id") {
  const raw = safeString(value);
  if (raw) return raw.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${fallbackPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

function makeCurationRunId() {
  return `video-curation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeCaptureType(type) {
  const key = String(type || "").trim().toLowerCase();
  if (key.includes("save")) return "save";
  if (key.includes("skill") || key.includes("shibobo")) return "skill";
  if (key.includes("goal")) return "goal";
  return key || "clip";
}

function normalizeDeviceStatus(rawDevice) {
  const device = rawDevice || {};
  const lastSeenISO = device.lastSeenISO || device.updatedAtISO || device.joinedAtISO || null;
  const lastSeenTime = lastSeenISO ? new Date(lastSeenISO).getTime() : 0;
  const online = lastSeenTime
    ? Date.now() - lastSeenTime <= RECORDING_DEVICE_ONLINE_WINDOW_SECONDS * 1000
    : Boolean(device.online);

  return {
    ...device,
    online,
    isRecording: Boolean(device.isRecording),
    confirmedRecording: Boolean(device.confirmedRecording),
  };
}

function normalizeCaptureMetadata({
  event = {},
  metadata = {},
  type = "goal",
  matchContext = {},
} = {}) {
  const safeEvent = cleanFirestorePayload(event);
  const safeMetadata = cleanFirestorePayload(metadata);
  const safeType = normalizeCaptureType(type || safeEvent?.type || safeMetadata?.type);

  return {
    type: safeType,
    tag: safeType,
    event: {
      ...safeEvent,
      type: safeType,
    },
    metadata: {
      ...safeMetadata,
      type: safeType,
    },
    matchContext: cleanFirestorePayload(matchContext),
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
  if (!matchId) throw new Error("Missing matchId.");
  if (!clipId) throw new Error("Missing clipId.");

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
  if (!matchId) throw new Error("Missing matchId.");

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
// LOAD RAW / ARCHIVED / CLEANUP QUEUE
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
// AUTO-CAPTURE: RECORDING DEVICES
// ============================

export async function registerRecordingDeviceSession({
  matchId,
  deviceId,
  deviceName = "Recording device",
  userId = "",
  userName = "",
  appVersion = "",
  platform = "android",
  matchContext = {},
} = {}) {
  if (!matchId) throw new Error("Missing matchId.");

  const safeDeviceId = safeId(deviceId, "device");
  const nowISO = new Date().toISOString();

  const payload = {
    matchId,
    deviceId: safeDeviceId,
    deviceName: safeString(deviceName) || "Recording device",
    userId: safeString(userId) || null,
    userName: safeString(userName) || "Unknown",
    appVersion: safeString(appVersion) || null,
    platform: safeString(platform) || "android",
    source: "5_asides_near_me_camera_app",
    role: "recording_device",
    confirmedRecording: true,
    confirmedLiveMatch: true,
    isRecording: true,
    online: true,
    matchContext: cleanFirestorePayload(matchContext),
    joinedAtISO: nowISO,
    lastSeenISO: nowISO,
    updatedAtISO: nowISO,
    joinedAtServer: serverTimestamp(),
    lastSeenServer: serverTimestamp(),
    updatedAtServer: serverTimestamp(),
  };

  await setDoc(recordingDeviceDoc(matchId, safeDeviceId), payload, { merge: true });

  return payload;
}

export async function updateRecordingDeviceHeartbeat({
  matchId,
  deviceId,
  isRecording = true,
  batteryLevel = null,
  storageFreeBytes = null,
  appVersion = "",
  extra = {},
} = {}) {
  if (!matchId) throw new Error("Missing matchId.");
  if (!deviceId) throw new Error("Missing deviceId.");

  const nowISO = new Date().toISOString();

  const payload = {
    ...cleanFirestorePayload(extra),
    matchId,
    deviceId: safeId(deviceId, "device"),
    isRecording: Boolean(isRecording),
    online: true,
    confirmedRecording: true,
    batteryLevel: batteryLevel ?? null,
    storageFreeBytes: storageFreeBytes ?? null,
    appVersion: safeString(appVersion) || null,
    lastSeenISO: nowISO,
    updatedAtISO: nowISO,
    lastSeenServer: serverTimestamp(),
    updatedAtServer: serverTimestamp(),
  };

  await setDoc(recordingDeviceDoc(matchId, payload.deviceId), payload, { merge: true });

  return payload;
}

export async function markRecordingDeviceSessionStopped({
  matchId,
  deviceId,
  reason = "user_stopped_recording",
} = {}) {
  if (!matchId) throw new Error("Missing matchId.");
  if (!deviceId) throw new Error("Missing deviceId.");

  const stoppedAtISO = new Date().toISOString();

  const payload = {
    matchId,
    deviceId: safeId(deviceId, "device"),
    isRecording: false,
    online: false,
    stoppedReason: safeString(reason) || "user_stopped_recording",
    stoppedAtISO,
    updatedAtISO: stoppedAtISO,
    stoppedAtServer: serverTimestamp(),
    updatedAtServer: serverTimestamp(),
  };

  await setDoc(recordingDeviceDoc(matchId, payload.deviceId), payload, { merge: true });

  return payload;
}

export async function loadRecordingDeviceSessions(matchId) {
  if (!matchId) return [];

  const q = query(recordingDevicesRef(matchId), orderBy("lastSeenISO", "desc"));
  const snap = await getDocs(q);

  return snap.docs.map((d) =>
    normalizeDeviceStatus({
      id: d.id,
      ...d.data(),
    })
  );
}

// ============================
// AUTO-CAPTURE: CAPTURE REQUESTS
// ============================

export async function createCaptureRequestForMatchEvent({
  matchId,
  eventId = "",
  event = {},
  type = "goal",
  requestedBy = "",
  requestedByName = "",
  preRollSeconds = 15,
  postRollSeconds = 5,
  matchContext = {},
  metadata = {},
  status = "pending_metadata",
} = {}) {
  if (!matchId) throw new Error("Missing matchId.");

  const normalized = normalizeCaptureMetadata({ event, metadata, type, matchContext });
  const safeType = normalized.type;
  const requestId = safeId(eventId || event?.id, `capture-${safeType}`);
  const requestedAtISO = new Date().toISOString();

  const payload = {
    matchId,
    requestId,
    eventId: safeString(eventId || event?.id) || requestId,
    source: "live_match_event",
    captureSource: "5_asides_near_me_video_approach",
    type: safeType,
    tag: safeType,
    status: safeString(status) || "pending_metadata",
    captureLifecycleStatus: "requested",
    event: normalized.event,
    metadata: normalized.metadata,
    matchContext: normalized.matchContext,
    requestedBy: safeString(requestedBy) || null,
    requestedByName: safeString(requestedByName) || "Unknown",
    preRollSeconds: Number(preRollSeconds || 15),
    postRollSeconds: Number(postRollSeconds || 5),
    expectedClipSeconds: Number(preRollSeconds || 15) + Number(postRollSeconds || 5),
    requestedAtISO,
    updatedAtISO: requestedAtISO,
    requestedAtServer: serverTimestamp(),
    updatedAtServer: serverTimestamp(),
  };

  await setDoc(captureRequestDoc(matchId, requestId), payload, { merge: true });

  return payload;
}

export async function updateCaptureRequestMetadata({
  matchId,
  requestId,
  event = {},
  metadata = {},
  type = "goal",
  matchContext = {},
  status = "metadata_attached",
} = {}) {
  if (!matchId) throw new Error("Missing matchId.");
  if (!requestId) throw new Error("Missing requestId.");

  const normalized = normalizeCaptureMetadata({ event, metadata, type, matchContext });
  const updatedAtISO = new Date().toISOString();

  const payload = {
    type: normalized.type,
    tag: normalized.tag,
    status: safeString(status) || "metadata_attached",
    captureLifecycleStatus: "metadata_attached",
    event: normalized.event,
    metadata: normalized.metadata,
    matchContext: normalized.matchContext,
    updatedAtISO,
    metadataUpdatedAtISO: updatedAtISO,
    updatedAtServer: serverTimestamp(),
    metadataUpdatedAtServer: serverTimestamp(),
  };

  await setDoc(captureRequestDoc(matchId, requestId), payload, { merge: true });

  return {
    matchId,
    requestId,
    ...payload,
  };
}

export async function markCaptureRequestDisputed({
  matchId,
  requestId,
  event = {},
  metadata = {},
  type = "goal",
  matchContext = {},
  reason = "goal_disputed",
} = {}) {
  if (!matchId) throw new Error("Missing matchId.");
  if (!requestId) throw new Error("Missing requestId.");

  const normalized = normalizeCaptureMetadata({ event, metadata, type, matchContext });
  const disputedAtISO = new Date().toISOString();

  const payload = {
    type: normalized.type,
    tag: normalized.tag,
    status: "disputed",
    captureLifecycleStatus: "disputed",
    disputed: true,
    disputedReason: safeString(reason) || "goal_disputed",
    event: normalized.event,
    metadata: normalized.metadata,
    matchContext: normalized.matchContext,
    disputedAtISO,
    updatedAtISO: disputedAtISO,
    disputedAtServer: serverTimestamp(),
    updatedAtServer: serverTimestamp(),
  };

  await setDoc(captureRequestDoc(matchId, requestId), payload, { merge: true });

  return {
    matchId,
    requestId,
    ...payload,
  };
}

export async function deleteCaptureRequest({
  matchId,
  requestId,
} = {}) {
  if (!matchId) throw new Error("Missing matchId.");
  if (!requestId) throw new Error("Missing requestId.");

  await deleteDoc(captureRequestDoc(matchId, requestId));

  return {
    matchId,
    requestId,
    deleted: true,
  };
}

// Backward-compatible clearer alias.
export async function deleteCaptureRequestFromFirebase(args = {}) {
  return deleteCaptureRequest(args);
}

export async function updateCaptureRequestDeviceStatus({
  matchId,
  requestId,
  deviceId,
  deviceName = "",
  status = "received",
  clipId = "",
  storagePath = "",
  videoUrl = "",
  errorMessage = "",
  extra = {},
} = {}) {
  if (!matchId) throw new Error("Missing matchId.");
  if (!requestId) throw new Error("Missing requestId.");
  if (!deviceId) throw new Error("Missing deviceId.");

  const safeDeviceId = safeId(deviceId, "device");
  const updatedAtISO = new Date().toISOString();

  const deviceStatus = {
    ...cleanFirestorePayload(extra),
    deviceId: safeDeviceId,
    deviceName: safeString(deviceName) || "Recording device",
    status: safeString(status) || "received",
    clipId: safeString(clipId) || null,
    storagePath: safeString(storagePath) || null,
    videoUrl: safeString(videoUrl) || null,
    errorMessage: safeString(errorMessage) || null,
    updatedAtISO,
  };

  await setDoc(
    captureRequestDoc(matchId, requestId),
    {
      [`deviceStatuses.${safeDeviceId}`]: deviceStatus,
      updatedAtISO,
      updatedAtServer: serverTimestamp(),
    },
    { merge: true }
  );

  return deviceStatus;
}

export async function loadCaptureRequestsForMatch(matchId) {
  if (!matchId) return [];

  const q = query(captureRequestsRef(matchId), orderBy("requestedAtISO", "desc"));
  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
}

// ============================
// ARCHIVE
// ============================

export async function saveArchivedHighlightsToFirebase({
  matchId,
  highlights,
  curationRunId = "",
  curationMeta = {},
} = {}) {
  if (!matchId) throw new Error("Missing matchId.");

  const safeHighlights = Array.isArray(highlights) ? highlights : [];
  if (!safeHighlights.length) return [];

  const batch = writeBatch(db);
  const archivedAtISO = new Date().toISOString();

  safeHighlights.forEach((h) => {
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
        curationRunId: curationRunId || safeHighlight.curationRunId || null,
        curationMeta: cleanFirestorePayload(curationMeta),
        archivedAtISO,
        archivedAt: archivedAtISO,
        updatedAtServer: serverTimestamp(),
      },
      { merge: true }
    );
  });

  await batch.commit();

  return safeHighlights;
}

// Backward-compatible name retained so older imports do not break.
export async function archiveWinningHighlightsToFirebase({
  matchId,
  highlights,
  curationRunId = "",
  curationMeta = {},
} = {}) {
  return saveArchivedHighlightsToFirebase({
    matchId,
    highlights,
    curationRunId,
    curationMeta,
  });
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
      curationRunId: curationRunId || safeCandidate.curationRunId || null,
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
    curationRunId: curationRunId || candidate?.curationRunId || null,
  }));
}

export async function runVideoHighlightCuration({
  matchId,
  highlights = null,
  votesByUser = null,
  limits,
  curationMeta = {},
  graceHours = DEFAULT_CLEANUP_GRACE_HOURS,
  saveCleanupQueue = true,
} = {}) {
  if (!matchId) throw new Error("Missing matchId.");

  const safeHighlights = Array.isArray(highlights)
    ? highlights
    : await loadRawHighlightsFromFirebase(matchId);

  const safeVotesByUser = votesByUser && typeof votesByUser === "object"
    ? votesByUser
    : await loadHighlightVotesFromFirebase(matchId);

  const curationRunId = makeCurationRunId();

  const selection = curateHighlights({
    highlights: safeHighlights,
    votesByUser: safeVotesByUser,
    limits,
  });

  const winners = (selection.winners || []).map((winner) => ({
    ...winner,
    curationRunId,
  }));

  const cleanupCandidates = (selection.cleanupCandidates || []).map((candidate) => ({
    ...candidate,
    curationRunId,
  }));

  const queuedCleanupCandidates = saveCleanupQueue
    ? await markVideoCleanupCandidatesForAdminReview({
        matchId,
        cleanupCandidates,
        curationRunId,
        curationMeta,
        graceHours,
      })
    : cleanupCandidates;

  const runSummary = {
    curationRunId,
    matchId,
    curationMeta: cleanFirestorePayload(curationMeta),
    counts: selection.counts,
    winnerCount: winners.length,
    cleanupCandidateCount: queuedCleanupCandidates.length,
    ranAtISO: new Date().toISOString(),
    cleanupGraceHours: Number(graceHours || DEFAULT_CLEANUP_GRACE_HOURS),
    archivedDuringCuration: false,
    archiveTiming: "confirm_cleanup",
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
  winners = [],
  curationRunId = "",
  curationMeta = {},
  requireEligibleWindow = false,
} = {}) {
  if (!matchId) throw new Error("Missing matchId.");

  const archivedWinners = await saveArchivedHighlightsToFirebase({
    matchId,
    highlights: winners,
    curationRunId,
    curationMeta,
  });

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

  const confirmedAtISO = new Date().toISOString();
  const summaryId = curationRunId || `cleanup-confirm-${Date.now()}`;

  await setDoc(
    doc(matchRef(matchId), "curation", summaryId),
    {
      matchId,
      curationRunId: summaryId,
      curationMeta: cleanFirestorePayload(curationMeta),
      confirmedAtISO,
      confirmedAtServer: serverTimestamp(),
      archivedCount: archivedWinners.length,
      deletedCount: deleted.length,
      skippedCount: skipped.length,
      confirmCleanupCompleted: true,
    },
    { merge: true }
  );

  return {
    archived: archivedWinners,
    deleted,
    skipped,
    archivedCount: archivedWinners.length,
    deletedCount: deleted.length,
    skippedCount: skipped.length,
  };
}

// Clearer alias for the page button flow: Confirm Cleanup = archive winners first, then delete non-winners.
export async function confirmCleanupAndArchiveHighlights(args = {}) {
  return confirmAndDeleteVideoCleanupCandidates(args);
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
  registerRecordingDeviceSession,
  updateRecordingDeviceHeartbeat,
  markRecordingDeviceSessionStopped,
  loadRecordingDeviceSessions,
  createCaptureRequestForMatchEvent,
  updateCaptureRequestMetadata,
  markCaptureRequestDisputed,
  deleteCaptureRequest,
  deleteCaptureRequestFromFirebase,
  updateCaptureRequestDeviceStatus,
  loadCaptureRequestsForMatch,
  saveArchivedHighlightsToFirebase,
  archiveWinningHighlightsToFirebase,
  markVideoCleanupCandidatesForAdminReview,
  runVideoHighlightCuration,
  confirmAndDeleteVideoCleanupCandidates,
  confirmCleanupAndArchiveHighlights,
  clearRawHighlightsFromFirebase,
  deleteRawHighlightFromFirebase,
};

export default VideoHighlightsRepository;
