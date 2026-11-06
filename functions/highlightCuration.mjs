// src/core/VideoHighlightCuration.js

/*
  Video Highlight Curation Engine

  Purpose:
  - Current Week / current matchday clips live in video_highlights/{matchId}/raw
  - Weekly Winners live in video_highlights/{matchId}/archived
  - This file decides which raw clips should be kept and which should be queued for cleanup.

  Curation rule:
  - Keep top 2 goals by votes
  - Keep best 1 save by votes
  - Keep best 1 skill by votes
  - Everything else becomes a cleanup candidate
*/

export const HIGHLIGHT_TYPES = Object.freeze({
  GOAL: "goal",
  SAVE: "save",
  SKILL: "skill",
  OTHER: "other",
});

export const DEFAULT_CURATION_LIMITS = Object.freeze({
  goalsToKeep: 2,
  savesToKeep: 1,
  skillsToKeep: 1,
});

function safeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function getHighlightId(highlight = {}) {
  return String(
    highlight.clipId ||
      highlight.id ||
      highlight.highlightId ||
      highlight.videoId ||
      ""
  ).trim();
}

export function normalizeHighlightType(value) {
  const raw = safeLower(value);

  if (raw.includes("goal") || raw.includes("score")) return HIGHLIGHT_TYPES.GOAL;
  if (raw.includes("save") || raw.includes("keeper") || raw.includes("gk")) return HIGHLIGHT_TYPES.SAVE;
  if (raw.includes("skill") || raw.includes("dribble") || raw.includes("trick")) return HIGHLIGHT_TYPES.SKILL;

  return HIGHLIGHT_TYPES.OTHER;
}

export function getHighlightType(highlight = {}) {
  return normalizeHighlightType(
    highlight.type ||
      highlight.tag ||
      highlight.category ||
      highlight.highlightType ||
      highlight.normalizedType ||
      ""
  );
}

export function buildVoteCounts(votesByUser = {}) {
  const counts = {};

  Object.values(votesByUser || {}).forEach((userVotes) => {
    if (!userVotes || typeof userVotes !== "object") return;

    Object.values(userVotes).forEach((clipId) => {
      const id = String(clipId || "").trim();
      if (!id) return;
      counts[id] = (counts[id] || 0) + 1;
    });
  });

  return counts;
}

export function getHighlightVoteCount(highlight = {}, voteCounts = {}) {
  const id = getHighlightId(highlight);
  const explicitVotes = toNumber(highlight.votes, NaN);

  if (Number.isFinite(explicitVotes) && explicitVotes > 0) return explicitVotes;
  return toNumber(voteCounts[id], 0);
}

