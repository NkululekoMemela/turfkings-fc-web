// src/pages/VideoHighlightsPage.jsx

import React, { useEffect, useMemo, useRef, useState } from "react";
import VideoHighlightsRepository, {
  saveRawHighlightDoc,
} from "../storage/VideoHighlightsRepository.js";

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

const PENDING_PLAYER = "Player pending";
const PENDING_TEAM = "Team pending";
const PENDING_CLUB = "Club pending";

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
    identity.uid ||
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

function getIdentityClub(identity) {
  if (!identity || typeof identity !== "object") return "Turf Kings";
  return toTitleCaseLoose(
    identity.clubName ||
      identity.club ||
      identity.homeClubName ||
      identity.organizationName ||
      "Turf Kings"
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

function getCurrentWeekVotingDeadline(nowInput = new Date()) {
  const now = nowInput instanceof Date ? new Date(nowInput) : new Date(nowInput || Date.now());
  const safeNow = Number.isNaN(now.getTime()) ? new Date() : now;
  const deadline = new Date(safeNow);
  const day = deadline.getDay(); // 0 = Sunday
  const daysUntilSunday = (7 - day) % 7;

  deadline.setDate(deadline.getDate() + daysUntilSunday);
  deadline.setHours(23, 59, 59, 999);

  return deadline;
}

function formatVotingDeadline(deadlineInput) {
  const deadline = deadlineInput instanceof Date ? deadlineInput : new Date(deadlineInput || Date.now());
  if (Number.isNaN(deadline.getTime())) return "Sunday night";

  return deadline.toLocaleDateString(undefined, {
    weekday: "long",
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

function firstCleanName(...values) {
  for (const value of values) {
    const clean = toTitleCaseLoose(value);
    if (clean && !["Unknown", "Undefined", "Null", "Na"].includes(clean)) return clean;
  }
  return "";
}

function getHighlightPlayerName(highlight) {
  return (
    firstCleanName(
      highlight?.goalScorer,
      highlight?.goalScorerName,
      highlight?.scorer,
      highlight?.playerName,
      highlight?.player,
      highlight?.keeperName,
      highlight?.skillPlayer
    ) || PENDING_PLAYER
  );
}

function getHighlightTeamName(highlight) {
  return (
    firstCleanName(
      highlight?.teamName,
      highlight?.teamLabel,
      highlight?.sideName,
      highlight?.team
    ) || PENDING_TEAM
  );
}

function getHighlightClubName(highlight) {
  return (
    firstCleanName(
      highlight?.clubName,
      highlight?.club,
      highlight?.ownerClubName,
      highlight?.uploaderClubName
    ) || PENDING_CLUB
  );
}

function needsPlayer(highlight) {
  return safeLower(getHighlightPlayerName(highlight)) === safeLower(PENDING_PLAYER);
}

function needsTeam(highlight) {
  return safeLower(getHighlightTeamName(highlight)) === safeLower(PENDING_TEAM);
}

function needsClub(highlight) {
  return safeLower(getHighlightClubName(highlight)) === safeLower(PENDING_CLUB);
}

function getHighlightTitle(highlight) {
  const type = normalizeHighlightType(highlight?.tag || highlight?.type || "");
  const player = getHighlightPlayerName(highlight);
  const isPending = safeLower(player) === safeLower(PENDING_PLAYER);

  if (highlight?.title && !safeLower(highlight.title).includes("unknown")) return highlight.title;

  if (type === "goal") return isPending ? "Goal clip" : `Goal by ${player}`;
  if (type === "save") return isPending ? "Save clip" : `Save by ${player}`;
  if (type === "skill") return isPending ? "Skill clip" : `Skill by ${player}`;
  return isPending ? "Match clip" : `Highlight by ${player}`;
}

function getStatus(highlight) {
  const raw = safeLower(highlight?.status || "");
  if (raw === "pending" || raw === "approved" || raw === "rejected") return raw;
  return "approved";
}

function normalizeHighlight(highlight, index = 0) {
  const id = getHighlightId(highlight, index);
  const normalizedType = normalizeHighlightType(highlight?.tag || highlight?.type || "");
  const playerName = getHighlightPlayerName(highlight);
  const teamName = getHighlightTeamName(highlight);
  const clubName = getHighlightClubName(highlight);

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
    teamName,
    clubName,
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
    topGoals: goals.slice(0, 2),
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
    if (name && safeLower(name) !== safeLower(PENDING_PLAYER)) names.add(name);
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
    const teamName = getHighlightTeamName(highlight);
    if (teamName && safeLower(teamName) !== safeLower(PENDING_TEAM)) names.add(teamName);
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

function describeUploadError(error, stage = "upload") {
  const code = String(error?.code || "").trim();
  const message = String(error?.message || "").trim();

  if (code.includes("storage/unauthorized")) {
    return "Firebase Storage rejected the video upload. Check Storage rules for video_highlights uploads.";
  }

  if (code.includes("storage/canceled")) return "The upload was cancelled before it finished.";
  if (code.includes("storage/quota-exceeded")) return "Firebase Storage quota was exceeded.";

  if (code.includes("permission-denied")) {
    return "Firestore rejected the highlight details after the video upload.";
  }

  if (stage === "validation") return message || "The selected file failed validation.";
  if (stage === "firestore") return message || "The video uploaded, but clip details could not be saved.";
  if (stage === "storage") return message || "Firebase Storage failed while uploading the video.";

  return message || "Upload failed. Please try again.";
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

function getTeamLabel(team, fallback = "") {
  return toTitleCaseLoose(team?.label || team?.name || team?.teamName || fallback);
}

function getFeaturedTeamNames(teams = [], matchType = "FRIENDLY") {
  const names = normalizeTeamsInput(teams)
    .map((team, index) => getTeamLabel(team, `Team ${index + 1}`))
    .filter(Boolean);

  const isLeague = safeLower(matchType).includes("league");

  if (isLeague) return names.slice(0, 3);
  return names.slice(0, 2);
}

function getMatchupLabel(highlight, teams = [], matchType = "FRIENDLY") {
  const explicit = firstCleanName(
    highlight?.matchup,
    highlight?.fixtureLabel,
    highlight?.matchLabel,
    highlight?.opponentLabel
  );
  if (explicit && explicit.includes(" vs ")) return explicit;

  const home = firstCleanName(
    highlight?.homeTeamName,
    highlight?.homeTeam,
    highlight?.teamAName,
    highlight?.teamA
  );
  const away = firstCleanName(
    highlight?.awayTeamName,
    highlight?.awayTeam,
    highlight?.teamBName,
    highlight?.teamB,
    highlight?.opponentName,
    highlight?.opponent
  );
  if (home && away) return `${home} vs ${away}`;

  const featured = getFeaturedTeamNames(teams, matchType);
  if (featured.length >= 2) return `${featured[0]} vs ${featured[1]}`;

  const teamName = getHighlightTeamName(highlight);
  return safeLower(teamName) === safeLower(PENDING_TEAM) ? "Matchup pending" : teamName;
}

function getTeamContextText(teams = [], matchType = "FRIENDLY") {
  const featured = getFeaturedTeamNames(teams, matchType);
  const isLeague = safeLower(matchType).includes("league");

  if (isLeague) return featured.length ? featured.join(" • ") : "League teams pending";
  if (featured.length >= 2) return `${featured[0]} vs ${featured[1]}`;
  if (featured.length === 1) return featured[0];
  return "Friendly teams pending";
}

function getFilterLabel(filter) {
  if (filter === "all") return "All";
  if (filter === "goal") return "Goals";
  if (filter === "save") return "Saves";
  if (filter === "skill") return "Skills";
  return "MOM-ish 😅";
}

function getHighlightMatchDayKey(highlight) {
  const explicit = String(
    highlight?.matchDayId ||
      highlight?.matchdayId ||
      highlight?.matchDate ||
      highlight?.archiveMatchDayId ||
      highlight?.createdDate ||
      ""
  ).trim();

  if (explicit) return explicit;

  const rawDate =
    highlight?.archivedAtISO ||
    highlight?.createdAtISO ||
    highlight?.createdAt ||
    highlight?.timestamp ||
    highlight?.uploadedAtISO ||
    highlight?.uploadedAt ||
    "";

  const d = new Date(rawDate || Date.now());
  if (Number.isNaN(d.getTime())) return "Current match day";
  return d.toISOString().slice(0, 10);
}

function formatMatchDayHeading(value) {
  const raw = String(value || "").trim();
  const d = new Date(raw);

  if (Number.isNaN(d.getTime())) return raw || "Current match day";

  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function groupTopVotedClipsByMatchDay(highlights = [], votesById = {}) {
  const clips = (Array.isArray(highlights) ? highlights : [])
    .map((item, index) => normalizeHighlight(item, index))
    .filter((item) => ["goal", "save", "skill"].includes(item.normalizedType))
    .map((item) => ({ ...item, votes: votesById[item.id] || Number(item.votes || 0) }))
    .sort((a, b) => {
      const dayDiff = String(getHighlightMatchDayKey(b)).localeCompare(String(getHighlightMatchDayKey(a)));
      if (dayDiff !== 0) return dayDiff;
      if (Number(b.votes || 0) !== Number(a.votes || 0)) return Number(b.votes || 0) - Number(a.votes || 0);
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

  const map = new Map();
  clips.forEach((clip) => {
    const key = getHighlightMatchDayKey(clip);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(clip);
  });

  return Array.from(map.entries()).map(([matchDayId, items]) => ({
    matchDayId,
    label: formatMatchDayHeading(matchDayId),
    clips: items,
  }));
}

function getCurationWinners(result) {
  if (!result || typeof result !== "object") return [];

  const directWinners = Array.isArray(result.winners) ? result.winners : [];
  const fallbackWinners = [
    ...(Array.isArray(result.topGoals) ? result.topGoals : []),
    result.bestSave || null,
    result.bestSkill || null,
  ].filter(Boolean);

  const combined = directWinners.length ? directWinners : fallbackWinners;
  const seen = new Set();

  return combined.filter((clip, index) => {
    const key = getHighlightId(clip, index);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getMissingBadges(highlight) {
  const badges = [];
  if (needsPlayer(highlight)) badges.push("Needs player");
  if (needsTeam(highlight)) badges.push("Needs team");
  if (needsClub(highlight)) badges.push("Needs club");
  return badges;
}

function HighlightCard({
  highlight,
  teams = [],
  matchType = "FRIENDLY",
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
  const missingBadges = getMissingBadges(highlight);
  const matchupLabel = getMatchupLabel(highlight, teams, matchType);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const handleShare = async () => {
    const url = getHighlightMediaUrl(highlight);
    if (!url) return;

    try {
      if (canShare) {
        await navigator.share({
          title: highlight.title || "Club highlight",
          text: `${highlight.title || "Club highlight"} • ${matchupLabel}`,
          url,
        });
        return;
      }

      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        window.alert("Highlight link copied.");
      }
    } catch (error) {
      console.error("[TK HIGHLIGHTS] Share failed:", error);
    }
  };

  return (
    <article className="tkh-card">
      <div className="tkh-card-top">
        <div className="tkh-card-title-block">
          <div className="tkh-player-name">{highlight.playerName}</div>
          <div className="tkh-clip-title">{highlight.title}</div>
        </div>

        <span className={`tkh-status-badge ${statusClass(highlight.status)}`}>
          {statusBadgeLabel(highlight.status)}
        </span>
      </div>

      <video
        className="tkh-video"
        controls
        preload="metadata"
        playsInline
        src={highlight.mediaUrl}
      />

      <div className="tkh-badge-row">
        <span className="tkh-type-badge">{typeBadgeLabel(highlight.normalizedType)}</span>
        {missingBadges.map((badge) => (
          <span key={badge} className="tkh-missing-badge">{badge}</span>
        ))}
      </div>

      <div className="tkh-meta-row">
        <span>{highlight.clubName}</span>
        <span className="tkh-matchup-label">{matchupLabel}</span>
        <span>{highlight.teamName}</span>
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

        {highlight.mediaUrl && (
          <button type="button" className="tkh-btn" onClick={handleShare}>
            {canShare ? "Share" : "Copy link"}
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

export function VideoHighlightsPage({
  matchId,
  activeClubId = "turf-kings",
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

  const resolvedMatchId = useMemo(() => {
    const baseMatchId =
      String(matchId || "").trim() ||
      buildFallbackMatchId({ matchType, gameFormat, activeSeasonId, currentMatchNo });

    const clubId = String(activeClubId || "turf-kings").trim().toLowerCase();

    // Keep Turf Kings on the legacy path so old clips remain visible.
    if (!clubId || clubId === "turf-kings") return baseMatchId;

    // Every other club gets its own isolated video highlight folder.
    return `${clubId}__${baseMatchId}`;
  }, [matchId, activeClubId, matchType, gameFormat, activeSeasonId, currentMatchNo]);

  const [firebaseHighlights, setFirebaseHighlights] = useState([]);
  const [archivedHighlights, setArchivedHighlights] = useState([]);
  const [localHighlights, setLocalHighlights] = useState([]);
  const [localVotesByUser, setLocalVotesByUser] = useState(votesByUser || {});
  const [mainTab, setMainTab] = useState("currentWeek");
  const [selectedTab, setSelectedTab] = useState("approved");
  const [selectedFilter, setSelectedFilter] = useState("all");
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [loadingHighlights, setLoadingHighlights] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [curationResult, setCurationResult] = useState(null);
  const [runningCuration, setRunningCuration] = useState(false);
  const [cleanupInProgress, setCleanupInProgress] = useState(false);
  const [curationNotice, setCurationNotice] = useState("");

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadNotice, setUploadNotice] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");
  const [uploadStage, setUploadStage] = useState("idle");
  const [uploadStep, setUploadStep] = useState("Waiting for clip");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadDebug, setUploadDebug] = useState(null);

  const [clipFile, setClipFile] = useState(null);
  const [clipPreviewUrl, setClipPreviewUrl] = useState("");
  const [clipDuration, setClipDuration] = useState(null);
  const [clipType, setClipType] = useState("goal");
  const [playerName, setPlayerName] = useState("");
  const [assistName, setAssistName] = useState("");
  const [teamName, setTeamName] = useState("");

  const [nowTick, setNowTick] = useState(() => Date.now());

  const identityKey = useMemo(() => getIdentityKey(identity), [identity]);
  const identityName = useMemo(() => getIdentityDisplayName(identity), [identity]);
  const defaultClubName = useMemo(() => getIdentityClub(identity), [identity]);
  const role = safeLower(activeRole);
  const isLoggedIn = Boolean(identityKey);
  const isModerator = role === "admin" || role === "captain";
  const canUpload = isLoggedIn && ["admin", "captain", "player"].includes(role);
  const isLeagueMode = safeLower(matchType).includes("league");
  const teamContextText = useMemo(() => getTeamContextText(teams, matchType), [teams, matchType]);
  const featuredTeamNames = useMemo(() => getFeaturedTeamNames(teams, matchType), [teams, matchType]);
  const votingDeadline = useMemo(() => getCurrentWeekVotingDeadline(nowTick), [nowTick]);
  const votingDeadlineLabel = useMemo(() => formatVotingDeadline(votingDeadline), [votingDeadline]);
  const votingWindowClosed = nowTick > votingDeadline.getTime();

  useEffect(() => {
    const handleScroll = () => setHeaderScrolled(window.scrollY > 6);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const loadHighlights = async () => {
    if (!resolvedMatchId) return;

    try {
      setLoadingHighlights(true);
      setLoadError("");
      const [loaded, archived] = await Promise.all([
        VideoHighlightsRepository.loadRawHighlightsFromFirebase(resolvedMatchId),
        typeof VideoHighlightsRepository.loadArchivedHighlightsFromFirebase === "function"
          ? VideoHighlightsRepository.loadArchivedHighlightsFromFirebase(resolvedMatchId)
          : Promise.resolve([]),
      ]);
      setFirebaseHighlights(Array.isArray(loaded) ? loaded : []);
      setArchivedHighlights(Array.isArray(archived) ? archived : []);
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

  const currentTopVotedClips = useMemo(
    () => [
      ...archiveSelection.topGoals,
      archiveSelection.bestSave,
      archiveSelection.bestSkill,
    ].filter(Boolean),
    [archiveSelection.topGoals, archiveSelection.bestSave, archiveSelection.bestSkill]
  );

  const currentTopVotedClipNames = useMemo(
    () =>
      currentTopVotedClips
        .map((clip) => clip?.playerName || clip?.title || "")
        .filter(Boolean)
        .join(", "),
    [currentTopVotedClips]
  );

  const topVotedClipGroups = useMemo(() => {
    const source = archivedHighlights.length ? archivedHighlights : currentTopVotedClips;
    return groupTopVotedClipsByMatchDay(source, voteCounts);
  }, [archivedHighlights, currentTopVotedClips, voteCounts]);

  useEffect(() => {
    if (votingWindowClosed) {
      setMainTab("winners");
    }
  }, [votingWindowClosed]);

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
    setUploadSuccess("");
    setUploadStage("idle");
    setUploadStep("Waiting for clip");
    setUploadProgress(0);
    setUploadDebug(null);

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
    setUploadSuccess("");
    setUploadStage(file ? "validation" : "idle");
    setUploadStep(file ? "Checking file..." : "Waiting for clip");
    setUploadProgress(0);
    setUploadDebug(null);

    if (clipPreviewUrl) {
      URL.revokeObjectURL(clipPreviewUrl);
      setClipPreviewUrl("");
    }

    setClipFile(null);
    setClipDuration(null);

    const basicError = validateFileBasics(file);
    if (basicError) {
      if (file) {
        setUploadStage("failed");
        setUploadStep("Validation failed");
        setUploadError(basicError);
      }
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
          `Accepted. Ideal highlights are ${IDEAL_MIN_SECONDS}–${IDEAL_MAX_SECONDS}s. This one is ${formatSeconds(duration)}.`
        );
      }

      setClipFile(file);
      setClipDuration(duration);
      setClipPreviewUrl(URL.createObjectURL(file));
      setUploadStage("ready");
      setUploadStep("Ready to upload");
      setUploadProgress(0);
    } catch (error) {
      setUploadStage("failed");
      setUploadStep("Could not read duration");
      setUploadError(describeUploadError(error, "validation"));
    }
  };

  const handleSubmitUpload = async () => {
    setUploadError("");
    setUploadNotice("");
    setUploadSuccess("");
    setUploadStage("validation");
    setUploadStep("Checking upload details...");
    setUploadProgress(0);
    setUploadDebug(null);

    if (!canUpload) {
      setUploadStage("failed");
      setUploadStep("Upload blocked");
      setUploadError("Only signed-in players, captains, or admin can upload clips.");
      return;
    }

    const basicError = validateFileBasics(clipFile);
    if (basicError) {
      setUploadStage("failed");
      setUploadStep("Validation failed");
      setUploadError(basicError);
      return;
    }

    if (!clipDuration || clipDuration > MAX_VIDEO_SECONDS) {
      setUploadStage("failed");
      setUploadStep("Invalid clip");
      setUploadError("Please choose a valid short highlight clip first.");
      return;
    }

    const cleanPlayerName = toTitleCaseLoose(playerName) || PENDING_PLAYER;
    const cleanTeamName = toTitleCaseLoose(teamName) || PENDING_TEAM;
    const cleanClubName = defaultClubName || PENDING_CLUB;
    const normalizedType = normalizeHighlightType(clipType);
    const clipId = buildLocalClipId();
    const createdAt = new Date().toISOString();
    const cleanAssistName = normalizedType === "goal" ? toTitleCaseLoose(assistName) : "";

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
      clubName: cleanClubName,
      uploaderClubName: cleanClubName,
      playerName: cleanPlayerName,
      goalScorer: normalizedType === "goal" && cleanPlayerName !== PENDING_PLAYER ? cleanPlayerName : "",
      goalScorerName: normalizedType === "goal" && cleanPlayerName !== PENDING_PLAYER ? cleanPlayerName : "",
      scorer: normalizedType === "goal" && cleanPlayerName !== PENDING_PLAYER ? cleanPlayerName : "",
      keeperName: normalizedType === "save" && cleanPlayerName !== PENDING_PLAYER ? cleanPlayerName : "",
      skillPlayer: normalizedType === "skill" && cleanPlayerName !== PENDING_PLAYER ? cleanPlayerName : "",
      assist: cleanAssistName,
      teamName: cleanTeamName,
      title:
        normalizedType === "goal"
          ? cleanPlayerName === PENDING_PLAYER ? "Goal clip" : `Goal by ${cleanPlayerName}`
          : normalizedType === "save"
          ? cleanPlayerName === PENDING_PLAYER ? "Save clip" : `Save by ${cleanPlayerName}`
          : normalizedType === "skill"
          ? cleanPlayerName === PENDING_PLAYER ? "Skill clip" : `Skill by ${cleanPlayerName}`
          : cleanPlayerName === PENDING_PLAYER ? "Match clip" : `Highlight by ${cleanPlayerName}`,
      metadataComplete: cleanPlayerName !== PENDING_PLAYER && cleanTeamName !== PENDING_TEAM,
      needsPlayer: cleanPlayerName === PENDING_PLAYER,
      needsTeam: cleanTeamName === PENDING_TEAM,
      durationSeconds: Math.round(clipDuration),
      fileSizeBytes: clipFile.size,
      matchId: resolvedMatchId,
      activeClubId,
      clubId: activeClubId,
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
      setUploadStage("metadata");
      setUploadStep("Preparing upload...");
      setUploadProgress(3);

      let savedHighlight = null;

      if (resolvedMatchId) {
        savedHighlight = await VideoHighlightsRepository.uploadAndSaveRawHighlight({
          matchId: resolvedMatchId,
          file: clipFile,
          highlight: payload,
          onProgress: (progress) => {
            const stage = progress?.stage || "storage";
            const percent = Number(progress?.percent ?? progress ?? 0);

            setUploadStage(stage);
            setUploadDebug(progress || null);

            if (stage === "metadata") {
              setUploadStep(progress?.message || "Preparing highlight folder...");
              setUploadProgress(5);
            } else if (stage === "storage") {
              const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
              setUploadStep(`Uploading video... ${safePercent}%`);
              setUploadProgress(Math.max(5, Math.min(92, Math.round(safePercent * 0.87 + 5))));
            } else if (stage === "firestore") {
              setUploadStep(progress?.message || "Saving clip details...");
              setUploadProgress(95);
            } else if (stage === "complete") {
              setUploadStep("Upload complete.");
              setUploadProgress(100);
            }
          },
        });
      } else if (typeof onUploadHighlight === "function") {
        setUploadStage("storage");
        setUploadStep("Uploading through App.jsx...");
        setUploadProgress(20);
        savedHighlight = await onUploadHighlight(payload);
        setUploadProgress(100);
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
      setUploadStage("complete");
      setUploadStep("Upload complete. Waiting for review.");
      setUploadProgress(100);
      setUploadSuccess("Clip uploaded successfully.");
      await loadHighlights();

      window.setTimeout(() => {
        setShowUploadModal(false);
        resetUpload();
      }, 850);
    } catch (error) {
      console.error("[TK HIGHLIGHTS] Upload failed:", error);
      const failedStage = uploadStage === "firestore" || uploadStage === "metadata" ? "firestore" : "storage";
      setUploadStage("failed");
      setUploadStep(failedStage === "firestore" ? "Failed while saving clip details" : "Failed while uploading video");
      setUploadError(describeUploadError(error, failedStage));
      setUploadDebug({
        stage: failedStage,
        code: error?.code || null,
        message: error?.message || String(error || "Unknown upload error"),
      });
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
    const updated = normalizeHighlight({
      ...highlight,
      status,
      updatedAt: new Date().toISOString(),
      approvedWithMissingDetails:
        status === "approved" && (needsPlayer(highlight) || needsTeam(highlight)),
    });

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

  const handleRunCuration = async () => {
    if (!isModerator) return;

    try {
      setRunningCuration(true);
      setCurationNotice("");

      const result = await VideoHighlightsRepository.runVideoHighlightCuration({
        matchId: resolvedMatchId,
        highlights: approvedHighlights,
        votesByUser: localVotesByUser,
        curationMeta: {
          matchType,
          gameFormat,
          activeSeasonId,
          currentMatchNo,
          teamContextText,
        },
      });

      setCurationResult(result);
      setMainTab("currentWeek");
      setSelectedTab("approved");
      setSelectedFilter("all");
    } catch (error) {
      console.error("[TK HIGHLIGHTS] Curation failed:", error);
      window.alert(error?.message || "Could not run curation.");
    } finally {
      setRunningCuration(false);
    }
  };

  const handleConfirmCleanup = async () => {
    if (!isModerator || !curationResult) return;

    const cleanupCandidates = Array.isArray(curationResult.cleanupCandidates)
      ? curationResult.cleanupCandidates
      : [];

    const winners = getCurationWinners(curationResult);

    const confirmed = window.confirm(
      `Confirm cleanup? ${winners.length} winning clip${winners.length === 1 ? "" : "s"} will be archived permanently and ${cleanupCandidates.length} non-winning clip${cleanupCandidates.length === 1 ? "" : "s"} will be removed from Firebase.`
    );

    if (!confirmed) return;

    try {
      setCleanupInProgress(true);
      setCurationNotice("");

      const confirmCleanup =
        VideoHighlightsRepository.confirmCleanupAndArchiveHighlights ||
        VideoHighlightsRepository.confirmAndDeleteVideoCleanupCandidates;

      const result = await confirmCleanup({
        matchId: resolvedMatchId,
        winners,
        cleanupCandidates,
        curationRunId: curationResult.curationRunId || "",
        curationMeta: {
          matchType,
          gameFormat,
          activeSeasonId,
          currentMatchNo,
          teamContextText,
        },
      });

      (result?.deleted || []).forEach((clip) => removeLocalHighlight(clip));

      await loadHighlights();
      setMainTab("winners");
      setCurationNotice(
        `Cleanup complete. ${result?.archivedCount ?? winners.length} winner${(result?.archivedCount ?? winners.length) === 1 ? "" : "s"} archived and ${result?.deletedCount ?? cleanupCandidates.length} clip${(result?.deletedCount ?? cleanupCandidates.length) === 1 ? "" : "s"} removed.`
      );
      setCurationResult(null);
    } catch (error) {
      console.error("[TK HIGHLIGHTS] Cleanup failed:", error);
      window.alert(error?.message || "Could not complete cleanup.");
      await loadHighlights();
    } finally {
      setCleanupInProgress(false);
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
    <div className="page video-highlights-page">
      <style>{`
        .video-highlights-page {
          padding-bottom: calc(92px + env(safe-area-inset-bottom, 0px));
        }

        .video-highlights-page *,
        .video-highlights-page *::before,
        .video-highlights-page *::after {
          box-sizing: border-box;
        }

        .video-highlights-page .header-title {
          min-width: 0;
        }

        .video-highlights-page .header-title h1 {
          margin: 0;
          max-width: 100%;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .tkh-ribbon-subtitle-line {
          margin: 0.35rem 0 0 !important;
          color: rgba(226, 232, 240, 0.82) !important;
          font-weight: 850;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .tkh-page-intro {
          display: grid;
          gap: 0.55rem;
        }

        .tkh-intro-copy {
          margin: 0;
          max-width: 680px;
          color: rgba(226, 232, 240, 0.80);
          font-size: 0.92rem;
          line-height: 1.42;
        }

        .tkh-feature-line {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
          align-items: baseline;
          color: rgba(226, 232, 240, 0.72);
          font-size: 0.86rem;
          line-height: 1.35;
        }

        .tkh-feature-line strong {
          color: #f8fafc;
          font-weight: 950;
        }

        .tkh-voting-window-note {
          width: fit-content;
          max-width: 100%;
          border-radius: 0.95rem;
          padding: 0.58rem 0.72rem;
          background: rgba(250, 204, 21, 0.12);
          border: 1px solid rgba(250, 204, 21, 0.26);
          color: #fde68a;
          font-size: 0.82rem;
          font-weight: 850;
          line-height: 1.35;
        }

        .tkh-page-intro h2 {
          margin: 0;
          color: #ffffff;
          font-size: clamp(1.55rem, 4vw, 2.15rem);
          line-height: 1.08;
        }

        .tkh-subtitle,
        .tkh-soft-line,
        .tkh-meta-row {
          color: rgba(226, 232, 240, 0.72);
        }

        .tkh-matchup-label {
          color: #f8fafc;
          font-weight: 950;
        }

        .tkh-header-actions {
          display: flex;
          gap: 0.55rem;
          flex-wrap: wrap;
          align-items: center;
          margin-top: 0.28rem;
        }

        .tkh-header-actions .tkh-btn {
          min-width: 104px;
          padding: 0.58rem 0.95rem;
        }

        .tkh-card-section {
          display: grid;
          gap: 0.9rem;
        }

        .tkh-btn {
          appearance: none;
          border-radius: 999px;
          border: 1px solid rgba(148, 163, 184, 0.38);
          color: #e5e7eb;
          background: rgba(15, 23, 42, 0.92);
          padding: 0.66rem 0.9rem;
          font-weight: 900;
          cursor: pointer;
          line-height: 1;
          touch-action: manipulation;
          box-shadow: none;
          text-shadow: none;
        }

        .tkh-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .tkh-btn-primary {
          background: linear-gradient(135deg, #16a34a, #22c55e);
          border-color: rgba(187, 247, 208, 0.65);
          color: #052e16;
          box-shadow: 0 12px 24px rgba(22, 163, 74, 0.22);
        }

        .tkh-btn-vote.is-selected,
        .tkh-btn-approve {
          background: rgba(34, 197, 94, 0.16);
          border-color: rgba(34, 197, 94, 0.42);
          color: #bbf7d0;
        }

        .tkh-btn-reject,
        .tkh-btn-danger {
          background: rgba(127, 29, 29, 0.42);
          border-color: rgba(248, 113, 113, 0.38);
          color: #fecaca;
        }

        .tkh-view-toggle {
          width: min(100%, 360px);
          max-width: 100%;
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0;
          padding: 0.22rem;
          border-radius: 999px;
          background: rgba(2, 6, 23, 0.88);
          border: 1px solid rgba(148, 163, 184, 0.16);
          overflow: hidden;
        }

        .tkh-view-toggle .pill-toggle {
          min-width: 0;
          width: 100%;
          justify-content: center;
          font-weight: 900;
          border-radius: 999px;
        }

        .tkh-view-toggle .pill-toggle-active {
          background: #f8fafc !important;
          color: #020617 !important;
          box-shadow: 0 10px 22px rgba(2, 6, 23, 0.25);
        }

        .tkh-compact-filter-row {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.65rem;
          padding: 0.75rem;
          border-radius: 1rem;
          border: 1px solid rgba(148, 163, 184, 0.18);
          background: rgba(15, 23, 42, 0.42);
        }

        .tkh-compact-select-label {
          display: grid;
          gap: 0.35rem;
          color: rgba(226, 232, 240, 0.66);
          font-size: 0.72rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .tkh-compact-select,
        .tkh-input,
        .tkh-select {
          width: 100%;
          min-width: 0;
          border-radius: 0.85rem;
          border: 1px solid rgba(148, 163, 184, 0.34);
          background: #0f172a;
          color: #e5e7eb;
          padding: 0.76rem 0.82rem;
          font-size: 0.9rem;
          font-weight: 850;
          outline: none;
        }

        .tkh-compact-select option,
        .tkh-select option {
          background: #0f172a;
          color: #e5e7eb;
        }

        .tkh-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.85rem;
          min-width: 0;
        }

        .tkh-card {
          min-width: 0;
          overflow: hidden;
          border-radius: 1rem;
          padding: 0.72rem;
          display: grid;
          gap: 0.6rem;
          background: rgba(15, 23, 42, 0.74);
          border: 1px solid rgba(148, 163, 184, 0.22);
        }

        .tkh-card-top {
          display: flex;
          justify-content: space-between;
          gap: 0.75rem;
          align-items: flex-start;
        }

        .tkh-card-title-block { min-width: 0; }

        .tkh-player-name {
          font-size: 1.02rem;
          font-weight: 1000;
          line-height: 1.1;
          color: #ffffff;
          overflow-wrap: anywhere;
        }

        .tkh-clip-title {
          margin-top: 0.18rem;
          color: rgba(226, 232, 240, 0.70);
          font-size: 0.8rem;
          overflow-wrap: anywhere;
        }

        .tkh-status-badge {
          background: transparent;
          border: 0;
          padding: 0;
          border-radius: 0;
          font-size: 0.68rem;
          font-weight: 1000;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .tkh-status-badge.is-approved { color: #86efac; }
        .tkh-status-badge.is-pending { color: #fde68a; }
        .tkh-status-badge.is-rejected { color: #fecaca; }

        .tkh-type-badge,
        .tkh-missing-badge,
        .tkh-winners-badge,
        .tkh-winner-rank {
          border-radius: 999px;
          padding: 0.3rem 0.5rem;
          font-size: 0.7rem;
          font-weight: 1000;
          white-space: nowrap;
          border: 1px solid rgba(255, 255, 255, 0.14);
        }

        .tkh-type-badge {
          background: rgba(148, 163, 184, 0.12);
          color: #e5e7eb;
        }

        .tkh-missing-badge,
        .tkh-winners-badge,
        .tkh-winner-rank {
          background: rgba(250, 204, 21, 0.12);
          border-color: rgba(250, 204, 21, 0.30);
          color: #fde68a;
        }

        .tkh-video,
        .tkh-preview-video {
          width: 100%;
          max-width: 100%;
          border-radius: 0.85rem;
          background: #000;
          object-fit: contain;
        }

        .tkh-video {
          aspect-ratio: 16 / 9;
          max-height: 520px;
        }

        .tkh-preview-video {
          max-height: 380px;
        }

        .tkh-meta-row,
        .tkh-card-actions,
        .tkh-badge-row,
        .tkh-archive {
          display: flex;
          gap: 0.45rem;
          flex-wrap: wrap;
          align-items: center;
        }

        .tkh-meta-row {
          font-size: 0.78rem;
          line-height: 1.35;
        }

        .tkh-meta-row span,
        .tkh-soft-line {
          overflow-wrap: anywhere;
        }

        .tkh-soft-line {
          font-size: 0.8rem;
          line-height: 1.35;
        }

        .tkh-empty,
        .tkh-empty-mini,
        .tkh-system-note,
        .tkh-error-box,
        .tkh-matchday-goal-stack {
          display: grid;
          gap: 1rem;
        }

        .tkh-matchday-goal-group {
          display: grid;
          gap: 0.7rem;
          padding: 0.78rem;
          border-radius: 1rem;
          border: 1px solid rgba(148, 163, 184, 0.16);
          background: rgba(15, 23, 42, 0.28);
        }

        .tkh-matchday-goal-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          flex-wrap: wrap;
        }

        .tkh-matchday-goal-head h3 {
          margin: 0;
        }

        .tkh-matchday-goal-head span {
          border-radius: 999px;
          padding: 0.3rem 0.6rem;
          color: #fde68a;
          background: rgba(250, 204, 21, 0.11);
          border: 1px solid rgba(250, 204, 21, 0.22);
          font-size: 0.76rem;
          font-weight: 950;
        }

        .tkh-cleanup-note {
          border-radius: 1rem;
          padding: 0.9rem;
          font-weight: 850;
          line-height: 1.35;
        }

        .tkh-empty,
        .tkh-empty-mini {
          display: grid;
          place-items: center;
          text-align: center;
          border: 1px dashed rgba(148, 163, 184, 0.34);
          color: rgba(226, 232, 240, 0.70);
        }

        .tkh-system-note,
        .tkh-matchday-goal-stack {
          display: grid;
          gap: 1rem;
        }

        .tkh-matchday-goal-group {
          display: grid;
          gap: 0.7rem;
          padding: 0.78rem;
          border-radius: 1rem;
          border: 1px solid rgba(148, 163, 184, 0.16);
          background: rgba(15, 23, 42, 0.28);
        }

        .tkh-matchday-goal-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          flex-wrap: wrap;
        }

        .tkh-matchday-goal-head h3 {
          margin: 0;
        }

        .tkh-matchday-goal-head span {
          border-radius: 999px;
          padding: 0.3rem 0.6rem;
          color: #fde68a;
          background: rgba(250, 204, 21, 0.11);
          border: 1px solid rgba(250, 204, 21, 0.22);
          font-size: 0.76rem;
          font-weight: 950;
        }

        .tkh-cleanup-note {
          background: rgba(14, 165, 233, 0.08);
          border: 1px solid rgba(56, 189, 248, 0.20);
          color: #bae6fd;
        }

        .tkh-error-box,
        .tkh-error {
          background: rgba(127, 29, 29, 0.36);
          border: 1px solid rgba(248, 113, 113, 0.34);
          color: #fecaca;
        }

        .tkh-archive {
          color: rgba(226, 232, 240, 0.74);
          font-size: 0.82rem;
          line-height: 1.35;
          padding-top: 0.2rem;
          border-top: 1px solid rgba(148, 163, 184, 0.16);
        }

        .tkh-winners-panel,
        .tkh-winner-section,
        .tkh-winner-card-wrap {
          display: grid;
          gap: 0.75rem;
        }

        .tkh-winners-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
        }

        .tkh-winners-head h2,
        .tkh-winner-section h3 {
          margin: 0;
          color: #ffffff;
        }

        .tkh-winners-head p {
          margin: 0.35rem 0 0;
          color: rgba(226, 232, 240, 0.70);
          font-size: 0.84rem;
          line-height: 1.35;
        }

        .tkh-winner-two-col {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.85rem;
        }

        .tkh-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 20000;
          display: grid;
          place-items: center;
          padding: 1rem;
          background: rgba(2, 6, 23, 0.74);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }

        .tkh-modal {
          width: min(620px, 100%);
          max-height: min(86vh, 820px);
          overflow: auto;
          border-radius: 1.25rem;
          background: #101827;
          border: 1px solid rgba(148, 163, 184, 0.34);
          padding: 1rem;
          box-sizing: border-box;
        }

        .tkh-modal-head {
          display: flex;
          justify-content: space-between;
          gap: 0.8rem;
          align-items: flex-start;
          margin-bottom: 0.8rem;
        }

        .tkh-modal-title {
          margin: 0;
          font-size: 1.35rem;
          color: #ffffff;
        }

        .tkh-form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.75rem;
        }

        .tkh-field {
          display: grid;
          gap: 0.36rem;
          min-width: 0;
        }

        .tkh-field label {
          font-size: 0.82rem;
          font-weight: 950;
          color: rgba(226, 232, 240, 0.88);
        }

        .tkh-help {
          color: rgba(226, 232, 240, 0.66);
          font-size: 0.78rem;
          line-height: 1.35;
        }

        .tkh-warning,
        .tkh-error,
        .tkh-success,
        .tkh-upload-progress {
          margin-top: 0.75rem;
          border-radius: 1rem;
          padding: 0.76rem 0.9rem;
          font-weight: 850;
          line-height: 1.35;
        }

        .tkh-warning {
          margin-top: 0.75rem;
          border-radius: 1rem;
          padding: 0.86rem 0.95rem;
          background:
            radial-gradient(circle at 0% 0%, rgba(34, 197, 94, 0.10), transparent 42%),
            rgba(2, 6, 23, 0.76);
          border: 1px solid rgba(148, 163, 184, 0.28);
          color: #e5e7eb;
          font-size: 0.86rem;
          font-weight: 850;
          line-height: 1.42;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }

        .tkh-warning strong {
          color: #86efac;
          font-weight: 1000;
        }

        .tkh-success {
          background: rgba(34, 197, 94, 0.14);
          border: 1px solid rgba(34, 197, 94, 0.32);
          color: #bbf7d0;
        }

        .tkh-upload-progress {
          background: #0f172a;
          border: 1px solid rgba(148, 163, 184, 0.24);
        }

        .tkh-progress-head {
          display: flex;
          justify-content: space-between;
          gap: 0.75rem;
          align-items: center;
          font-size: 0.84rem;
          font-weight: 900;
          color: rgba(226, 232, 240, 0.92);
        }

        .tkh-progress-track {
          width: 100%;
          height: 10px;
          margin-top: 0.6rem;
          border-radius: 999px;
          overflow: hidden;
          background: rgba(148, 163, 184, 0.18);
        }

        .tkh-progress-fill {
          height: 100%;
          width: 0%;
          border-radius: 999px;
          background: linear-gradient(90deg, #22c55e, #86efac);
          transition: width 0.18s ease;
        }

        .tkh-progress-debug {
          margin-top: 0.5rem;
          color: rgba(226, 232, 240, 0.62);
          font-size: 0.74rem;
          line-height: 1.35;
          overflow-wrap: anywhere;
        }

        .tkh-upload-actions {
          margin-top: 0.9rem;
          display: flex;
          gap: 0.55rem;
          justify-content: flex-end;
          flex-wrap: wrap;
        }

        .tkh-curation-panel {
          display: grid;
          gap: 0.8rem;
          border-radius: 1rem;
          padding: 0.9rem;
          background: rgba(2, 6, 23, 0.92);
          border: 1px solid rgba(148, 163, 184, 0.24);
          color: #e5e7eb;
          box-shadow: 0 16px 36px rgba(2, 6, 23, 0.22);
        }

        .tkh-curation-panel strong {
          color: #f8fafc;
          font-weight: 1000;
        }

        .tkh-curation-title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          flex-wrap: wrap;
          font-weight: 1000;
        }

        .tkh-curation-count {
          border-radius: 999px;
          padding: 0.32rem 0.62rem;
          color: #fecaca;
          background: rgba(127, 29, 29, 0.34);
          border: 1px solid rgba(248, 113, 113, 0.32);
          font-size: 0.78rem;
          font-weight: 1000;
        }

        .tkh-curation-summary {
          display: flex;
          gap: 0.45rem;
          flex-wrap: wrap;
          color: rgba(226, 232, 240, 0.74);
          font-size: 0.82rem;
          line-height: 1.35;
        }

        .tkh-curation-summary span {
          border-radius: 999px;
          padding: 0.32rem 0.55rem;
          background: rgba(15, 23, 42, 0.88);
          border: 1px solid rgba(148, 163, 184, 0.18);
        }

        .tkh-curation-actions {
          display: flex;
          gap: 0.55rem;
          flex-wrap: wrap;
          align-items: center;
        }

        .tkh-curation-notice {
          border-radius: 1rem;
          padding: 0.78rem 0.9rem;
          background: rgba(34, 197, 94, 0.12);
          border: 1px solid rgba(34, 197, 94, 0.28);
          color: #bbf7d0;
          font-size: 0.84rem;
          font-weight: 900;
          line-height: 1.35;
        }

        @media (max-width: 980px) {
          .tkh-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 620px) {
          .video-highlights-page .header-title h1 {
            font-size: clamp(1.45rem, 7vw, 2.05rem);
          }

          /* Mobile ribbon: keep only the page title so it does not crowd the badge/home button. */
          .tkh-ribbon-subtitle-line {
            display: none !important;
          }

          .tkh-header-actions {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.55rem;
          }

          .tkh-header-actions .tkh-btn {
            width: 100%;
            min-width: 0;
          }

          .tkh-view-toggle {
            width: 100%;
          }

          .tkh-view-toggle .pill-toggle {
            flex: 1 1 0;
            min-width: 0;
          }

          .tkh-compact-filter-row,
          .tkh-form-grid,
          .tkh-winner-two-col,
          .tkh-grid {
            grid-template-columns: 1fr;
          }

          .tkh-card-top,
          .tkh-winners-head,
          .tkh-modal-head {
            flex-direction: column;
          }

          .tkh-card-actions .tkh-btn,
          .tkh-upload-actions .tkh-btn {
            flex: 1 1 auto;
          }
        }
      `}</style>

      <div className={`landing-header-sticky ${headerScrolled ? "is-scrolled" : ""}`}>
        <header className="header">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", width: "100%" }}>
            <div className="header-title" style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0 }}>Video Highlights</h1>
              <p className="subtitle tkh-ribbon-subtitle-line">
                <strong>{isLeagueMode ? "League highlights" : "Friendly highlights"}</strong> • {teamContextText}
              </p>
            </div>
            <button
              className="secondary-btn"
              onClick={onBack}
              aria-label="Home"
              title="Home"
              style={{ minWidth: "46px", width: "46px", height: "46px", padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "1.05rem", flexShrink: 0 }}
            >
              🏠
            </button>
          </div>
        </header>
      </div>

      <header className="header tkh-page-intro">
        <h2>Highlights hub</h2>
        <p className="tkh-intro-copy">
          Upload a short match clip, vote for the best moments, and check weekly winners.
        </p>
        <div className="tkh-feature-line">
          <span>{isLeagueMode ? "League teams:" : "Featured match:"}</span>
          <strong>{teamContextText}</strong>
        </div>
        <div className="tkh-voting-window-note">
          Current Week clips stay open for voting until Sunday night. After that, Top Voted becomes the main highlights hub.
        </div>
        <div className="tkh-header-actions">
          <button
            type="button"
            className="tkh-btn tkh-btn-primary"
            onClick={() => setShowUploadModal(true)}
            disabled={!canUpload}
            title={canUpload ? "Upload a short highlight" : "Sign in as a player, captain, or admin to upload"}
          >
            Upload
          </button>
          <button type="button" className="tkh-btn" onClick={loadHighlights} disabled={loadingHighlights}>
            {loadingHighlights ? "Refreshing..." : "Refresh"}
          </button>
          {isModerator && (
            <button
              type="button"
              className="tkh-btn"
              onClick={handleRunCuration}
              disabled={runningCuration || cleanupInProgress || approvedHighlights.length === 0}
              title="Select the top 2 goals, best save, and best skill, then preview cleanup."
            >
              {runningCuration ? "Running..." : "Run Curation"}
            </button>
          )}
        </div>
      </header>

      {loadError && <section className="card tkh-error-box">{loadError}</section>}

      <section className="card tkh-card-section">
        <div className="pill-toggle-group tkh-view-toggle" role="tablist" aria-label="Video highlights view">
          <button
            type="button"
            className={`pill-toggle ${mainTab === "currentWeek" ? "pill-toggle-active" : ""}`}
            onClick={() => setMainTab("currentWeek")}
            title={votingWindowClosed ? "This week’s voting window has closed. Top Voted is now the main hub." : `Voting closes ${votingDeadlineLabel}`}
          >
            Current Week
          </button>
          <button
            type="button"
            className={`pill-toggle ${mainTab === "winners" ? "pill-toggle-active" : ""}`}
            onClick={() => setMainTab("winners")}
          >
            Top Voted ⭐
          </button>
        </div>

        {mainTab === "currentWeek" && (
          <div className="tkh-compact-filter-row">
            <label className="tkh-compact-select-label">
              Review
              <select
                className="tkh-compact-select"
                value={selectedTab}
                onChange={(event) => setSelectedTab(event.target.value)}
              >
                <option value="approved">Approved ({approvedHighlights.length})</option>
                {isModerator && <option value="pending">Pending ({pendingHighlights.length})</option>}
                {isModerator && rejectedHighlights.length > 0 && (
                  <option value="rejected">Rejected ({rejectedHighlights.length})</option>
                )}
              </select>
            </label>

            <label className="tkh-compact-select-label">
              Type
              <select
                className="tkh-compact-select"
                value={selectedFilter}
                onChange={(event) => setSelectedFilter(event.target.value)}
              >
                {["all", "goal", "save", "skill", "other"].map((filter) => (
                  <option key={filter} value={filter}>{getFilterLabel(filter)}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        {mainTab === "currentWeek" && !isModerator && pendingHighlights.length > 0 && (
          <div className="tkh-system-note">
            {pendingHighlights.length} clip{pendingHighlights.length === 1 ? "" : "s"} waiting for review.
          </div>
        )}

        {curationNotice && (
          <div className="tkh-curation-notice">
            {curationNotice}
          </div>
        )}

        {isModerator && curationResult && (
          <div className="tkh-curation-panel">
            <div className="tkh-curation-title">
              <span>⚠️ Cleanup preview</span>
              <span className="tkh-curation-count">
                {curationResult.cleanupCandidates?.length || 0} clip{(curationResult.cleanupCandidates?.length || 0) === 1 ? "" : "s"} will be removed
              </span>
            </div>

            <div className="tkh-curation-summary">
              <span>⭐ Winners: <strong>{getCurationWinners(curationResult).length}</strong></span>
              <span>🧤 Best save: <strong>{curationResult.bestSave?.playerName || curationResult.bestSave?.title || "Pending"}</strong></span>
              <span>🎯 Best skill: <strong>{curationResult.bestSkill?.playerName || curationResult.bestSkill?.title || "Pending"}</strong></span>
            </div>

            <div className="tkh-soft-line">
              Review this before confirming. Winners remain; only non-selected clips are deleted from Firebase.
            </div>

            <div className="tkh-curation-actions">
              <button
                type="button"
                className="tkh-btn tkh-btn-danger"
                onClick={handleConfirmCleanup}
                disabled={cleanupInProgress}
              >
                {cleanupInProgress ? "Cleaning..." : "Confirm Cleanup"}
              </button>
              <button
                type="button"
                className="tkh-btn"
                onClick={() => setCurationResult(null)}
                disabled={cleanupInProgress}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {mainTab === "currentWeek" && (
          <>
            {votingWindowClosed && (
              <div className="tkh-system-note">
                Voting for this week has closed. Top Voted is now the main highlights hub, but you can still review current-week clips here.
              </div>
            )}
            {visibleHighlights.length === 0 ? (
              <div className="tkh-empty">
                {selectedTab === "pending"
                  ? "No clips waiting for review."
                  : selectedTab === "rejected"
                  ? "No rejected clips."
                  : "No approved highlights yet."}
              </div>
            ) : (
              <div className="tkh-grid">
                {visibleHighlights.map((highlight) => (
                  <HighlightCard
                    key={highlight.id}
                    highlight={highlight}
                    teams={teams}
                    matchType={matchType}
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
              </div>
            )}
          </>
        )}

        {mainTab === "winners" && (
          <div className="tkh-winners-panel">
            <div className="tkh-winners-head">
              <div>
                <h2>Top Voted Clips</h2>
                <p>This is the main highlights hub after the weekly voting window closes on Sunday night. Winners are kept here for monthly and season voting.</p>
              </div>
              <span className="tkh-winners-badge">Archive ready</span>
            </div>

            {topVotedClipGroups.length === 0 ? (
              <div className="tkh-empty-mini">No top voted clips saved yet.</div>
            ) : (
              <div className="tkh-matchday-goal-stack">
                {topVotedClipGroups.map((group) => (
                  <section key={group.matchDayId} className="tkh-matchday-goal-group">
                    <div className="tkh-matchday-goal-head">
                      <h3>{group.label}</h3>
                      <span>{group.clips.length} clip{group.clips.length === 1 ? "" : "s"}</span>
                    </div>

                    <div className="tkh-grid tkh-winner-grid">
                      {group.clips.map((clip, index) => (
                        <div key={clip.id} className="tkh-winner-card-wrap">
                          <div className="tkh-winner-rank">#{index + 1} Clip</div>
                          <HighlightCard
                            highlight={clip}
                            teams={teams}
                            matchType={matchType}
                            voteCount={voteCounts[clip.id] || Number(clip.votes || 0)}
                            isModerator={isModerator}
                            canVote={isLoggedIn}
                            userVoteForType={userVotes[clip.normalizedType] || null}
                            onVote={castVote}
                            onApprove={handleApprove}
                            onReject={handleReject}
                            onDelete={handleDelete}
                          />
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}

            <div className="tkh-cleanup-note">
              After admin download/approval, Current Week keeps the top 2 goals, 1 save, and 1 skill as Top Voted clips. The rest are cleaned from Firebase after the weekly voting window closes.
            </div>
          </div>
        )}

        <div className="tkh-archive">
          <span>Top voted clips: <strong>{currentTopVotedClipNames || "Pending"}</strong></span>
          <span>Best skill: <strong>{archiveSelection.bestSkill?.playerName || "Pending"}</strong></span>
          <span>Best save: <strong>{archiveSelection.bestSave?.playerName || "Pending"}</strong></span>
        </div>
      </section>

      {showUploadModal && (
        <div className="tkh-modal-backdrop">
          <div className="tkh-modal" role="dialog" aria-modal="true" aria-label="Upload highlight clip">
            <div className="tkh-modal-head">
              <div>
                <h2 className="tkh-modal-title">Upload clip</h2>
                <div className="tkh-help">
                  Metadata can be completed later by admin/captain.
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
                  Max {MAX_VIDEO_SECONDS}s / {formatFileSize(MAX_VIDEO_BYTES)}.
                </div>
              </div>

              <div className="tkh-field">
                <label>Type</label>
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
                  placeholder="Optional"
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

            {(uploading || uploadStage === "metadata" || uploadStage === "storage" || uploadStage === "firestore" || uploadStage === "complete" || uploadStage === "failed") && (
              <div className="tkh-upload-progress">
                <div className="tkh-progress-head">
                  <span>{uploadStep}</span>
                  <span>{Math.max(0, Math.min(100, Math.round(uploadProgress)))}%</span>
                </div>
                <div className="tkh-progress-track" aria-hidden="true">
                  <div
                    className="tkh-progress-fill"
                    style={{
                      width: `${Math.max(0, Math.min(100, Math.round(uploadProgress)))}%`,
                      background:
                        uploadStage === "failed"
                          ? "linear-gradient(90deg, #ef4444, #fecaca)"
                          : "linear-gradient(90deg, #22c55e, #86efac)",
                    }}
                  />
                </div>
                {uploadDebug?.code || uploadDebug?.message ? (
                  <div className="tkh-progress-debug">
                    {uploadDebug?.code ? `Code: ${uploadDebug.code}` : ""}
                    {uploadDebug?.code && uploadDebug?.message ? " • " : ""}
                    {uploadDebug?.message || ""}
                  </div>
                ) : null}
              </div>
            )}

            {uploadNotice && <div className="tkh-warning">{uploadNotice}</div>}
            {uploadSuccess && <div className="tkh-success">{uploadSuccess}</div>}
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
                {uploading ? "Uploading..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default VideoHighlightsPage;
