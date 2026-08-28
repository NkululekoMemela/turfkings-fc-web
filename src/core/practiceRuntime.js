// src/core/practiceRuntime.js
//
// Practice v2 authoritative runtime coordinator.
//
// This is the bridge between:
//   1. server-authorized Practice session creation
//   2. the real Official club roster (read-only)
//   3. the disposable Practice DataScope
//
// IMPORTANT:
// - Does not manufacture a synthetic Practice club identity.
// - Does not seed fake players.
// - Does not write Official football state.
// - Does not write sandbox football state.
// - Session identity/timing comes only from the server.

import {
  startPracticeSession,
} from "../storage/practiceSessionGateway.js";

import {
  buildPracticeSessionContext,
} from "./practiceSessionContext.js";

function requireId(value, label) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new Error(
      `[PracticeRuntime] ${label} is required.`
    );
  }

  if (normalized.includes("/")) {
    throw new Error(
      `[PracticeRuntime] ${label} must be a document ID.`
    );
  }

  return normalized;
}

function requireTimestamp(value, label) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new Error(
      `[PracticeRuntime] ${label} is required.`
    );
  }

  const parsed = Date.parse(normalized);

  if (!Number.isFinite(parsed)) {
    throw new Error(
      `[PracticeRuntime] ${label} must be a valid timestamp.`
    );
  }

  return normalized;
}

async function buildRuntimeFromAuthoritativeSession({
  clubId,
  authoritativeSession,
} = {}) {
  const safeClubId = requireId(clubId, "clubId");

  const sessionId = requireId(
    authoritativeSession?.sessionId,
    "session.sessionId"
  );

  const startedAt = requireTimestamp(
    authoritativeSession?.startedAt,
    "session.startedAt"
  );

  const expiresAt = requireTimestamp(
    authoritativeSession?.expiresAt,
    "session.expiresAt"
  );

  if (Date.parse(expiresAt) <= Date.parse(startedAt)) {
    throw new Error(
      "[PracticeRuntime] Authoritative Practice expiry must be after start."
    );
  }

  if (
    authoritativeSession?.clubId &&
    String(authoritativeSession.clubId).trim() !== safeClubId
  ) {
    throw new Error(
      "[PracticeRuntime] Authoritative Practice club mismatch."
    );
  }

  const context =
    await buildPracticeSessionContext({
      clubId: safeClubId,
      practiceSessionId: sessionId,
    });

  if (context.clubId !== safeClubId) {
    throw new Error(
      "[PracticeRuntime] Practice context club mismatch."
    );
  }

  if (context.practiceSessionId !== sessionId) {
    throw new Error(
      "[PracticeRuntime] Practice context session mismatch."
    );
  }

  return Object.freeze({
    practiceVersion: 2,
    environment: "practice",

    clubId: safeClubId,
    practiceSessionId: sessionId,

    startedAt,
    expiresAt,

    dataScope: context.dataScope,
    roster: context.roster,

    authoritativeSession: Object.freeze({
      ...authoritativeSession,
      sessionId,
      startedAt,
      expiresAt,
    }),
  });
}

export async function createPracticeRuntime({
  clubId,
} = {}) {
  const safeClubId = requireId(clubId, "clubId");

  const authoritativeSession =
    await startPracticeSession({
      clubId: safeClubId,
    });

  return buildRuntimeFromAuthoritativeSession({
    clubId: safeClubId,
    authoritativeSession,
  });
}

export async function restorePracticeRuntime({
  clubId,
  authoritativeSession,
} = {}) {
  return buildRuntimeFromAuthoritativeSession({
    clubId,
    authoritativeSession,
  });
}