function getCreatedTime(highlight = {}) {
  const raw =
    highlight.createdAtISO ||
    highlight.createdAt ||
    highlight.uploadedAtISO ||
    highlight.uploadedAt ||
    highlight.timestamp ||
    "";

  if (raw && typeof raw === "object" && typeof raw.toDate === "function") {
    return raw.toDate().getTime();
  }

  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

function sortHighlightsByVotesThenNewest(items = [], voteCounts = {}) {
  return [...(items || [])].sort((a, b) => {
    const voteDiff = getHighlightVoteCount(b, voteCounts) - getHighlightVoteCount(a, voteCounts);
    if (voteDiff !== 0) return voteDiff;

    const timeDiff = getCreatedTime(b) - getCreatedTime(a);
    if (timeDiff !== 0) return timeDiff;

    return getHighlightId(a).localeCompare(getHighlightId(b));
  });
}

/*
 * Select competitive weekly winners.
 *
 * Rules:
 * - Zero-vote clips cannot win.
 * - Keep the normal number of category places.
 * - A qualifying-boundary tie may expand the result only when
 *   that tied group contains no more than three clips.
 * - A tie larger than three does not expand the result.
 * - Within a large tie, the earliest admin-liked clip ranks first.
 */
function selectVotedWinners(
  rankedHighlights = [],
  placesToKeep = 1,
  voteCounts = {},
  adminLikePriority = {}
) {
  const eligible = rankedHighlights.filter(
    (highlight) =>
      getHighlightVoteCount(highlight, voteCounts) > 0
  );

  const safePlaces = Math.max(
    0,
    Math.floor(Number(placesToKeep) || 0)
  );

  if (!eligible.length || safePlaces === 0) {
    return [];
  }

  if (eligible.length <= safePlaces) {
    return eligible;
  }

  const boundaryVotes = getHighlightVoteCount(
    eligible[safePlaces - 1],
    voteCounts
  );

  const aboveBoundary = eligible.filter(
    (highlight) =>
      getHighlightVoteCount(highlight, voteCounts) >
      boundaryVotes
  );

  const boundaryTie = eligible.filter(
    (highlight) =>
      getHighlightVoteCount(highlight, voteCounts) ===
      boundaryVotes
  );

  if (boundaryTie.length <= 3) {
    return [...aboveBoundary, ...boundaryTie];
  }

  const remainingPlaces = Math.max(
    0,
    safePlaces - aboveBoundary.length
  );

  const rankedLargeTie = [...boundaryTie].sort((a, b) => {
    const aPriority = Number(
      adminLikePriority[getHighlightId(a)]
    );
    const bPriority = Number(
      adminLikePriority[getHighlightId(b)]
    );

    const aHasAdminPriority = Number.isFinite(aPriority);
    const bHasAdminPriority = Number.isFinite(bPriority);

    if (aHasAdminPriority && bHasAdminPriority) {
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
    } else if (aHasAdminPriority) {
      return -1;
    } else if (bHasAdminPriority) {
      return 1;
    }

    const timeDiff = getCreatedTime(b) - getCreatedTime(a);
    if (timeDiff !== 0) return timeDiff;

    return getHighlightId(a).localeCompare(
      getHighlightId(b)
    );
  });

  return [
    ...aboveBoundary,
    ...rankedLargeTie.slice(0, remainingPlaces),
  ];
}

export function splitHighlightsByType(highlights = []) {
  const buckets = {
    goals: [],
    saves: [],
    skills: [],
    other: [],
  };

  (Array.isArray(highlights) ? highlights : []).forEach((highlight) => {
    const type = getHighlightType(highlight);

    if (type === HIGHLIGHT_TYPES.GOAL) buckets.goals.push(highlight);
    else if (type === HIGHLIGHT_TYPES.SAVE) buckets.saves.push(highlight);
    else if (type === HIGHLIGHT_TYPES.SKILL) buckets.skills.push(highlight);
    else buckets.other.push(highlight);
  });

  return buckets;
}

function decorateWinner(highlight, { category, rank, voteCounts }) {
  const id = getHighlightId(highlight);

  return {
    ...highlight,
    clipId: highlight.clipId || id,
    id: highlight.id || id,
    archiveCategory: category,
    archiveRank: rank,
    archiveReason:
      category === HIGHLIGHT_TYPES.GOAL
        ? `Top ${rank} goal of the matchday`
        : category === HIGHLIGHT_TYPES.SAVE
        ? "Best save of the matchday"
        : category === HIGHLIGHT_TYPES.SKILL
        ? "Best skill of the matchday"
        : "Selected highlight",
    voteCount: getHighlightVoteCount(highlight, voteCounts),
    status: "archived",
  };
}

function decorateCleanupCandidate(highlight, { voteCounts, reason = "Not selected for weekly winners" } = {}) {
  const id = getHighlightId(highlight);

  return {
    ...highlight,
    clipId: highlight.clipId || id,
    id: highlight.id || id,
    cleanupStatus: "pending_admin_review",
    cleanupReason: reason,
    voteCount: getHighlightVoteCount(highlight, voteCounts),
  };
}

export function curateHighlights({
  highlights = [],
  votesByUser = {},
  voteCounts: providedVoteCounts = null,
  adminLikePriority = {},
  limits = DEFAULT_CURATION_LIMITS,
} = {}) {
  const safeHighlights = Array.isArray(highlights) ? highlights : [];
  const voteCounts = providedVoteCounts || buildVoteCounts(votesByUser);

  const safeLimits = {
    ...DEFAULT_CURATION_LIMITS,
    ...(limits || {}),
  };

  const buckets = splitHighlightsByType(safeHighlights);

  const rankedGoals = sortHighlightsByVotesThenNewest(buckets.goals, voteCounts);
  const rankedSaves = sortHighlightsByVotesThenNewest(buckets.saves, voteCounts);
  const rankedSkills = sortHighlightsByVotesThenNewest(buckets.skills, voteCounts);

  const topGoals = selectVotedWinners(
    rankedGoals,
    safeLimits.goalsToKeep,
    voteCounts,
    adminLikePriority
  ).map((highlight, index) =>
      decorateWinner(highlight, {
        category: HIGHLIGHT_TYPES.GOAL,
        rank: index + 1,
        voteCounts,
      })
    );

  const selectedSaves = selectVotedWinners(
    rankedSaves,
    safeLimits.savesToKeep,
    voteCounts,
    adminLikePriority
  ).map((highlight) =>
    decorateWinner(highlight, {
      category: HIGHLIGHT_TYPES.SAVE,
      rank: 1,
      voteCounts,
    })
  );

  const selectedSkills = selectVotedWinners(
    rankedSkills,
    safeLimits.skillsToKeep,
    voteCounts,
    adminLikePriority
  ).map((highlight) =>
    decorateWinner(highlight, {
      category: HIGHLIGHT_TYPES.SKILL,
      rank: 1,
      voteCounts,
    })
  );

  const bestSave = selectedSaves[0] || null;
  const bestSkill = selectedSkills[0] || null;

  const winners = [
    ...topGoals,
    ...selectedSaves,
    ...selectedSkills,
  ];

  const winnerIds = new Set(winners.map(getHighlightId).filter(Boolean));

  const cleanupCandidates = safeHighlights
    .filter((highlight) => {
      const id = getHighlightId(highlight);
      return id && !winnerIds.has(id);
    })
    .map((highlight) =>
      decorateCleanupCandidate(highlight, {
        voteCounts,
        reason: "Not selected for weekly winners",
      })
    );

  return {
    topGoals,
    bestSave,
    bestSkill,
    winners,
    cleanupCandidates,
    voteCounts,
    counts: {
      total: safeHighlights.length,
      goals: buckets.goals.length,
      saves: buckets.saves.length,
      skills: buckets.skills.length,
      other: buckets.other.length,
      winners: winners.length,
      cleanupCandidates: cleanupCandidates.length,
    },
  };
}

export function getCurationSummaryText(selection = {}) {
  const topGoals = Array.isArray(selection.topGoals) ? selection.topGoals : [];
  const bestSave = selection.bestSave || null;
  const bestSkill = selection.bestSkill || null;

  const goalNames = topGoals
    .map((h) => h.playerName || h.goalScorerName || h.scorer || h.title || "Unknown")
    .filter(Boolean)
    .join(", ");

  const saveName = bestSave
    ? bestSave.playerName || bestSave.keeperName || bestSave.title || "Pending"
    : "Pending";

  const skillName = bestSkill
    ? bestSkill.playerName || bestSkill.skillPlayer || bestSkill.title || "Pending"
    : "Pending";

  return `Top goals kept: ${goalNames || "Pending"}  Best skill: ${skillName}  Best save: ${saveName}`;
}

export function shouldOpenLeagueGoalOfSeasonVote({ seasonEnded = false } = {}) {
  return Boolean(seasonEnded);
}

export function shouldOpenFriendlyGoalOfMonthVote({ now = new Date() } = {}) {
  const d = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(d.getTime())) return false;

  const tomorrow = new Date(d);
  tomorrow.setDate(d.getDate() + 1);

  return tomorrow.getMonth() !== d.getMonth();
}

export default {
  HIGHLIGHT_TYPES,
  DEFAULT_CURATION_LIMITS,
  getHighlightId,
  normalizeHighlightType,
  getHighlightType,
  buildVoteCounts,
  getHighlightVoteCount,
  splitHighlightsByType,
  curateHighlights,
  getCurationSummaryText,
  shouldOpenLeagueGoalOfSeasonVote,
  shouldOpenFriendlyGoalOfMonthVote,
};
