// src/pages/ViewHighlightsPage.jsx

import React, { useEffect, useMemo, useRef, useState } from "react";
import VideoHighlightsRepository, {
  saveRawHighlightDoc,
} from "../storage/VideohighlightsRepository.js";

const MAX_VIDEO_SECONDS = 25;
const IDEAL_MIN_SECONDS = 15;
const IDEAL_MAX_SECONDS = 20;
const MAX_VIDEO_BYTES = 80 * 1024 * 1024; // 80 MB
const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
];

function safeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function toTitleCaseLoose(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeHighlightType(type) {
  const key = safeLower(type);
  if (key.includes("goal")) return "goal";
  if (key.includes("save")) return "save";
  if (key.includes("skill")) return "skill";
  return "other";
}

function getIdentityKey(identity) {
  if (!identity || typeof identity !== "object") return "";
  return String(
    identity.memberId ||
      identity.playerId ||
      identity.email ||
      identity.shortName ||
      identity.fullName ||
      identity.displayName ||
      ""
  )
    .trim()
    .toLowerCase();
}

function getIdentityDisplayName(identity) {
  if (!identity || typeof identity !== "object") return "Guest";
  return (
    identity.shortName ||
    identity.fullName ||
    identity.displayName ||
    identity.name ||
    identity.email ||
    "Guest"
  );
}

function buildLocalClipId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `clip-${crypto.randomUUID()}`;
  }
  return `clip-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getFileExtension(file) {
  const name = String(file?.name || "");
  const ext = name.includes(".") ? name.split(".").pop() : "mp4";
  return String(ext || "mp4").toLowerCase();
}

function formatFileSize(bytes) {
  const mb = Number(bytes || 0) / (1024 * 1024);
  if (!Number.isFinite(mb) || mb <= 0) return "0 MB";
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
}

function formatSeconds(value) {
  const total = Math.max(0, Math.round(Number(value || 0)));
  const minutes = Math.floor(total / 60).toString().padStart(2, "0");
  const seconds = (total % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatDate(value) {
  const d = new Date(value || Date.now());
  if (Number.isNaN(d.getTime())) return "Today";
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getHighlightMediaUrl(highlight) {
  return (
    highlight?.videoUrl ||
    highlight?.downloadUrl ||
    highlight?.mediaUrl ||
    highlight?.fileUrl ||
    highlight?.uri ||
    ""
  );
}

function getHighlightId(highlight, index = 0) {
  return (
    highlight?.clipId ||
    highlight?.id ||
    highlight?.highlightId ||
    `highlight-${index}`
  );
}

function getHighlightPlayerName(highlight) {
  return toTitleCaseLoose(
    highlight?.goalScorer ||
      highlight?.goalScorerName ||
      highlight?.scorer ||
      highlight?.playerName ||
      highlight?.player ||
      highlight?.keeperName ||
      highlight?.skillPlayer ||
      "Unknown"
  );
}

function getHighlightTitle(highlight) {
  const type = normalizeHighlightType(highlight?.tag || highlight?.type || "");
  const player = getHighlightPlayerName(highlight);

  if (highlight?.title) return highlight.title;
  if (type === "goal") return `Goal by ${player}`;
  if (type === "save") return `Save by ${player}`;
  if (type === "skill") return `Skill by ${player}`;
  return `Highlight by ${player}`;
}

function getStatus(highlight) {
  const raw = safeLower(highlight?.status || "");
  if (raw === "pending" || raw === "approved" || raw === "rejected") return raw;
  return "approved"; // old clips without moderation status remain visible
}

function normalizeHighlight(highlight, index = 0) {
  const id = getHighlightId(highlight, index);
  const normalizedType = normalizeHighlightType(highlight?.tag || highlight?.type || "");
  const playerName = getHighlightPlayerName(highlight);

  return {
    ...highlight,
    id,
    clipId: highlight?.clipId || id,
    highlightId: highlight?.highlightId || id,
    normalizedType,
    type: normalizedType,
    tag: normalizedType,
    status: getStatus(highlight),
    mediaUrl: getHighlightMediaUrl(highlight),
    playerName,
    title: getHighlightTitle(highlight),
    createdAt: highlight?.createdAt || highlight?.timestamp || new Date().toISOString(),
    votes: Number(highlight?.votes || 0),
  };
}

function getVoteBuckets(votesByUser, highlights) {
  const buckets = {};
  (highlights || []).forEach((highlight, index) => {
    buckets[getHighlightId(highlight, index)] = 0;
  });

  Object.values(votesByUser || {}).forEach((userVote) => {
    Object.values(userVote || {}).forEach((highlightId) => {
      if (highlightId && buckets[highlightId] != null) buckets[highlightId] += 1;
    });
  });

  return buckets;
}

function buildArchiveSelection(highlights, votesByUser) {
  const safeHighlights = Array.isArray(highlights) ? highlights : [];
  const voteCounts = getVoteBuckets(votesByUser, safeHighlights);

  const approved = safeHighlights
    .map((item, index) => normalizeHighlight(item, index))
    .filter((item) => item.status === "approved")
    .map((item) => ({ ...item, votes: voteCounts[item.id] || 0 }));

  const ranker = (a, b) => {
    if (b.votes !== a.votes) return b.votes - a.votes;
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  };

  const goals = approved.filter((item) => item.normalizedType === "goal").sort(ranker);
  const skills = approved.filter((item) => item.normalizedType === "skill").sort(ranker);
  const saves = approved.filter((item) => item.normalizedType === "save").sort(ranker);

  return {
    topGoals: goals.slice(0, 3),
    bestSkill: skills[0] || null,
    bestSave: saves[0] || null,
  };
}

function getNameFromPlayerEntry(entry) {
  if (typeof entry === "string") return toTitleCaseLoose(entry);
  if (!entry || typeof entry !== "object") return "";
  return toTitleCaseLoose(
    entry.fullName || entry.displayName || entry.shortName || entry.name || entry.playerName || ""
  );
}

function normalizeTeamsInput(teams) {
  if (Array.isArray(teams)) return teams;
  if (teams && typeof teams === "object") return Object.values(teams);
  return [];
}

function buildPlayerOptions({ members = [], teams = [], highlights = [] }) {
  const names = new Set();

  (Array.isArray(members) ? members : []).forEach((member) => {
    const name = getNameFromPlayerEntry(member);
    if (name) names.add(name);
  });

  normalizeTeamsInput(teams).forEach((team) => {
    (Array.isArray(team?.players) ? team.players : []).forEach((player) => {
      const name = getNameFromPlayerEntry(player);
      if (name) names.add(name);
    });
  });

  (Array.isArray(highlights) ? highlights : []).forEach((highlight) => {
    const name = getHighlightPlayerName(highlight);
    if (name && safeLower(name) !== "unknown") names.add(name);
  });

  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

function buildTeamOptions(teams = [], highlights = []) {
  const names = new Set();

  normalizeTeamsInput(teams).forEach((team) => {
    const label = toTitleCaseLoose(team?.label || team?.name || "");
    if (label) names.add(label);
  });

  (Array.isArray(highlights) ? highlights : []).forEach((highlight) => {
    const teamName = toTitleCaseLoose(highlight?.teamName || highlight?.teamLabel || "");
    if (teamName) names.add(teamName);
  });

  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

function readVideoDuration(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("No file selected."));
      return;
    }

    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
    };

    video.onloadedmetadata = () => {
      const duration = Number(video.duration || 0);
      cleanup();
      resolve(duration);
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("Could not read this video's duration."));
    };

    video.src = url;
  });
}

function typeBadgeLabel(type) {
  if (type === "goal") return "⚽ Goal";
  if (type === "save") return "🧤 Save";
  if (type === "skill") return "✨ Skill";
  return "🎬 Clip";
}

function statusBadgeLabel(status) {
  if (status === "pending") return "Pending";
  if (status === "rejected") return "Rejected";
  return "Approved";
}

function statusClass(status) {
  if (status === "pending") return "is-pending";
  if (status === "rejected") return "is-rejected";
  return "is-approved";
}

function buildFallbackMatchId({ matchType, gameFormat, activeSeasonId, currentMatchNo }) {
  const today = new Date().toISOString().slice(0, 10);
  const type = safeLower(matchType).includes("league") ? "league" : "friendly";
  const format = String(gameFormat || "5_V_5").toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (type === "league") {
    return `league_${String(activeSeasonId || "season").trim() || "season"}_${today}_m${Number(currentMatchNo || 1)}`;
  }
  return `friendly_${format}_${today}`;
}

function HighlightCard({
  highlight,
  voteCount = 0,
  isModerator = false,
  canVote = false,
  userVoteForType = null,
  onVote,
  onApprove,
  onReject,
  onDelete,
}) {
  const isSelectedVote = userVoteForType === highlight.id;

  return (
    <article className="tkh-card">
      <div className="tkh-card-head">
        <div className="tkh-card-title-block">
          <div className="tkh-player-name">{highlight.playerName}</div>
          <div className="tkh-clip-title">{highlight.title}</div>
        </div>

        <div className="tkh-badges">
          <span className="tkh-type-badge">{typeBadgeLabel(highlight.normalizedType)}</span>
          <span className={`tkh-status-badge ${statusClass(highlight.status)}`}>
            {statusBadgeLabel(highlight.status)}
          </span>
        </div>
      </div>

      {highlight.mediaUrl ? (
        <video
          className="tkh-video"
          controls
          preload="metadata"
          playsInline
          src={highlight.mediaUrl}
        />
      ) : (
        <div className="tkh-video-empty">Video URL not available yet.</div>
      )}

      <div className="tkh-meta-row">
        <span>{highlight.teamName ? toTitleCaseLoose(highlight.teamName) : "No team"}</span>
        <span>{highlight.durationSeconds ? formatSeconds(highlight.durationSeconds) : "Clip"}</span>
        <span>{voteCount} vote{voteCount === 1 ? "" : "s"}</span>
      </div>

      {highlight.assist && (
        <div className="tkh-soft-line">Assist: <strong>{toTitleCaseLoose(highlight.assist)}</strong></div>
      )}

      <div className="tkh-soft-line">
        Uploaded {formatDate(highlight.createdAt)}
        {highlight.createdByName ? ` by ${highlight.createdByName}` : ""}
      </div>

      <div className="tkh-card-actions">
        {highlight.status === "approved" &&
          canVote &&
          ["goal", "save", "skill"].includes(highlight.normalizedType) && (
            <button
              type="button"
              className={`tkh-btn tkh-btn-vote ${isSelectedVote ? "is-selected" : ""}`}
              onClick={() => onVote?.(highlight.normalizedType, highlight.id)}
            >
              {isSelectedVote ? "Selected" : "Vote"}
            </button>
          )}

        {isModerator && highlight.status === "pending" && (
          <>
            <button type="button" className="tkh-btn tkh-btn-approve" onClick={() => onApprove?.(highlight)}>
              Approve
            </button>
            <button type="button" className="tkh-btn tkh-btn-reject" onClick={() => onReject?.(highlight)}>
              Reject
            </button>
          </>
        )}

        {isModerator && (
          <button type="button" className="tkh-btn tkh-btn-danger" onClick={() => onDelete?.(highlight)}>
            Delete
          </button>
        )}
      </div>
    </article>
  );
}

export function ViewHighlightsPage({
  matchId,
  activeSeasonId = null,
  currentMatchNo = 1,
  matchType = "FRIENDLY",
  gameFormat = "5_V_5",
  identity,
  activeRole = "spectator",
  currentMatchDayHighlights = [],
  votesByUser = {},
  members = [],
  teams = [],
  onVotesChange,
  onHighlightsSelectionChange,
  onUploadHighlight,
  onApproveHighlight,
  onRejectHighlight,
  onDeleteHighlight,
  onBack,
}) {
  const fileInputRef = useRef(null);

  const resolvedMatchId = useMemo(
    () =>
      String(matchId || "").trim() ||
      buildFallbackMatchId({ matchType, gameFormat, activeSeasonId, currentMatchNo }),
    [matchId, matchType, gameFormat, activeSeasonId, currentMatchNo]
  );

  const [firebaseHighlights, setFirebaseHighlights] = useState([]);
  const [localHighlights, setLocalHighlights] = useState([]);
  const [localVotesByUser, setLocalVotesByUser] = useState(votesByUser || {});
  const [selectedTab, setSelectedTab] = useState("approved");
  const [selectedFilter, setSelectedFilter] = useState("all");
  const [loadingHighlights, setLoadingHighlights] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadNotice, setUploadNotice] = useState("");

  const [clipFile, setClipFile] = useState(null);
  const [clipPreviewUrl, setClipPreviewUrl] = useState("");
  const [clipDuration, setClipDuration] = useState(null);
  const [clipType, setClipType] = useState("goal");
  const [playerName, setPlayerName] = useState("");
  const [assistName, setAssistName] = useState("");
  const [teamName, setTeamName] = useState("");

  const identityKey = useMemo(() => getIdentityKey(identity), [identity]);
  const identityName = useMemo(() => getIdentityDisplayName(identity), [identity]);
  const role = safeLower(activeRole);
  const isLoggedIn = Boolean(identityKey);
  const isModerator = role === "admin" || role === "captain";
  const canUpload = isLoggedIn && ["admin", "captain", "player"].includes(role);

  const loadHighlights = async () => {
    if (!resolvedMatchId) return;

    try {
      setLoadingHighlights(true);
      setLoadError("");
      const loaded = await VideoHighlightsRepository.loadRawHighlightsFromFirebase(resolvedMatchId);
      setFirebaseHighlights(Array.isArray(loaded) ? loaded : []);
    } catch (error) {
      console.error("[TK HIGHLIGHTS] Failed to load highlights:", error);
      setLoadError(error?.message || "Could not load highlights from Firebase.");
    } finally {
      setLoadingHighlights(false);
    }
  };

  useEffect(() => {
    setLocalVotesByUser(votesByUser || {});
  }, [votesByUser]);

  useEffect(() => {
    loadHighlights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedMatchId]);

  useEffect(() => {
    return () => {
      if (clipPreviewUrl) URL.revokeObjectURL(clipPreviewUrl);
    };
  }, [clipPreviewUrl]);

  const allHighlights = useMemo(() => {
    const combined = [
      ...(Array.isArray(currentMatchDayHighlights) ? currentMatchDayHighlights : []),
      ...(Array.isArray(firebaseHighlights) ? firebaseHighlights : []),
      ...(Array.isArray(localHighlights) ? localHighlights : []),
    ];

    const seen = new Set();

    return combined
      .map((highlight, index) => normalizeHighlight(highlight, index))
      .filter((highlight) => {
        const key = String(highlight?.id || highlight?.clipId || "").trim();
        if (!key) return true;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [currentMatchDayHighlights, firebaseHighlights, localHighlights]);

  const playerOptions = useMemo(
    () => buildPlayerOptions({ members, teams, highlights: allHighlights }),
    [members, teams, allHighlights]
  );

  const teamOptions = useMemo(
    () => buildTeamOptions(teams, allHighlights),
    [teams, allHighlights]
  );

  const approvedHighlights = useMemo(
    () => allHighlights.filter((item) => item.status === "approved"),
    [allHighlights]
  );

  const pendingHighlights = useMemo(
    () => allHighlights.filter((item) => item.status === "pending"),
    [allHighlights]
  );

  const rejectedHighlights = useMemo(
    () => allHighlights.filter((item) => item.status === "rejected"),
    [allHighlights]
  );

  const tabHighlights = useMemo(() => {
    if (selectedTab === "pending") return pendingHighlights;
    if (selectedTab === "rejected") return rejectedHighlights;
    return approvedHighlights;
  }, [selectedTab, approvedHighlights, pendingHighlights, rejectedHighlights]);

  const visibleHighlights = useMemo(() => {
    if (selectedFilter === "all") return tabHighlights;
    return tabHighlights.filter((item) => item.normalizedType === selectedFilter);
  }, [tabHighlights, selectedFilter]);

  const voteCounts = useMemo(
    () => getVoteBuckets(localVotesByUser, approvedHighlights),
    [localVotesByUser, approvedHighlights]
  );

  const userVotes = localVotesByUser[identityKey] || {};

  const archiveSelection = useMemo(
    () => buildArchiveSelection(approvedHighlights, localVotesByUser),
    [approvedHighlights, localVotesByUser]
  );

  useEffect(() => {
    onHighlightsSelectionChange?.(archiveSelection);
  }, [archiveSelection, onHighlightsSelectionChange]);

  const resetUpload = () => {
    setClipFile(null);
    setClipDuration(null);
    setClipType("goal");
    setPlayerName("");
    setAssistName("");
    setTeamName("");
    setUploadError("");
    setUploadNotice("");

    if (clipPreviewUrl) URL.revokeObjectURL(clipPreviewUrl);
    setClipPreviewUrl("");

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const closeUploadModal = () => {
    if (uploading) return;
    setShowUploadModal(false);
    resetUpload();
  };

  const validateFileBasics = (file) => {
    if (!file) return "Please choose a video clip.";

    const type = String(file.type || "").trim().toLowerCase();
    const isAllowedType = type.startsWith("video/") || ALLOWED_VIDEO_TYPES.includes(type);

    if (!isAllowedType) return "Please choose a video file only.";
    if (file.size > MAX_VIDEO_BYTES) {
      return `This file is too large (${formatFileSize(file.size)}). Maximum size is ${formatFileSize(MAX_VIDEO_BYTES)}.`;
    }

    return "";
  };

  const handleFileChange = async (event) => {
    const file = event?.target?.files?.[0] || null;
    setUploadError("");
    setUploadNotice("");

    if (clipPreviewUrl) {
      URL.revokeObjectURL(clipPreviewUrl);
      setClipPreviewUrl("");
    }

    setClipFile(null);
    setClipDuration(null);

    const basicError = validateFileBasics(file);
    if (basicError) {
      if (file) setUploadError(basicError);
      return;
    }

    try {
      const duration = await readVideoDuration(file);

      if (!Number.isFinite(duration) || duration <= 0) {
        setUploadError("Could not confirm this clip duration. Please choose another video.");
        return;
      }

      if (duration > MAX_VIDEO_SECONDS) {
        setUploadError(
          `This clip is ${formatSeconds(duration)} long. Please upload a highlight of ${MAX_VIDEO_SECONDS} seconds or less.`
        );
        return;
      }

      if (duration < IDEAL_MIN_SECONDS || duration > IDEAL_MAX_SECONDS) {
        setUploadNotice(
          `Accepted, but ideal TurfKings highlights are ${IDEAL_MIN_SECONDS}–${IDEAL_MAX_SECONDS} seconds. This one is ${formatSeconds(duration)}.`
        );
      }

      setClipFile(file);
      setClipDuration(duration);
      setClipPreviewUrl(URL.createObjectURL(file));
    } catch (error) {
      setUploadError(error?.message || "Could not read this video file.");
    }
  };

  const handleSubmitUpload = async () => {
    setUploadError("");
    setUploadNotice("");

    if (!canUpload) {
      setUploadError("Only signed-in TurfKings players, captains, or admin can upload clips.");
      return;
    }

    const basicError = validateFileBasics(clipFile);
    if (basicError) {
      setUploadError(basicError);
      return;
    }

    const cleanPlayerName = toTitleCaseLoose(playerName);
    if (!cleanPlayerName) {
      setUploadError("Select the player shown in this highlight.");
      return;
    }

    if (!clipDuration || clipDuration > MAX_VIDEO_SECONDS) {
      setUploadError("Please choose a valid short highlight clip first.");
      return;
    }

    const normalizedType = normalizeHighlightType(clipType);
    const clipId = buildLocalClipId();
    const createdAt = new Date().toISOString();

    const payload = {
      file: clipFile,
      clipId,
      id: clipId,
      highlightId: clipId,
      source: "manual_upload",
      storageFileName: `${clipId}.${getFileExtension(clipFile)}`,
      status: "pending",
      type: normalizedType,
      tag: normalizedType,
      playerName: cleanPlayerName,
      goalScorer: normalizedType === "goal" ? cleanPlayerName : "",
      goalScorerName: normalizedType === "goal" ? cleanPlayerName : "",
      scorer: normalizedType === "goal" ? cleanPlayerName : "",
      keeperName: normalizedType === "save" ? cleanPlayerName : "",
      skillPlayer: normalizedType === "skill" ? cleanPlayerName : "",
      assist: normalizedType === "goal" ? toTitleCaseLoose(assistName) : "",
      teamName: toTitleCaseLoose(teamName),
      title:
        normalizedType === "goal"
          ? `Goal by ${cleanPlayerName}`
          : normalizedType === "save"
          ? `Save by ${cleanPlayerName}`
          : normalizedType === "skill"
          ? `Skill by ${cleanPlayerName}`
          : `Highlight by ${cleanPlayerName}`,
      durationSeconds: Math.round(clipDuration),
      fileSizeBytes: clipFile.size,
      matchId: resolvedMatchId,
      activeSeasonId,
      matchType,
      gameFormat,
      matchNo: currentMatchNo,
      createdBy: identityKey,
      createdByName: identityName,
      createdAt,
      timestamp: createdAt,
    };

    try {
      setUploading(true);

      let savedHighlight = null;

      if (resolvedMatchId) {
        savedHighlight = await VideoHighlightsRepository.uploadAndSaveRawHighlight({
          matchId: resolvedMatchId,
          file: clipFile,
          highlight: payload,
        });
      } else if (typeof onUploadHighlight === "function") {
        savedHighlight = await onUploadHighlight(payload);
      } else {
        throw new Error("Upload is not connected yet.");
      }

      const nextHighlight = normalizeHighlight(savedHighlight || payload);

      setLocalHighlights((prev) => {
        const existing = Array.isArray(prev) ? prev : [];
        const key = String(nextHighlight.id || nextHighlight.clipId || "").trim();
        if (key && existing.some((item) => String(item.id || item.clipId || "").trim() === key)) {
          return existing;
        }
        return [...existing, nextHighlight];
      });

      setSelectedTab("pending");
      setShowUploadModal(false);
      resetUpload();
      await loadHighlights();
    } catch (error) {
      console.error("[TK HIGHLIGHTS] Upload failed:", error);
      setUploadError(error?.message || "Failed to upload highlight.");
    } finally {
      setUploading(false);
    }
  };

  const upsertLocalHighlight = (highlight) => {
    const normalized = normalizeHighlight(highlight);
    const targetId = String(normalized?.id || normalized?.clipId || "").trim();
    if (!targetId) return;

    setLocalHighlights((prev) => {
      const existing = Array.isArray(prev) ? prev : [];
      const found = existing.some((item) => String(item.id || item.clipId || "").trim() === targetId);

      if (!found) return [...existing, normalized];

      return existing.map((item) =>
        String(item.id || item.clipId || "").trim() === targetId ? normalized : item
      );
    });

    setFirebaseHighlights((prev) =>
      (Array.isArray(prev) ? prev : []).map((item) =>
        String(item.id || item.clipId || "").trim() === targetId ? normalized : item
      )
    );
  };

  const removeLocalHighlight = (highlight) => {
    const targetId = String(highlight?.id || highlight?.clipId || "").trim();
    if (!targetId) return;

    const filterFn = (item) => String(item.id || item.clipId || "").trim() !== targetId;
    setLocalHighlights((prev) => (Array.isArray(prev) ? prev : []).filter(filterFn));
    setFirebaseHighlights((prev) => (Array.isArray(prev) ? prev : []).filter(filterFn));
  };

  const persistStatus = async (highlight, status) => {
    const updated = normalizeHighlight({ ...highlight, status, updatedAt: new Date().toISOString() });
    upsertLocalHighlight(updated);

    if (resolvedMatchId && updated.clipId) {
      await saveRawHighlightDoc({
        matchId: resolvedMatchId,
        highlight: updated,
      });
      await loadHighlights();
    }

    return updated;
  };

  const handleApprove = async (highlight) => {
    try {
      const updated = await persistStatus(highlight, "approved");
      await onApproveHighlight?.(updated);
      setSelectedTab("approved");
    } catch (error) {
      console.error("[TK HIGHLIGHTS] Approve failed:", error);
      window.alert(error?.message || "Could not approve this highlight.");
    }
  };

  const handleReject = async (highlight) => {
    try {
      const updated = await persistStatus(highlight, "rejected");
      await onRejectHighlight?.(updated);
    } catch (error) {
      console.error("[TK HIGHLIGHTS] Reject failed:", error);
      window.alert(error?.message || "Could not reject this highlight.");
    }
  };

  const handleDelete = async (highlight) => {
    const confirmed = window.confirm("Delete this highlight permanently?");
    if (!confirmed) return;

    try {
      removeLocalHighlight(highlight);

      if (resolvedMatchId && highlight?.clipId) {
        await VideoHighlightsRepository.deleteRawHighlightFromFirebase({
          matchId: resolvedMatchId,
          clipId: highlight.clipId,
          storagePath: highlight.storagePath,
        });
      }

      await onDeleteHighlight?.(highlight);
    } catch (error) {
      console.error("[TK HIGHLIGHTS] Delete failed:", error);
      window.alert(error?.message || "Could not delete this highlight.");
      await loadHighlights();
    }
  };

  const castVote = async (category, highlightId) => {
    if (!isLoggedIn) return;

    const next = {
      ...localVotesByUser,
      [identityKey]: {
        ...(localVotesByUser[identityKey] || {}),
        [category]: highlightId,
      },
    };

    setLocalVotesByUser(next);

    try {
      if (resolvedMatchId) {
        await VideoHighlightsRepository.saveHighlightVotesToFirebase({
          matchId: resolvedMatchId,
          userId: identityKey,
          votes: next[identityKey],
        });
      }
      await onVotesChange?.(next);
    } catch (error) {
      console.error("[TK HIGHLIGHTS] Vote save failed:", error);
    }
  };

  return (
    <div className="tkh-page">
      <style>{`
        .tkh-page {
          min-height: 100vh;
          color: #e5e7eb;
          background:
            radial-gradient(circle at 12% 0%, rgba(34,197,94,0.18), transparent 30%),
            radial-gradient(circle at 90% 0%, rgba(15,118,110,0.14), transparent 26%),
            linear-gradient(180deg, #020617 0%, #071426 46%, #08111f 100%);
          padding: 18px;
          box-sizing: border-box;
        }

        .tkh-shell {
          width: min(1180px, 100%);
          margin: 0 auto;
          display: grid;
          gap: 16px;
        }

        .tkh-panel,
        .tkh-card {
          background: rgba(15, 23, 42, 0.82);
          border: 1px solid rgba(148, 163, 184, 0.16);
          box-shadow: 0 18px 46px rgba(0,0,0,0.28);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .tkh-panel {
          border-radius: 22px;
          padding: 16px;
        }

        .tkh-hero {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
        }

        .tkh-title {
          margin: 0;
          font-size: clamp(2rem, 5vw, 3.35rem);
          line-height: 0.98;
          letter-spacing: -0.045em;
        }

        .tkh-subtitle {
          margin-top: 8px;
          color: rgba(226,232,240,0.76);
          font-size: 0.96rem;
        }

        .tkh-match-pill {
          display: inline-flex;
          width: fit-content;
          margin-top: 10px;
          border-radius: 999px;
          padding: 0.34rem 0.65rem;
          background: rgba(34,197,94,0.10);
          border: 1px solid rgba(34,197,94,0.22);
          color: #bbf7d0;
          font-size: 0.76rem;
          font-weight: 900;
          max-width: 100%;
          overflow-wrap: anywhere;
        }

        .tkh-actions,
        .tkh-card-actions,
        .tkh-tabs,
        .tkh-filters,
        .tkh-upload-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
        }

        .tkh-btn,
        .tkh-tab,
        .tkh-filter {
          appearance: none;
          border-radius: 999px;
          border: 1px solid rgba(148,163,184,0.22);
          color: #e5e7eb;
          background: rgba(255,255,255,0.055);
          padding: 0.66rem 0.9rem;
          font-weight: 900;
          cursor: pointer;
          line-height: 1;
          touch-action: manipulation;
        }

        .tkh-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .tkh-btn-primary,
        .tkh-tab.is-active,
        .tkh-filter.is-active,
        .tkh-btn-vote.is-selected,
        .tkh-btn-approve {
          background: rgba(34,197,94,0.17);
          border-color: rgba(34,197,94,0.42);
          color: #bbf7d0;
          box-shadow: 0 0 20px rgba(34,197,94,0.10);
        }

        .tkh-btn-primary {
          background: linear-gradient(135deg, rgba(34,197,94,0.96), rgba(21,128,61,0.94));
          color: #052e16;
          border-color: rgba(134,239,172,0.5);
        }

        .tkh-btn-reject,
        .tkh-btn-danger {
          background: rgba(239,68,68,0.13);
          border-color: rgba(248,113,113,0.34);
          color: #fecaca;
        }

        .tkh-summary-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }

        .tkh-summary-card {
          border-radius: 18px;
          padding: 12px;
          background: rgba(255,255,255,0.045);
          border: 1px solid rgba(148,163,184,0.14);
          min-width: 0;
        }

        .tkh-summary-label {
          color: rgba(226,232,240,0.68);
          font-size: 0.78rem;
          font-weight: 850;
        }

        .tkh-summary-value {
          margin-top: 4px;
          font-size: 1.28rem;
          font-weight: 1000;
          overflow-wrap: anywhere;
        }

        .tkh-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
        }

        .tkh-card {
          min-width: 0;
          overflow: hidden;
          border-radius: 22px;
          padding: 12px;
          display: grid;
          gap: 10px;
        }

        .tkh-card-head {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: flex-start;
        }

        .tkh-card-title-block { min-width: 0; }

        .tkh-player-name {
          font-size: 1.18rem;
          font-weight: 1000;
          line-height: 1.05;
          overflow-wrap: anywhere;
        }

        .tkh-clip-title {
          margin-top: 3px;
          color: rgba(226,232,240,0.72);
          font-size: 0.86rem;
          overflow-wrap: anywhere;
        }

        .tkh-badges {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 6px;
          flex: 0 0 auto;
        }

        .tkh-type-badge,
        .tkh-status-badge {
          border-radius: 999px;
          padding: 0.32rem 0.52rem;
          font-size: 0.72rem;
          font-weight: 1000;
          white-space: nowrap;
          border: 1px solid rgba(255,255,255,0.14);
        }

        .tkh-type-badge {
          background: rgba(255,255,255,0.07);
          color: #e5e7eb;
        }

        .tkh-status-badge.is-approved {
          background: rgba(34,197,94,0.16);
          border-color: rgba(34,197,94,0.36);
          color: #bbf7d0;
        }

        .tkh-status-badge.is-pending {
          background: rgba(250,204,21,0.14);
          border-color: rgba(250,204,21,0.34);
          color: #fde68a;
        }

        .tkh-status-badge.is-rejected {
          background: rgba(248,113,113,0.14);
          border-color: rgba(248,113,113,0.34);
          color: #fecaca;
        }

        .tkh-video {
          width: 100%;
          aspect-ratio: 16 / 9;
          max-height: 520px;
          border-radius: 16px;
          background: #000;
          object-fit: contain;
        }

        .tkh-video-empty,
        .tkh-empty {
          display: grid;
          place-items: center;
          text-align: center;
          border-radius: 18px;
          border: 1px dashed rgba(148,163,184,0.24);
          color: rgba(226,232,240,0.70);
          font-weight: 850;
        }

        .tkh-video-empty { min-height: 180px; }
        .tkh-empty { padding: 28px 16px; }

        .tkh-meta-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          color: rgba(226,232,240,0.72);
          font-size: 0.82rem;
        }

        .tkh-meta-row span,
        .tkh-soft-line { overflow-wrap: anywhere; }

        .tkh-soft-line {
          color: rgba(226,232,240,0.72);
          font-size: 0.84rem;
        }

        .tkh-system-note,
        .tkh-error-box {
          border-radius: 16px;
          padding: 0.78rem 0.9rem;
          font-weight: 850;
          line-height: 1.35;
        }

        .tkh-system-note {
          background: rgba(34,197,94,0.09);
          border: 1px solid rgba(34,197,94,0.22);
          color: #bbf7d0;
        }

        .tkh-error-box {
          background: rgba(239,68,68,0.13);
          border: 1px solid rgba(248,113,113,0.32);
          color: #fecaca;
        }

        .tkh-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 20000;
          display: grid;
          place-items: center;
          padding: 16px;
          background: rgba(2,6,23,0.74);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }

        .tkh-modal {
          width: min(680px, 100%);
          max-height: min(86vh, 820px);
          overflow: auto;
          border-radius: 24px;
          background: linear-gradient(180deg, rgba(15,23,42,0.98), rgba(2,6,23,0.98));
          border: 1px solid rgba(148,163,184,0.20);
          box-shadow: 0 26px 80px rgba(0,0,0,0.55);
          padding: 16px;
          box-sizing: border-box;
        }

        .tkh-modal-head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
          margin-bottom: 12px;
        }

        .tkh-modal-title {
          margin: 0;
          font-size: 1.5rem;
        }

        .tkh-form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .tkh-field {
          display: grid;
          gap: 6px;
          min-width: 0;
        }

        .tkh-field label {
          font-size: 0.84rem;
          font-weight: 950;
          color: rgba(226,232,240,0.88);
        }

        .tkh-input,
        .tkh-select {
          width: 100%;
          box-sizing: border-box;
          border-radius: 14px;
          border: 1px solid rgba(148,163,184,0.24);
          background: rgba(255,255,255,0.06);
          color: #e5e7eb;
          padding: 0.74rem 0.82rem;
          outline: none;
        }

        .tkh-select option {
          background: #0f172a;
          color: #e5e7eb;
        }

        .tkh-help {
          color: rgba(226,232,240,0.66);
          font-size: 0.78rem;
          line-height: 1.35;
        }

        .tkh-warning,
        .tkh-error {
          margin-top: 12px;
          border-radius: 16px;
          padding: 0.76rem 0.9rem;
          font-weight: 850;
          line-height: 1.35;
        }

        .tkh-warning {
          background: rgba(250,204,21,0.13);
          border: 1px solid rgba(250,204,21,0.30);
          color: #fde68a;
        }

        .tkh-error {
          background: rgba(239,68,68,0.14);
          border: 1px solid rgba(248,113,113,0.32);
          color: #fecaca;
        }

        .tkh-preview-video {
          width: 100%;
          max-height: 380px;
          border-radius: 18px;
          background: #000;
          object-fit: contain;
        }

        .tkh-upload-actions {
          margin-top: 14px;
          justify-content: flex-end;
        }

        @media (max-width: 980px) {
          .tkh-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .tkh-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }

        @media (max-width: 620px) {
          .tkh-page { padding: 12px; }
          .tkh-panel { padding: 13px; border-radius: 18px; }
          .tkh-actions, .tkh-upload-actions { width: 100%; }
          .tkh-actions .tkh-btn, .tkh-upload-actions .tkh-btn { width: 100%; }
          .tkh-grid, .tkh-form-grid { grid-template-columns: 1fr; }
          .tkh-summary-grid { grid-template-columns: 1fr 1fr; }
          .tkh-card-head { flex-direction: column; }
          .tkh-badges { flex-direction: row; align-items: center; flex-wrap: wrap; }
          .tkh-card-actions .tkh-btn { flex: 1 1 auto; }
        }
      `}</style>

      <div className="tkh-shell">
        <section className="tkh-panel tkh-hero">
          <div>
            <h1 className="tkh-title">Video Highlights</h1>
            <div className="tkh-subtitle">
              Upload short match clips, review them safely, then vote for the best moments.
            </div>
            <div className="tkh-subtitle">
              Signed in as <strong>{identityName}</strong> • Role: <strong>{activeRole}</strong>
            </div>
            <div className="tkh-match-pill">Storage: video_highlights / {resolvedMatchId}</div>
          </div>

          <div className="tkh-actions">
            <button
              type="button"
              className="tkh-btn tkh-btn-primary"
              onClick={() => setShowUploadModal(true)}
              disabled={!canUpload}
              title={canUpload ? "Upload a short highlight" : "Sign in as a player, captain, or admin to upload"}
            >
              Upload clip
            </button>
            <button type="button" className="tkh-btn" onClick={loadHighlights} disabled={loadingHighlights}>
              {loadingHighlights ? "Refreshing..." : "Refresh"}
            </button>
            <button type="button" className="tkh-btn" onClick={onBack}>
              Back
            </button>
          </div>
        </section>

        {loadError && <section className="tkh-error-box">{loadError}</section>}

        <section className="tkh-panel">
          <div className="tkh-summary-grid">
            <div className="tkh-summary-card">
              <div className="tkh-summary-label">Approved clips</div>
              <div className="tkh-summary-value">{approvedHighlights.length}</div>
            </div>
            <div className="tkh-summary-card">
              <div className="tkh-summary-label">Pending review</div>
              <div className="tkh-summary-value">{pendingHighlights.length}</div>
            </div>
            <div className="tkh-summary-card">
              <div className="tkh-summary-label">Best skill</div>
              <div className="tkh-summary-value">{archiveSelection.bestSkill?.playerName || "Pending"}</div>
            </div>
            <div className="tkh-summary-card">
              <div className="tkh-summary-label">Best save</div>
              <div className="tkh-summary-value">{archiveSelection.bestSave?.playerName || "Pending"}</div>
            </div>
          </div>
        </section>

        <section className="tkh-panel">
          <div className="tkh-tabs">
            <button
              type="button"
              className={`tkh-tab ${selectedTab === "approved" ? "is-active" : ""}`}
              onClick={() => setSelectedTab("approved")}
            >
              Approved ({approvedHighlights.length})
            </button>

            {isModerator && (
              <button
                type="button"
                className={`tkh-tab ${selectedTab === "pending" ? "is-active" : ""}`}
                onClick={() => setSelectedTab("pending")}
              >
                Pending ({pendingHighlights.length})
              </button>
            )}

            {isModerator && rejectedHighlights.length > 0 && (
              <button
                type="button"
                className={`tkh-tab ${selectedTab === "rejected" ? "is-active" : ""}`}
                onClick={() => setSelectedTab("rejected")}
              >
                Rejected ({rejectedHighlights.length})
              </button>
            )}
          </div>

          <div className="tkh-filters" style={{ marginTop: 10 }}>
            {["all", "goal", "save", "skill", "other"].map((filter) => (
              <button
                key={filter}
                type="button"
                className={`tkh-filter ${selectedFilter === filter ? "is-active" : ""}`}
                onClick={() => setSelectedFilter(filter)}
              >
                {filter === "all" ? "All" : toTitleCaseLoose(filter)}
              </button>
            ))}
          </div>
        </section>

        {!isModerator && pendingHighlights.length > 0 && (
          <section className="tkh-system-note">
            {pendingHighlights.length} uploaded clip{pendingHighlights.length === 1 ? " is" : "s are"} waiting for captain/admin review.
          </section>
        )}

        {visibleHighlights.length === 0 ? (
          <section className="tkh-panel tkh-empty">
            {selectedTab === "pending"
              ? "No clips are waiting for review."
              : selectedTab === "rejected"
              ? "No rejected clips."
              : "No approved highlights yet. Upload clips and approve them here."}
          </section>
        ) : (
          <section className="tkh-grid">
            {visibleHighlights.map((highlight) => (
              <HighlightCard
                key={highlight.id}
                highlight={highlight}
                voteCount={voteCounts[highlight.id] || 0}
                isModerator={isModerator}
                canVote={isLoggedIn}
                userVoteForType={userVotes[highlight.normalizedType] || null}
                onVote={castVote}
                onApprove={handleApprove}
                onReject={handleReject}
                onDelete={handleDelete}
              />
            ))}
          </section>
        )}

        <section className="tkh-panel">
          <h3 style={{ margin: "0 0 10px" }}>End Match Day archive preview</h3>
          <div className="tkh-meta-row">
            <span>
              Top goals: <strong>{archiveSelection.topGoals.map((g) => g.playerName).join(", ") || "Pending"}</strong>
            </span>
            <span>
              Best skill: <strong>{archiveSelection.bestSkill?.playerName || "Pending"}</strong>
            </span>
            <span>
              Best save: <strong>{archiveSelection.bestSave?.playerName || "Pending"}</strong>
            </span>
          </div>
        </section>
      </div>

      {showUploadModal && (
        <div className="tkh-modal-backdrop">
          <div className="tkh-modal" role="dialog" aria-modal="true" aria-label="Upload highlight clip">
            <div className="tkh-modal-head">
              <div>
                <h2 className="tkh-modal-title">Upload clip</h2>
                <div className="tkh-help">
                  Short match highlights only. Clips go to pending review before the team can see them.
                </div>
              </div>
              <button type="button" className="tkh-btn" onClick={closeUploadModal} disabled={uploading}>
                Close
              </button>
            </div>

            <div className="tkh-form-grid">
              <div className="tkh-field" style={{ gridColumn: "1 / -1" }}>
                <label>Video file</label>
                <input
                  ref={fileInputRef}
                  className="tkh-input"
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm,video/*"
                  onChange={handleFileChange}
                  disabled={uploading}
                />
                <div className="tkh-help">
                  Maximum {MAX_VIDEO_SECONDS}s and {formatFileSize(MAX_VIDEO_BYTES)}. Ideal: {IDEAL_MIN_SECONDS}–{IDEAL_MAX_SECONDS}s.
                </div>
              </div>

              <div className="tkh-field">
                <label>Highlight type</label>
                <select className="tkh-select" value={clipType} onChange={(e) => setClipType(e.target.value)} disabled={uploading}>
                  <option value="goal">Goal</option>
                  <option value="save">Save</option>
                  <option value="skill">Skill</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="tkh-field">
                <label>{clipType === "goal" ? "Scorer / player shown" : "Player shown"}</label>
                <input
                  className="tkh-input"
                  list="tkh-player-options"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Select or type player"
                  disabled={uploading}
                />
                <datalist id="tkh-player-options">
                  {playerOptions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>

              {clipType === "goal" && (
                <div className="tkh-field">
                  <label>Assist</label>
                  <input
                    className="tkh-input"
                    list="tkh-player-options"
                    value={assistName}
                    onChange={(e) => setAssistName(e.target.value)}
                    placeholder="Optional"
                    disabled={uploading}
                  />
                </div>
              )}

              <div className="tkh-field">
                <label>Team</label>
                <input
                  className="tkh-input"
                  list="tkh-team-options"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="Optional"
                  disabled={uploading}
                />
                <datalist id="tkh-team-options">
                  {teamOptions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
            </div>

            {clipFile && (
              <div className="tkh-help" style={{ marginTop: 12 }}>
                Selected: <strong>{clipFile.name}</strong> • {formatFileSize(clipFile.size)}
                {clipDuration ? ` • ${formatSeconds(clipDuration)}` : ""}
              </div>
            )}

            {clipPreviewUrl && (
              <div style={{ marginTop: 12 }}>
                <video className="tkh-preview-video" controls playsInline preload="metadata" src={clipPreviewUrl} />
              </div>
            )}

            {uploadNotice && <div className="tkh-warning">{uploadNotice}</div>}
            {uploadError && <div className="tkh-error">{uploadError}</div>}

            <div className="tkh-upload-actions">
              <button type="button" className="tkh-btn" onClick={resetUpload} disabled={uploading}>
                Reset
              </button>
              <button
                type="button"
                className="tkh-btn tkh-btn-primary"
                onClick={handleSubmitUpload}
                disabled={uploading || !clipFile}
              >
                {uploading ? "Uploading..." : "Submit for review"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ViewHighlightsPage;