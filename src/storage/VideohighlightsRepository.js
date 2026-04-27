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
} from "firebase/storage";

import { db, storage } from "../firebaseConfig";

import {
  buildCurrentMatchDayId,
  buildRawHighlightFirebaseDoc,
  buildArchiveSelection,
  normalizeHighlightsList,
} from "../core/videoHighlightsUtils";

const ROOT = "appState_v2";
const ROOTDOC = "main";

function matchDayRef(matchDayId){
  return doc(
    db,
    ROOT,
    ROOTDOC,
    "matchdays",
    buildCurrentMatchDayId({ matchDayId })
  );
}

const rawRef = (id)=>
  collection(
    matchDayRef(id),
    "raw_highlights"
  );

const archiveRef = (id)=>
  collection(
    matchDayRef(id),
    "archived_highlights"
  );

const votesRef = (id)=>
  collection(
    matchDayRef(id),
    "highlight_votes"
  );

function rawDoc(matchDayId,clipId){
  return doc(
    rawRef(matchDayId),
    clipId
  );
}

function archiveDoc(matchDayId,clipId){
  return doc(
    archiveRef(matchDayId),
    clipId
  );
}

function voteDoc(matchDayId,userId){
  return doc(
    votesRef(matchDayId),
    userId
  );
}

export function buildVideoStoragePath({
  matchDayId,
  clipId,
  file,
  source="manual_upload",
}){
  const ext =
    file?.name?.split(".").pop() || "mp4";

  return `video_highlights/${matchDayId}/raw/${source}/${clipId}.${ext}`;
}

export async function uploadHighlightVideoFile({
  file,
  matchDayId,
  clipId,
  source="manual_upload",
}){
  if(!file){
    throw new Error(
      "No video file supplied"
    );
  }

  const path =
    buildVideoStoragePath({
      file,
      matchDayId,
      clipId,
      source,
    });

  const storageRef = ref(
    storage,
    path
  );

  await uploadBytes(
    storageRef,
    file
  );

  const url =
    await getDownloadURL(
      storageRef
    );

  return {
    storagePath:path,
    videoUrl:url,
    mediaUrl:url,
    downloadUrl:url,
  };
}

export async function saveRawHighlightDoc({
  matchDayId,
  highlight,
}){
  const payload =
    buildRawHighlightFirebaseDoc({
      ...highlight,
      matchDayId,
    });

  await setDoc(
    rawDoc(
      matchDayId,
      payload.clipId
    ),
    {
      ...payload,
      updatedAtServer:
        serverTimestamp(),
    },
    { merge:true }
  );

  return payload;
}

export async function uploadAndSaveRawHighlight({
  matchDayId,
  file,
  highlight,
}){
  const base =
    buildRawHighlightFirebaseDoc({
      ...highlight,
      matchDayId,
    });

  const uploaded =
    await uploadHighlightVideoFile({
      file,
      matchDayId,
      clipId:base.clipId,
      source:base.source,
    });

  return saveRawHighlightDoc({
    matchDayId,
    highlight:{
      ...base,
      ...uploaded,
    },
  });
}

export async function loadRawHighlightsFromFirebase(
  matchDayId
){
  const q = query(
    rawRef(matchDayId),
    orderBy(
      "createdAt",
      "desc"
    )
  );

  const snap =
    await getDocs(q);

  return normalizeHighlightsList(
    snap.docs.map(d=>({
      id:d.id,
      ...d.data(),
    }))
  );
}

export async function saveHighlightVotesToFirebase({
  matchDayId,
  userId,
  votes,
}){
  await setDoc(
    voteDoc(
      matchDayId,
      userId
    ),
    {
      ...votes,
      updatedAtServer:
        serverTimestamp(),
    },
    { merge:true }
  );
}

export async function loadHighlightVotesFromFirebase(
  matchDayId
){
  const snap =
    await getDocs(
      votesRef(
        matchDayId
      )
    );

  const out={};

  snap.docs.forEach(d=>{
    out[d.id]=d.data();
  });

  return out;
}

export async function archiveWinningHighlightsToFirebase({
  matchDayId,
  highlights,
  votesByUser,
}){
  const selection =
    buildArchiveSelection(
      highlights,
      votesByUser
    );

  const batch =
    writeBatch(db);

  selection.selectedHighlights
    .forEach(h=>{

      batch.set(
        archiveDoc(
          matchDayId,
          h.clipId
        ),
        {
          ...h,
          archived:true,
          archivedAt:
            new Date()
             .toISOString(),
        },
        { merge:true }
      );

    });

  await batch.commit();

  return selection;
}

export async function clearRawHighlightsFromFirebase(
  matchDayId
){
  const snap =
    await getDocs(
      rawRef(matchDayId)
    );

  const batch =
    writeBatch(db);

  snap.docs.forEach(d=>{
    batch.delete(
      d.ref
    );
  });

  await batch.commit();
}

export async function deleteRawHighlightFromFirebase({
  matchDayId,
  clipId,
}){
  await deleteDoc(
    rawDoc(
      matchDayId,
      clipId
    )
  );
}

export async function writeCameraLiveContextToFirebase({
  matchDayId,
  context,
}){
  await setDoc(
    doc(
      db,
      ROOT,
      ROOTDOC,
      "camera_contexts",
      matchDayId
    ),
    {
      ...context,
      updatedAtServer:
        serverTimestamp(),
    },
    { merge:true }
  );
}

export async function importExternalHighlight({
  matchDayId,
  provider="pushit",
  externalClip,
}){
  return saveRawHighlightDoc({
    matchDayId,
    highlight:{
      ...externalClip,
      source:provider,
    },
  });
}

const VideoHighlightsRepository = {
  uploadAndSaveRawHighlight,
  loadRawHighlightsFromFirebase,
  saveHighlightVotesToFirebase,
  loadHighlightVotesFromFirebase,
  archiveWinningHighlightsToFirebase,
  clearRawHighlightsFromFirebase,
  deleteRawHighlightFromFirebase,
  writeCameraLiveContextToFirebase,
  importExternalHighlight,
};

export default VideoHighlightsRepository;