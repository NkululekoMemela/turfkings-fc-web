// src/storage/VideoHighlightsRepository.js

import {
  collection,
  collectionGroup,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  writeBatch,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";

import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";

import { db, storage } from "../firebaseConfig.js";
import {
  curateHighlights,
  buildVoteCounts,
  getHighlightId,
  getHighlightType,
  getHighlightVoteCount,
  HIGHLIGHT_TYPES,
} from "../core/VideoHighlightCuration.js";
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

const DEFAULT_HIGHLIGHT_VISIBILITY_DAYS = 5;
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
// LIKES
// ============================

function highlightLikesRef(matchId) {
  return collection(matchRef(matchId), "likes");
}

function highlightLikeDoc(matchId, clipId, userId) {
  const safeClipId = safeId(clipId, "clip");
  const safeUserId = safeId(userId, "user");

  return doc(
    highlightLikesRef(matchId),
    `${safeClipId}__${safeUserId}`
  );
}

/**
 * Toggle one user's like for one clip.
 *
 * The document ID is deterministic, so the same user cannot create
 * duplicate likes on the same clip. The user may still like any
 * number of different clips.
 */
export async function toggleHighlightLike({
  matchId,
  clipId,
  userId,
  clubId = "",
  category = "",
} = {}) {
  if (!matchId) throw new Error("Missing matchId.");
  if (!clipId) throw new Error("Missing clipId.");
  if (!userId) throw new Error("Missing userId.");

  const target = highlightLikeDoc(matchId, clipId, userId);
  const existing = await getDoc(target);

  if (existing.exists()) {
    await deleteDoc(target);

    return {
      matchId,
      clipId,
      userId,
      liked: false,
    };
  }

  const likedAtISO = new Date().toISOString();

  const payload = {
    matchId: String(matchId),
    clipId: String(clipId),
    userId: String(userId),
    clubId: String(clubId || ""),
    category: String(category || ""),
    likedAtISO,
    likedAtServer: serverTimestamp(),
  };

  await setDoc(target, cleanFirestorePayload(payload));

  return {
    ...payload,
    liked: true,
  };
}

/**
 * Load likes from one match bucket.
 *
 * Returns both:
 * - countsByClip: total unique likes per clip
 * - likedClipIdsByUser: clips liked by each user
 */
export async function loadHighlightLikesFromFirebase(matchId) {
  if (!matchId) {
    return {
      likes: [],
      countsByClip: {},
      likedClipIdsByUser: {},
    };
  }

  const snap = await getDocs(highlightLikesRef(matchId));
  const likes = [];
  const countsByClip = {};
  const likedClipIdsByUser = {};

  snap.docs.forEach((likeSnap) => {
    const data = likeSnap.data() || {};
    const clipId = String(data.clipId || "").trim();
    const userId = String(data.userId || "").trim();

    if (!clipId || !userId) return;

    likes.push({
      id: likeSnap.id,
      ...data,
      clipId,
      userId,
      matchId: data.matchId || matchId,
    });

    countsByClip[clipId] =
      Number(countsByClip[clipId] || 0) + 1;

    if (!Array.isArray(likedClipIdsByUser[userId])) {
      likedClipIdsByUser[userId] = [];
    }

    if (!likedClipIdsByUser[userId].includes(clipId)) {
      likedClipIdsByUser[userId].push(clipId);
    }
  });

  return {
    likes,
    countsByClip,
    likedClipIdsByUser,
  };
}

/**
 * Load and merge likes for every match represented in the club feed.
 */
export async function loadHighlightLikesForMatchesFromFirebase(
  matchIds = []
) {
  const uniqueMatchIds = [
    ...new Set(
      (Array.isArray(matchIds) ? matchIds : [matchIds])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    ),
  ];

  const results = await Promise.all(
    uniqueMatchIds.map((matchId) =>
      loadHighlightLikesFromFirebase(matchId)
    )
  );

  const likes = [];
  const countsByClip = {};
  const likedClipIdsByUser = {};

  results.forEach((result) => {
    likes.push(...(Array.isArray(result?.likes) ? result.likes : []));

    Object.entries(result?.countsByClip || {}).forEach(
      ([clipId, count]) => {
        countsByClip[clipId] =
          Number(countsByClip[clipId] || 0) +
          Number(count || 0);
      }
    );

    Object.entries(result?.likedClipIdsByUser || {}).forEach(
      ([userId, clipIds]) => {
        const existing = new Set(
          likedClipIdsByUser[userId] || []
        );

        (Array.isArray(clipIds) ? clipIds : []).forEach(
          (clipId) => existing.add(clipId)
        );

        likedClipIdsByUser[userId] = [...existing];
      }
    );
  });

  return {
    likes,
    countsByClip,
    likedClipIdsByUser,
  };
}


// ============================
// LEGACY VOTES
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
  visibilityDays = DEFAULT_HIGHLIGHT_VISIBILITY_DAYS,
}) {
  if (!matchId) throw new Error("Missing matchId.");

  const safeCandidates = Array.isArray(cleanupCandidates) ? cleanupCandidates : [];
  if (!safeCandidates.length) return [];

  const batch = writeBatch(db);
  const cleanupMarkedAt = new Date();
  const cleanupMarkedAtISO = cleanupMarkedAt.toISOString();
  const cleanupEligibleAt = new Date(cleanupMarkedAt);
  cleanupEligibleAt.setDate(
    cleanupEligibleAt.getDate() + Number(visibilityDays || DEFAULT_HIGHLIGHT_VISIBILITY_DAYS)
  );
  const cleanupEligibleAtISO = cleanupEligibleAt.toISOString();

  safeCandidates.forEach((candidate) => {
    const safeCandidate = cleanFirestorePayload(candidate);
    const clipId = getClipId(safeCandidate);
    if (!clipId) return;

    const payload = {
      ...safeCandidate,
      clipId,
      id: safeCandidate.id || clipId,
      matchId,
      cleanupStatus: "pending_cleanup",
      lifecycleState: "PENDING_CLEANUP",
      cleanupReason: safeCandidate.cleanupReason || "Not selected for weekly winners",
      lifecycleReason: safeCandidate.cleanupReason || "Not selected for weekly winners",
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
    cleanupStatus: "pending_cleanup",
      lifecycleState: "PENDING_CLEANUP",
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
  visibilityDays = DEFAULT_HIGHLIGHT_VISIBILITY_DAYS,
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
        visibilityDays,
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
    highlightVisibilityDays: Number(visibilityDays || DEFAULT_HIGHLIGHT_VISIBILITY_DAYS),
    archivedDuringCuration: false,
    lifecycleEnabled: true,
    archiveTiming: "automatic_lifecycle",
  };

  await setDoc(
    doc(matchRef(matchId), "curation", curationRunId),
    {
      ...runSummary,
      ranAtServer: serverTimestamp(),
    },
    { merge: true }
  );

  const lifecycleResult =
    await confirmAndDeleteVideoCleanupCandidates({
      matchId,
      cleanupCandidates: queuedCleanupCandidates,
      winners,
      curationRunId,
      curationMeta,
      requireEligibleWindow: true,
    });

  return {
    ...selection,
    winners,
    cleanupCandidates: queuedCleanupCandidates,
    lifecycleResult,
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
// CURRENT CLUB AWARD LEADERS
// ============================
//
// Development / in-season source of truth for:
//   - Puskas Award leader
//   - Skill of the Season leader
//   - Save of the Season leader
//
// This is intentionally provisional while a season is active.
// Final season winners can later replace these leaders without
// requiring NewsPage to calculate awards independently.
//
export async function loadCurrentAwardLeadersFromFirebase(
  clubId,
  { visibilityDays = 5 } = {}
) {
  const safeClubId =
    String(clubId || DEFAULT_CLUB_ID).trim().toLowerCase() ||
    DEFAULT_CLUB_ID;

  const highlights =
    await loadRecentClubHighlightsFromFirebase(
      safeClubId,
      { visibilityDays }
    );

  const safeHighlights = Array.isArray(highlights)
    ? highlights.filter(Boolean)
    : [];

  if (!safeHighlights.length) {
    return {
      puskas: null,
      skill: null,
      save: null,
      highlights: [],
      likeCounts: {},
    };
  }

  const matchIds = Array.from(
    new Set(
      safeHighlights
        .map((highlight) =>
          String(highlight?.matchId || "").trim()
        )
        .filter(Boolean)
    )
  );

  /*
   * IMPORTANT:
   *
   * VideoHighlightsPage currently builds its Top Voted selection
   * with:
   *
   *   buildArchiveSelection(
   *     approvedHighlights,
   *     localVotesByUser,
   *     likeCountsByClip
   *   )
   *
   * Because likeCountsByClip is supplied as directLikeCounts,
   * those live like counts become the ranking values.
   *
   * News deliberately mirrors that exact behaviour.
   */
  let likeCounts = {};

  if (matchIds.length) {
    try {
      const result =
        await loadHighlightLikesForMatchesFromFirebase(
          matchIds
        );

      likeCounts =
        result?.countsByClip &&
        typeof result.countsByClip === "object"
          ? result.countsByClip
          : {};
    } catch (error) {
      console.warn(
        "[CURRENT AWARD LEADERS] Could not load likes:",
        error
      );
    }
  }

  const getId = (highlight = {}) =>
    String(
      highlight.clipId ||
      highlight.id ||
      highlight.highlightId ||
      ""
    ).trim();

  const getLikeCount = (highlight = {}) =>
    Math.max(
      0,
      Number(likeCounts[getId(highlight)] || 0)
    );

  const getCreatedTime = (highlight = {}) => {
    const firestoreValue =
      highlight.createdAt ||
      highlight.createdAtServer ||
      highlight.uploadedAt ||
      highlight.timestamp;

    const firestoreMs =
      firestoreValue?.toMillis?.() ||
      firestoreValue?.toDate?.()?.getTime?.();

    if (Number.isFinite(Number(firestoreMs))) {
      return Number(firestoreMs);
    }

    const parsed = new Date(
      highlight.createdAtISO ||
      highlight.createdAt ||
      highlight.uploadedAtISO ||
      highlight.uploadedAt ||
      highlight.timestamp ||
      0
    ).getTime();

    return Number.isFinite(parsed) ? parsed : 0;
  };

  const isApproved = (highlight = {}) => {
    const status = String(
      highlight.status ||
      highlight.moderationStatus ||
      highlight.reviewStatus ||
      "approved"
    )
      .trim()
      .toLowerCase();

    return status === "approved";
  };

  /*
   * Exact Top Voted ranking rule:
   *   1. Highest live like count
   *   2. Newest clip on a tie
   */
  const rank = (items = []) =>
    items
      .filter(isApproved)
      .slice()
      .sort((a, b) => {
        const likeDiff =
          getLikeCount(b) - getLikeCount(a);

        if (likeDiff !== 0) return likeDiff;

        return (
          getCreatedTime(b) -
          getCreatedTime(a)
        );
      });

  const goals = [];
  const skills = [];
  const saves = [];

  safeHighlights.forEach((highlight) => {
    const type = getHighlightType(highlight);

    if (type === HIGHLIGHT_TYPES.GOAL) {
      goals.push(highlight);
    } else if (type === HIGHLIGHT_TYPES.SKILL) {
      skills.push(highlight);
    } else if (type === HIGHLIGHT_TYPES.SAVE) {
      saves.push(highlight);
    }
  });

  const decorateLeader = (
    highlight,
    awardKey
  ) => {
    if (!highlight) return null;

    const likeCount = getLikeCount(highlight);

    return {
      ...highlight,
      awardKey,
      currentAwardLeader: true,
      likeCount,

      /*
       * Keep this compatibility field because NewsPage already
       * reads voteCount. It now deliberately reflects the same
       * live Top Voted count shown in Videos.
       */
      voteCount: likeCount,
    };
  };

  return {
    puskas: decorateLeader(
      rank(goals)[0] || null,
      "puskas"
    ),
    skill: decorateLeader(
      rank(skills)[0] || null,
      "skill_of_season"
    ),
    save: decorateLeader(
      rank(saves)[0] || null,
      "save_of_season"
    ),
    highlights: safeHighlights,
    likeCounts,
  };
}

// ============================
// CLUB FEATURED HIGHLIGHT
// ============================

export async function loadRecentClubHighlightsFromFirebase(
  clubId,
  { visibilityDays = 5 } = {}
) {
  const safeClubId =
    String(clubId || DEFAULT_CLUB_ID).trim().toLowerCase() ||
    DEFAULT_CLUB_ID;

  const safeDays = Math.max(1, Number(visibilityDays || 5));
  const cutoffMs = Date.now() - safeDays * 24 * 60 * 60 * 1000;
  const collected = [];

  const getTimestampMs = (item = {}) => {
    const firestoreValue =
      item.createdAt ||
      item.createdAtServer ||
      item.uploadedAt ||
      item.timestamp;

    const firestoreMs =
      firestoreValue?.toMillis?.() ||
      firestoreValue?.toDate?.()?.getTime?.();

    if (Number.isFinite(Number(firestoreMs))) {
      return Number(firestoreMs);
    }

    const parsed = new Date(
      item.matchDateISO ||
      item.createdAtISO ||
      item.createdAt ||
      item.uploadedAtISO ||
      item.uploadedAt ||
      item.timestamp ||
      ""
    ).getTime();

    return Number.isFinite(parsed) ? parsed : 0;
  };

  const getVotingCloseMs = (item = {}) => {
    const explicit = new Date(
      item.votingClosesAtISO ||
      item.votingEndsAtISO ||
      item.expiresAtISO ||
      ""
    ).getTime();

    if (Number.isFinite(explicit)) return explicit;

    const createdMs = getTimestampMs(item);
    return createdMs > 0
      ? createdMs + safeDays * 24 * 60 * 60 * 1000
      : 0;
  };

  const belongsToClub = (item = {}, matchId = "") => {
    const explicitClubId =
      item.clubId ||
      item.clubID ||
      item.clubSlug ||
      item.activeClubId ||
      item.matchContext?.clubId ||
      item.matchContext?.activeClubId ||
      item.metadata?.clubId ||
      item.metadata?.activeClubId ||
      "";

    if (explicitClubId) {
      return (
        String(explicitClubId).trim().toLowerCase() === safeClubId
      );
    }

    const safeMatchId = String(matchId || item.matchId || "")
      .trim()
      .toLowerCase();

    if (
      safeClubId !== DEFAULT_CLUB_ID &&
      safeMatchId.startsWith(`${safeClubId}__`)
    ) {
      return true;
    }

    const clubName =
      item.clubName ||
      item.uploaderClubName ||
      item.activeClubName ||
      item.matchContext?.clubName ||
      item.metadata?.clubName ||
      "";

    if (
      safeClubId === DEFAULT_CLUB_ID &&
      String(clubName).trim().toLowerCase().includes("turf")
    ) {
      return true;
    }

    /*
      Legacy untagged clips belong to Turf Kings only.
      This prevents old clips leaking into newer clubs.
    */
    return (
      safeClubId === DEFAULT_CLUB_ID &&
      !explicitClubId &&
      !safeMatchId.includes("__")
    );
  };

  try {
    /*
      Collection-group lookup is required because Firestore allows
      raw subcollections below parent match documents that do not
      themselves exist as materialised documents.
    */
    const snap = await getDocs(
      query(collectionGroup(db, "raw"), limit(250))
    );

    for (const clipDoc of snap.docs) {
      const data = clipDoc.data() || {};
      const parentMatchRef = clipDoc.ref.parent?.parent;
      const matchId =
        String(data.matchId || parentMatchRef?.id || "").trim();

      if (!belongsToClub(data, matchId)) continue;

      const votingCloseMs = getVotingCloseMs(data);
      const createdMs = getTimestampMs(data);

      const stillVisible =
        votingCloseMs > Date.now() ||
        (!votingCloseMs && createdMs >= cutoffMs);

      if (!stillVisible) continue;

      let resolvedUrl =
        data.downloadUrl ||
        data.videoUrl ||
        data.mediaUrl ||
        data.fileUrl ||
        data.publicUrl ||
        data.previewUrl ||
        data.url ||
        data.uri ||
        "";

      if (!resolvedUrl && data.storagePath) {
        try {
          resolvedUrl = await getDownloadURL(
            ref(storage, data.storagePath)
          );
        } catch (error) {
          console.warn(
            "[TK HIGHLIGHTS] Could not resolve recent clip URL:",
            data.storagePath,
            error
          );
        }
      }

      collected.push({
        id: clipDoc.id,
        clipId: data.clipId || clipDoc.id,
        ...data,
        matchId,
        videoUrl: data.videoUrl || resolvedUrl,
        downloadUrl: data.downloadUrl || resolvedUrl,
        mediaUrl: data.mediaUrl || resolvedUrl,
        votingClosesAtISO:
          data.votingClosesAtISO ||
          data.votingEndsAtISO ||
          (votingCloseMs
            ? new Date(votingCloseMs).toISOString()
            : null),
        recentClubFeed: true,
      });
    }

    const seen = new Set();

    return collected
      .filter((clip) => {
        const key = String(
          clip?.clipId || clip?.id || ""
        ).trim();

        if (!key) return true;
        if (seen.has(key)) return false;

        seen.add(key);
        return true;
      })
      .sort(
        (a, b) =>
          getTimestampMs(b) - getTimestampMs(a)
      );
  } catch (error) {
    console.warn(
      "[TK HIGHLIGHTS] Failed to load recent club clips:",
      safeClubId,
      error
    );
    return [];
  }
}


export async function getClubFeaturedHighlight(clubId) {
  if (!clubId) return null;

  const allVideos = [];

  const getUrl = (item = {}) =>
    item.downloadUrl ||
    item.videoUrl ||
    item.mediaUrl ||
    item.fileUrl ||
    item.publicUrl ||
    item.previewUrl ||
    item.url ||
    item.uri ||
    "";

  const hasUrl = (item = {}) => Boolean(getUrl(item) || item.storagePath);

  const belongsToClub = (item = {}) => {
    const explicitClubId =
      item.clubId ||
      item.clubID ||
      item.clubSlug ||
      item.activeClubId ||
      item.matchContext?.clubId ||
      item.matchContext?.activeClubId ||
      item.matchContext?.clubSlug ||
      item.metadata?.clubId ||
      item.metadata?.activeClubId ||
      "";

    if (explicitClubId) {
      return String(explicitClubId).trim().toLowerCase() === String(clubId).trim().toLowerCase();
    }

    const clubName =
      item.clubName ||
      item.activeClubName ||
      item.matchContext?.clubName ||
      item.matchContext?.activeClubName ||
      item.metadata?.clubName ||
      "";

    if (clubName && clubId === "turf-kings") {
      return String(clubName).toLowerCase().includes("turf");
    }

    // Older uploaded clips may not yet have club metadata.
    // Treat untagged legacy clips as Turf Kings only so they do not leak into other clubs.
    return String(clubId).trim().toLowerCase() === "turf-kings";
  };

  async function resolvePlayableUrl(item = {}) {
    const existingUrl = getUrl(item);

    if (existingUrl) {
      return {
        ...item,
        downloadUrl: item.downloadUrl || existingUrl,
        videoUrl: item.videoUrl || existingUrl,
        mediaUrl: item.mediaUrl || existingUrl,
      };
    }

    if (!item.storagePath) return item;

    try {
      const resolvedUrl = await getDownloadURL(ref(storage, item.storagePath));

      return {
        ...item,
        downloadUrl: resolvedUrl,
        videoUrl: resolvedUrl,
        mediaUrl: resolvedUrl,
      };
    } catch (error) {
      console.warn("[TK FEATURED HIGHLIGHT] Could not resolve storage URL:", item.storagePath, error);
      return item;
    }
  }

  async function collectFromMatchCollection(collectionRef, sourceLabel) {
    try {
      const matchDocsSnap = await getDocs(collectionRef);

      for (const matchDocSnap of matchDocsSnap.docs) {
        const matchId = matchDocSnap.id;
        const directData = matchDocSnap.data?.() || {};

        if (hasUrl(directData)) {
          allVideos.push({
            id: matchDocSnap.id,
            clipId: matchDocSnap.id,
            matchId,
            sourcePath: sourceLabel,
            ...directData,
          });
        }

        const [rawSnap, archivedSnap] = await Promise.allSettled([
          getDocs(collection(matchDocSnap.ref, "raw")),
          getDocs(collection(matchDocSnap.ref, "archived")),
        ]);

        if (rawSnap.status === "fulfilled") {
          rawSnap.value.docs.forEach((clipDoc) => {
            allVideos.push({
              id: clipDoc.id,
              clipId: clipDoc.id,
              matchId,
              sourcePath: `${sourceLabel}/${matchId}/raw`,
              ...clipDoc.data(),
            });
          });
        }

        if (archivedSnap.status === "fulfilled") {
          archivedSnap.value.docs.forEach((clipDoc) => {
            allVideos.push({
              id: clipDoc.id,
              clipId: clipDoc.id,
              matchId,
              sourcePath: `${sourceLabel}/${matchId}/archived`,
              ...clipDoc.data(),
            });
          });
        }
      }
    } catch (error) {
      console.warn("[TK FEATURED HIGHLIGHT] Skipped path:", sourceLabel, error);
    }
  }

  async function collectFromGroup(groupName) {
    try {
      const snap = await getDocs(query(collectionGroup(db, groupName), limit(50)));

      snap.docs.forEach((clipDoc) => {
        const data = clipDoc.data() || {};
        const parentMatchRef = clipDoc.ref.parent?.parent;

        allVideos.push({
          id: clipDoc.id,
          clipId: clipDoc.id,
          matchId: data.matchId || parentMatchRef?.id || "",
          sourcePath: `collectionGroup/${groupName}`,
          ...data,
        });
      });
    } catch (error) {
      console.warn("[TK FEATURED HIGHLIGHT] Collection-group scan failed:", groupName, error);
    }
  }

  try {
    await Promise.all([
      collectFromMatchCollection(
        collection(db, "clubs", clubId, CLUB_COLLECTIONS.videoHighlights),
        `clubs/${clubId}/${CLUB_COLLECTIONS.videoHighlights}`
      ),
      collectFromMatchCollection(
        collection(db, "clubs", clubId, "videoHighlights"),
        `clubs/${clubId}/videoHighlights`
      ),
      collectFromMatchCollection(
        collection(db, "clubs", clubId, "video_highlights"),
        `clubs/${clubId}/video_highlights`
      ),
      collectFromMatchCollection(
        collection(db, "video_highlights"),
        "video_highlights"
      ),
      collectFromMatchCollection(
        collection(db, "videoHighlights"),
        "videoHighlights"
      ),
      collectFromGroup("raw"),
      collectFromGroup("archived"),
    ]);

    const resolvedVideos = await Promise.all(
      allVideos
        .filter((item) => hasUrl(item))
        .filter((item) => belongsToClub(item))
        .map((item) => resolvePlayableUrl(item))
    );

    const videos = resolvedVideos.filter((item) => getUrl(item));

    console.log("[TK FEATURED HIGHLIGHT SEARCH]", {
      clubId,
      foundVideos: videos.length,
      videos,
    });

    if (!videos.length) return null;

    const getVotes = (item) =>
      Number(item.votes || item.voteCount || item.totalVotes || item.upvotes || 0);

    const getTime = (item) =>
      item.createdAt?.toMillis?.() ||
      item.createdAtServer?.toMillis?.() ||
      item.updatedAtServer?.toMillis?.() ||
      item.timestamp?.toMillis?.() ||
      new Date(
        item.createdAtISO ||
          item.createdAt ||
          item.timestamp ||
          item.uploadedAtISO ||
          item.archivedAtISO ||
          0
      ).getTime() ||
      0;

    videos.sort((a, b) => {
      const voteDiff = getVotes(b) - getVotes(a);
      if (voteDiff !== 0) return voteDiff;
      return getTime(b) - getTime(a);
    });

    return videos[0];
  } catch (error) {
    console.warn("[TK FEATURED HIGHLIGHT] Failed to load featured highlight:", clubId, error);
    return null;
  }
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
  loadRecentClubHighlightsFromFirebase,
  loadCurrentAwardLeadersFromFirebase,
  loadVideoCleanupQueueFromFirebase,
  toggleHighlightLike,
  loadHighlightLikesFromFirebase,
  loadHighlightLikesForMatchesFromFirebase,
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
  getClubFeaturedHighlight,
};

export default VideoHighlightsRepository;
