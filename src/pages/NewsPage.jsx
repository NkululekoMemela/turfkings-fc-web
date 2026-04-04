// src/pages/NewsPage.jsx
import React, { useMemo, useState, useEffect, useCallback } from "react";
import JaydTribute from "../assets/Jayd_Tribute.jpeg";
import JerseyImage from "../assets/Jersey.jpeg";
import { RSVPModal } from "../components/RSVPModal.jsx";
import { YearEndProgramModal } from "../components/YearEndProgramModal.jsx";
import { useMemberNameMap } from "../core/nameMapping.js";
import { db } from "../firebaseConfig.js";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import {
  subscribeToKitOrders,
  upsertKitOrder,
  removeKitOrder,
} from "../storage/firebaseRepository.js";

const BAD_MATCH_NUMBERS = new Set();
const injuredPlayerName = "Jayd";

const VENUE_MAP_URL =
  "https://www.google.com/maps/search/?api=1&query=Haveva%20Lower%20Main%20Road%20Observatory";

const CUSTOM_NEWS_STORIES_COLLECTION = "newsStories";
const CUSTOM_STORY_LIMIT = 5;

const CUSTOM_STORY_SLOT_OPTIONS = [
  { value: "after-jersey", label: "Below jersey story" },
  { value: "after-hero", label: "Below tournament recap" },
  { value: "after-headlines", label: "Below headlines / match feature" },
  { value: "after-mvp", label: "Below MVP story" },
  { value: "after-streak", label: "Below streak watch" },
  { value: "before-old-stories", label: "Above old stories" },
  { value: "before-recap", label: "Above match-by-match recap" },

];

function toTitleCase(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function slugFromName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function safeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function firstNameOf(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[0] : "";
}

function levenshteinDistance(a, b) {
  const s = String(a || "");
  const t = String(b || "");
  const dp = Array.from({ length: s.length + 1 }, () => []);

  for (let i = 0; i <= s.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= t.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= s.length; i += 1) {
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[s.length][t.length];
}

function buildPlayersRegistry(playersSnap) {
  const mapNameToCanon = {};

  const addKey = (keys, value) => {
    const raw = String(value || "").trim();
    if (!raw) return;

    const pretty = toTitleCase(raw);
    keys.add(safeLower(raw));
    keys.add(safeLower(pretty));
    keys.add(slugFromName(raw));
    keys.add(slugFromName(pretty));

    const first = safeLower(firstNameOf(pretty));
    if (first) keys.add(first);
  };

  playersSnap.forEach((docSnap) => {
    const data = docSnap.data() || {};

    const fullName = toTitleCase(
      data.fullName ||
        data.displayName ||
        data.name ||
        data.playerName ||
        ""
    );

    if (!fullName) return;

    const keys = new Set();
    addKey(keys, fullName);
    addKey(keys, data.shortName);
    addKey(keys, data.displayName);
    addKey(keys, data.name);
    addKey(keys, data.playerName);
    addKey(keys, docSnap.id);

    const aliases = Array.isArray(data.aliases) ? data.aliases : [];
    aliases.forEach((alias) => addKey(keys, alias));

    keys.forEach((key) => {
      if (!key) return;
      if (!mapNameToCanon[key]) mapNameToCanon[key] = fullName;
    });
  });

  return mapNameToCanon;
}

function resolveCanonicalNameFromMap(rawName, map) {
  if (!rawName || typeof rawName !== "string") return "";

  const tc = toTitleCase(rawName);
  if (!tc) return "";

  const direct = map[safeLower(tc)];
  if (direct) return direct;

  const bySlug = map[slugFromName(tc)];
  if (bySlug) return bySlug;

  const fn = safeLower(firstNameOf(tc));
  if (fn && map[fn]) return map[fn];

  return tc;
}

function buildCloudPhotosIndex(photoSnap) {
  const idx = {};

  photoSnap.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const docId = docSnap.id;
    const name = toTitleCase(data.name || "");

    if (!data.photoData) return;

    const addKey = (key) => {
      const normalized = safeLower(key);
      if (!normalized) return;
      if (!idx[normalized]) idx[normalized] = data.photoData;
    };

    if (name) {
      addKey(name);
      addKey(slugFromName(name));
      const fn = firstNameOf(name);
      if (fn) addKey(fn);
    }

    if (docId) addKey(docId);
  });

  return idx;
}

export function NewsPage({
  teams,
  results,
  allEvents,
  currentResults,
  currentEvents,
  onBack,
  playerPhotosByName,
  identity,
  yearEndAttendance,
  onUpdateYearEndAttendance,
  onGoToSignIn,
  members,
  initialProgramOpen,
  matchDayHistory,
}) {
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [playerCanonicalMap, setPlayerCanonicalMap] = useState({});
  const [cloudPhotosIndex, setCloudPhotosIndex] = useState({});
  const { normalizeName } = useMemberNameMap(Array.isArray(members) ? members : []);

  const shortDisplayByNormalized = useMemo(() => {
    const out = {};

    const add = (rawName, shortName = "") => {
      const canonical = normalizeName(rawName);
      if (!canonical) return;

      const shortPretty = toTitleCase(shortName || "").trim();
      const canonicalPretty = toTitleCase(canonical).trim();
      const chosen = shortPretty || canonicalPretty;

      if (!out[safeLower(canonical)]) out[safeLower(canonical)] = chosen;
    };

    (Array.isArray(members) ? members : []).forEach((member) => {
      if (!member) return;
      if (typeof member === "string") {
        add(member, member);
        return;
      }

      add(
        member.fullName || member.displayName || member.name || member.playerName || member.shortName || "",
        member.shortName || member.displayName || member.name || ""
      );
    });

    (teams || []).forEach((team) => {
      (team?.players || []).forEach((player) => {
        if (!player) return;
        if (typeof player === "string") {
          add(player, player);
          return;
        }

        add(
          player.fullName || player.name || player.displayName || player.playerName || player.shortName || "",
          player.shortName || player.name || player.displayName || ""
        );
      });
    });

    return out;
  }, [members, teams, normalizeName]);

  const resolveShortDisplay = useCallback((rawName) => {
    const canonical = normalizeName(rawName);
    if (!canonical) return "";
    return shortDisplayByNormalized[safeLower(canonical)] || canonical;
  }, [normalizeName, shortDisplayByNormalized]);

  useEffect(() => {
    let isMounted = true;

    async function loadPlayerPhotoData() {
      try {
        const [playersSnap, photosSnap] = await Promise.all([
          getDocs(collection(db, "players")),
          getDocs(collection(db, "playerPhotos")),
        ]);

        if (!isMounted) return;

        setPlayerCanonicalMap(buildPlayersRegistry(playersSnap));
        setCloudPhotosIndex(buildCloudPhotosIndex(photosSnap));
      } catch (error) {
        console.error("[NewsPage] failed to load player photo helpers:", error);
        if (!isMounted) return;
        setPlayerCanonicalMap({});
        setCloudPhotosIndex({});
      }
    }

    loadPlayerPhotoData();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setHeaderScrolled(window.scrollY > 6);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // ---------- Helpers ----------
  const teamById = useMemo(() => {
    const map = new Map();
    (teams || []).forEach((t) => map.set(t.id, t));
    return map;
  }, [teams]);

  const getTeamName = (id) => teamById.get(id)?.label || "Unknown";

  const getTeamAbbrev = (teamName) => {
    if (!teamName || typeof teamName !== "string") return "";
    const trimmed = teamName.trim();
    if (!trimmed) return "";
    return trimmed.slice(0, 3).toUpperCase();
  };

  // Map player -> team label (first team that contains the player)
  const playerTeamMap = useMemo(() => {
    const map = {};
    (teams || []).forEach((t) => {
      (t.players || []).forEach((p) => {
        const rawName = typeof p === "string" ? p : p?.name || p?.displayName || p?.shortName;
        const name = normalizeName(rawName);
        if (name && !map[name]) {
          map[name] = t.label;
        }
      });
    });
    return map;
  }, [teams, normalizeName]);

  const getPlayerTeamAbbrev = (playerName) => {
    const teamName = playerTeamMap[normalizeName(playerName)];
    if (!teamName) return "";
    return getTeamAbbrev(teamName);
  };

  // Map player -> photo URL (Firebase + team metadata + Firestore photo collection)
  const mergedPhotoMap = useMemo(() => {
    const map = {};

    const addPhotoKey = (key, url) => {
      const normalizedKey = safeLower(key);
      if (!normalizedKey || !url) return;
      if (!map[normalizedKey]) map[normalizedKey] = url;
    };

    Object.entries(playerPhotosByName || {}).forEach(([name, url]) => {
      if (!name || !url) return;
      const pretty = toTitleCase(name);
      addPhotoKey(name, url);
      addPhotoKey(pretty, url);
      addPhotoKey(slugFromName(name), url);
      addPhotoKey(slugFromName(pretty), url);
      addPhotoKey(firstNameOf(name), url);
      addPhotoKey(firstNameOf(pretty), url);
    });

    Object.entries(cloudPhotosIndex || {}).forEach(([key, url]) => {
      addPhotoKey(key, url);
    });

    (teams || []).forEach((t) => {
      if (t.playerPhotos) {
        Object.entries(t.playerPhotos).forEach(([name, url]) => {
          if (!name || !url) return;
          const pretty = toTitleCase(name);
          addPhotoKey(name, url);
          addPhotoKey(pretty, url);
          addPhotoKey(slugFromName(name), url);
          addPhotoKey(slugFromName(pretty), url);
          addPhotoKey(firstNameOf(name), url);
          addPhotoKey(firstNameOf(pretty), url);
        });
      }

      (t.players || []).forEach((p) => {
        if (!p || typeof p !== "object") return;
        const photoUrl = p.photoUrl || p.photo || p.image || "";
        if (!photoUrl) return;

        [p.fullName, p.name, p.displayName, p.playerName, p.shortName]
          .filter(Boolean)
          .forEach((candidateName) => {
            const pretty = toTitleCase(candidateName);
            addPhotoKey(candidateName, photoUrl);
            addPhotoKey(pretty, photoUrl);
            addPhotoKey(slugFromName(candidateName), photoUrl);
            addPhotoKey(slugFromName(pretty), photoUrl);
            addPhotoKey(firstNameOf(candidateName), photoUrl);
            addPhotoKey(firstNameOf(pretty), photoUrl);
          });
      });
    });

    return map;
  }, [teams, playerPhotosByName, cloudPhotosIndex]);

  const resolveCanonicalPlayerName = useCallback(
    (name) => resolveCanonicalNameFromMap(name, playerCanonicalMap),
    [playerCanonicalMap]
  );

  const getPlayerPhoto = useCallback((name, shortName = "") => {
    const raw = String(name || "").trim();
    const shortRaw = String(shortName || "").trim();
    if (!raw && !shortRaw) return null;

    const canonical = normalizeName(raw || shortRaw);
    const resolvedCanonical = resolveCanonicalPlayerName(canonical || raw || shortRaw);
    const resolvedShort = resolveShortDisplay(resolvedCanonical || raw || shortRaw);

    const candidates = [];

    const cn = toTitleCase(resolvedCanonical || raw || shortRaw);
    const sn = toTitleCase(shortRaw || resolvedShort || "");

    if (cn) candidates.push(cn);
    if (sn && sn !== cn) candidates.push(sn);

    const fn1 = firstNameOf(cn);
    const fn2 = firstNameOf(sn);
    if (fn1) candidates.push(fn1);
    if (fn2 && fn2 !== fn1) candidates.push(fn2);

    if (cn) candidates.push(slugFromName(cn));
    if (sn) candidates.push(slugFromName(sn));

    const rawPretty = toTitleCase(raw);
    const shortPretty = toTitleCase(shortRaw);
    [raw, rawPretty, shortRaw, shortPretty, canonical, resolvedCanonical, resolvedShort,
     firstNameOf(raw), firstNameOf(rawPretty), firstNameOf(shortRaw), firstNameOf(shortPretty),
     slugFromName(raw), slugFromName(rawPretty), slugFromName(shortRaw), slugFromName(shortPretty)]
      .filter(Boolean)
      .forEach((value) => candidates.push(value));

    const seen = new Set();
    for (const candidate of candidates) {
      const key = safeLower(candidate);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      if (mergedPhotoMap[key]) return mergedPhotoMap[key];
    }

    return null;
  }, [mergedPhotoMap, normalizeName, resolveCanonicalPlayerName, resolveShortDisplay]);

  const canManageCustomStories = Boolean(
    identity && ["admin", "captain"].includes(String(identity.role || "").toLowerCase())
  );

  const allKnownPlayers = useMemo(() => {
    const seen = new Set();
    const list = [];

    const pushName = (raw) => {
      const name = String(raw || "").trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      list.push(name);
    };

    (members || []).forEach((member) => {
      if (typeof member === "string") {
        pushName(member);
        return;
      }
      pushName(
        member?.shortName ||
          member?.fullName ||
          member?.name ||
          member?.displayName ||
          member?.nickname
      );
    });

    (teams || []).forEach((team) => {
      (team?.players || []).forEach((player) => {
        if (typeof player === "string") {
          pushName(player);
          return;
        }
        pushName(player?.name || player?.displayName || player?.shortName);
      });
    });

    return list.sort((a, b) => a.localeCompare(b));
  }, [members, teams]);

  const createEmptyStoryDraft = () => ({
    title: "",
    tag: "Story",
    body: "",
    slotKey: "after-hero",
    playerName: "",
    imageUrl: "",
  });

  const [customStories, setCustomStories] = useState([]);
  const [showCreateStoryForm, setShowCreateStoryForm] = useState(false);
  const [storyDraft, setStoryDraft] = useState(createEmptyStoryDraft);
  const [storyFormError, setStoryFormError] = useState("");
  const [storyFormNotice, setStoryFormNotice] = useState("");
  const [editingStoryId, setEditingStoryId] = useState("");
  const [loadingStories, setLoadingStories] = useState(true);

  useEffect(() => {
    const storiesRef = collection(db, CUSTOM_NEWS_STORIES_COLLECTION);
    const unsubscribe = onSnapshot(
      storiesRef,
      (snapshot) => {
        const nextStories = snapshot.docs
          .map((docSnap) => {
            const data = docSnap.data() || {};
            return {
              id: docSnap.id,
              ...data,
            };
          })
          .filter(Boolean);

        setCustomStories(nextStories);
        setLoadingStories(false);
      },
      (error) => {
        console.error("[NewsPage] failed to subscribe to news stories:", error);
        setStoryFormError("Could not load shared custom stories.");
        setLoadingStories(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const activeCustomStories = useMemo(
    () => customStories.filter((story) => story && !story.archived),
    [customStories]
  );

  const archivedCustomStories = useMemo(
    () => customStories.filter((story) => story && story.archived),
    [customStories]
  );

  const activeCustomStoryCount = activeCustomStories.length;
  const hasReachedCustomStoryLimit = activeCustomStoryCount >= CUSTOM_STORY_LIMIT;

  const getSlotLabel = (slotKey) =>
    CUSTOM_STORY_SLOT_OPTIONS.find((option) => option.value === slotKey)?.label ||
    "Custom slot";

  const sortedActiveCustomStories = useMemo(() => {
    return activeCustomStories.slice().sort((a, b) => {
      const slotCompare = String(a?.slotKey || "").localeCompare(
        String(b?.slotKey || "")
      );
      if (slotCompare !== 0) return slotCompare;
      return Number(a?.createdAtMs || 0) - Number(b?.createdAtMs || 0);
    });
  }, [activeCustomStories]);

  const handleStoryDraftChange = (field, value) => {
    setStoryDraft((current) => ({
      ...current,
      [field]: value,
    }));
    setStoryFormError("");
    setStoryFormNotice("");
  };

  const resetStoryDraft = () => {
    setStoryDraft(createEmptyStoryDraft());
    setEditingStoryId("");
    setStoryFormError("");
    setStoryFormNotice("");
  };

  const handleEditCustomStory = (story) => {
    if (!canManageCustomStories || !story) return;
    setEditingStoryId(story.id || "");
    setStoryDraft({
      title: String(story.title || ""),
      tag: String(story.tag || "Story"),
      body: String(story.body || ""),
      slotKey: String(story.slotKey || "after-hero"),
      playerName: String(story.playerName || ""),
      imageUrl: String(story.imageUrl || ""),
    });
    setShowCreateStoryForm(true);
    setStoryFormError("");
    setStoryFormNotice(`Editing "${story.title || "story"}".`);
  };

  const handleSaveCustomStory = async () => {
    if (!canManageCustomStories) return;

    const title = String(storyDraft.title || "").trim();
    const body = String(storyDraft.body || "").trim();
    const tag = String(storyDraft.tag || "").trim() || "Story";
    const playerName = String(storyDraft.playerName || "").trim();
    const imageUrl = String(storyDraft.imageUrl || "").trim();
    const slotKey = String(storyDraft.slotKey || "after-hero");

    if (!title) {
      setStoryFormError("Please add a story title.");
      return;
    }

    if (!body) {
      setStoryFormError("Please add the story text.");
      return;
    }

    if (!editingStoryId && hasReachedCustomStoryLimit) {
      setStoryFormError(
        "You already have 5 active custom stories. Archive or delete one before adding another."
      );
      return;
    }

    try {
      const storyId = editingStoryId || `story-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const storyRef = doc(db, CUSTOM_NEWS_STORIES_COLLECTION, storyId);
      const createdAtMs = editingStoryId
        ? Number(
            customStories.find((story) => story?.id === editingStoryId)?.createdAtMs ||
              Date.now()
          )
        : Date.now();

      await setDoc(
        storyRef,
        {
          title,
          body,
          tag,
          slotKey,
          playerName,
          imageUrl,
          archived: false,
          createdAtMs,
          updatedAtMs: Date.now(),
          createdBy:
            identity?.shortName || identity?.fullName || identity?.name || "Admin",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setStoryFormNotice(editingStoryId ? "Story updated." : "Story created and published.");
      setStoryDraft(createEmptyStoryDraft());
      setEditingStoryId("");
      setShowCreateStoryForm(false);
      setStoryFormError("");
    } catch (error) {
      console.error("[NewsPage] failed to save custom story:", error);
      setStoryFormError("Could not publish the story. Please try again.");
    }
  };

  const handleArchiveToggleCustomStory = async (storyId) => {
    if (!canManageCustomStories || !storyId) return;

    const targetStory = customStories.find((story) => story?.id === storyId);
    if (!targetStory) return;

    if (targetStory.archived && activeCustomStories.length >= CUSTOM_STORY_LIMIT) {
      setStoryFormError(
        "You already have 5 active custom stories. Delete or archive one before restoring another."
      );
      return;
    }

    try {
      await setDoc(
        doc(db, CUSTOM_NEWS_STORIES_COLLECTION, storyId),
        {
          archived: !targetStory.archived,
          archivedAtMs: !targetStory.archived ? Date.now() : null,
          updatedAtMs: Date.now(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setStoryFormError("");
      setStoryFormNotice(targetStory.archived ? "Story restored." : "Story archived.");
    } catch (error) {
      console.error("[NewsPage] failed to archive story:", error);
      setStoryFormError("Could not update archive status.");
    }
  };

  const handleDeleteCustomStory = async (storyId) => {
    if (!canManageCustomStories || !storyId) return;

    const storyToDelete = customStories.find((story) => story?.id === storyId);
    if (!storyToDelete) return;

    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        `Delete "${storyToDelete.title || "this story"}" permanently?

This will remove it from live news and archives for everyone.`
      );
      if (!confirmed) return;
    }

    try {
      await deleteDoc(doc(db, CUSTOM_NEWS_STORIES_COLLECTION, storyId));
      if (editingStoryId === storyId) resetStoryDraft();
      setStoryFormError("");
      setStoryFormNotice(`Deleted "${storyToDelete.title}" permanently.`);
    } catch (error) {
      console.error("[NewsPage] failed to delete story:", error);
      setStoryFormError("Could not delete this story. Please try again.");
    }
  };



  // ---------- RAW DATA SPLIT ----------
  const fullResultsRaw = results || [];
  const fullEventsRaw = allEvents || [];

  const latestSavedMatchDay = useMemo(() => {
    const days = Array.isArray(matchDayHistory) ? matchDayHistory.filter(Boolean) : [];
    if (!days.length) return null;

    const withData = days.filter((day) => {
      const resultsCount = Array.isArray(day?.results) ? day.results.length : 0;
      const eventsCount = Array.isArray(day?.allEvents) ? day.allEvents.length : 0;
      return resultsCount > 0 || eventsCount > 0;
    });

    const source = withData.length ? withData : days;

    return source.slice().sort((a, b) => {
      const aStamp = a?.createdAt || a?.updatedAt || a?.id || 0;
      const bStamp = b?.createdAt || b?.updatedAt || b?.id || 0;
      const aTime = new Date(aStamp).getTime() || 0;
      const bTime = new Date(bStamp).getTime() || 0;
      return bTime - aTime;
    })[0];
  }, [matchDayHistory]);

  const weekResultsRaw = Array.isArray(latestSavedMatchDay?.results) && latestSavedMatchDay.results.length
    ? latestSavedMatchDay.results
    : (currentResults || []);
  const weekEventsRaw = Array.isArray(latestSavedMatchDay?.allEvents)
    ? latestSavedMatchDay.allEvents
    : (currentEvents || []);

  const latestMatchDayLabel = useMemo(() => {
    if (latestSavedMatchDay?.createdAt) return formatMatchDayDate(latestSavedMatchDay.createdAt);
    if (latestSavedMatchDay?.id) return formatMatchDayDate(latestSavedMatchDay.id);
    return formatMatchDayDate(new Date());
  }, [latestSavedMatchDay]);

  // ---------- CLEAN DATA (FULL TOURNAMENT) ----------
  const cleanTournamentResults = useMemo(
    () => fullResultsRaw.filter((r) => r && !BAD_MATCH_NUMBERS.has(r.matchNo)),
    [fullResultsRaw]
  );

  const cleanTournamentEvents = useMemo(
    () => fullEventsRaw.filter((e) => e && !BAD_MATCH_NUMBERS.has(e.matchNo)),
    [fullEventsRaw]
  );

  // ---------- CLEAN DATA (THIS MATCH-DAY) ----------
  const cleanWeekResults = useMemo(
    () => weekResultsRaw.filter((r) => r && !BAD_MATCH_NUMBERS.has(r.matchNo)),
    [weekResultsRaw]
  );

  const cleanWeekEvents = useMemo(
    () => weekEventsRaw.filter((e) => e && !BAD_MATCH_NUMBERS.has(e.matchNo)),
    [weekEventsRaw]
  );

  // ---------- TEAM TABLE (full tournament so far) ----------
  const teamStats = useMemo(() => {
    const base = {};
    (teams || []).forEach((t) => {
      base[t.id] = {
        teamId: t.id,
        name: t.label,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDiff: 0,
        points: 0,
      };
    });

    cleanTournamentResults.forEach((r) => {
      const a = base[r.teamAId];
      const b = base[r.teamBId];
      if (!a || !b) return;

      const gA = r.goalsA || 0;
      const gB = r.goalsB || 0;

      a.played += 1;
      b.played += 1;

      a.goalsFor += gA;
      a.goalsAgainst += gB;
      b.goalsFor += gB;
      b.goalsAgainst += gA;

      if (r.isDraw) {
        a.drawn += 1;
        b.drawn += 1;
        a.points += 1;
        b.points += 1;
      } else {
        if (r.winnerId === r.teamAId) {
          a.won += 1;
          b.lost += 1;
          a.points += 3;
        } else if (r.winnerId === r.teamBId) {
          b.won += 1;
          a.lost += 1;
          b.points += 3;
        }
      }
    });

    Object.values(base).forEach((t) => {
      t.goalDiff = t.goalsFor - t.goalsAgainst;
    });

    const arr = Object.values(base);
    arr.sort((x, y) => {
      if (y.points !== x.points) return y.points - x.points;
      if (y.goalDiff !== x.goalDiff) return y.goalDiff - x.goalDiff;
      if (y.goalsFor !== x.goalsFor) return y.goalsFor - x.goalsFor;
      return x.name.localeCompare(y.name);
    });

    return arr;
  }, [teams, cleanTournamentResults]);

  const tableLeader = teamStats[0] || null;

  // ---------- PLAYER STATS (full tournament) ----------
  const playerStats = useMemo(() => {
    const stats = {};
    const getOrCreate = (rawName) => {
      const name = normalizeName(rawName);
      if (!name) return null;
      if (!stats[name]) {
        stats[name] = { name, goals: 0, assists: 0, shibobos: 0 };
      }
      return stats[name];
    };

    cleanTournamentEvents.forEach((e) => {
      if (e.scorer) {
        const s = getOrCreate(e.scorer);
        if (s) {
          if (e.type === "goal") s.goals += 1;
          else if (e.type === "shibobo") s.shibobos += 1;
        }
      }
      if (e.assist) {
        const a = getOrCreate(e.assist);
        if (a) a.assists += 1;
      }
    });

    const arr = Object.values(stats);
    arr.forEach((p) => {
      p.teamName = playerTeamMap[p.name] || "—";
      p.total = p.goals + p.assists + p.shibobos;
    });
    return arr;
  }, [cleanTournamentEvents, playerTeamMap, normalizeName]);

  const topScorer = useMemo(() => {
    let best = null;
    playerStats.forEach((p) => {
      if (p.goals <= 0) return;
      if (
        !best ||
        p.goals > best.goals ||
        (p.goals === best.goals && p.name.localeCompare(best.name) < 0)
      ) {
        best = p;
      }
    });
    return best;
  }, [playerStats]);

  const topPlaymaker = useMemo(() => {
    let best = null;
    playerStats.forEach((p) => {
      if (p.assists <= 0) return;
      if (
        !best ||
        p.assists > best.assists ||
        (p.assists === best.assists && p.name.localeCompare(best.name) < 0)
      ) {
        best = p;
      }
    });
    return best;
  }, [playerStats]);

  const bestOverall = useMemo(() => {
    let best = null;
    playerStats.forEach((p) => {
      if (p.total <= 0) return;
      if (
        !best ||
        p.total > best.total ||
        (p.total === best.total && p.goals > best.goals) ||
        (p.total === best.total &&
          p.goals === best.goals &&
          p.name.localeCompare(best.name) < 0)
      ) {
        best = p;
      }
    });
    return best;
  }, [playerStats]);

  const mvpShortName = bestOverall ? resolveShortDisplay(bestOverall.name) : "";
  const mvpPhotoUrl = bestOverall ? getPlayerPhoto(bestOverall.name, mvpShortName) : null;

  // ---------- STREAK STATS (full tournament) ----------
  const streakStats = useMemo(() => {
    const byMatch = new Map();
    cleanTournamentResults.forEach((r) => {
      byMatch.set(r.matchNo, { scorers: new Set(), assisters: new Set() });
    });

    cleanTournamentEvents.forEach((e) => {
      const rec = byMatch.get(e.matchNo);
      if (!rec) return;
      if (e.scorer && e.type === "goal") rec.scorers.add(e.scorer);
      if (e.assist) rec.assisters.add(e.assist);
    });

    const matchNos = Array.from(byMatch.keys()).sort((a, b) => a - b);

    const goalStreaks = new Map();
    const assistStreaks = new Map();

    const updateStreaksForMatch = (set, map) => {
      set.forEach((name) => {
        let st = map.get(name);
        if (!st) st = { current: 0, best: 0 };
        st.current += 1;
        if (st.current > st.best) st.best = st.current;
        map.set(name, st);
      });
      map.forEach((st, name) => {
        if (!set.has(name)) st.current = 0;
      });
    };

    matchNos.forEach((m) => {
      const rec = byMatch.get(m);
      if (!rec) return;
      updateStreaksForMatch(rec.scorers, goalStreaks);
      updateStreaksForMatch(rec.assisters, assistStreaks);
    });

    let bestGoal = null;
    goalStreaks.forEach((st, name) => {
      if (st.best <= 0) return;
      if (!bestGoal || st.best > bestGoal.length) {
        bestGoal = { name, length: st.best };
      }
    });

    let bestAssist = null;
    assistStreaks.forEach((st, name) => {
      if (st.best <= 0) return;
      if (!bestAssist || st.best > bestAssist.length) {
        bestAssist = { name, length: st.best };
      }
    });

    if (bestGoal) bestGoal.teamName = playerTeamMap[bestGoal.name] || "—";
    if (bestAssist) bestAssist.teamName = playerTeamMap[bestAssist.name] || "—";

    return { bestGoal, bestAssist };
  }, [cleanTournamentResults, cleanTournamentEvents, playerTeamMap]);

  // ---------- GLOBAL NUMBERS ----------
  const totalMatches = cleanTournamentResults.length;
  const totalGoals = cleanTournamentResults.reduce(
    (acc, r) => acc + (r.goalsA || 0) + (r.goalsB || 0),
    0
  );

  const biggestWin = useMemo(() => {
    let best = null;
    cleanTournamentResults.forEach((r) => {
      const gA = r.goalsA || 0;
      const gB = r.goalsB || 0;
      const diff = Math.abs(gA - gB);
      const goals = gA + gB;
      if (diff === 0) return;
      if (!best || diff > best.diff || (diff === best.diff && goals > best.goals)) {
        best = { ...r, diff, goals };
      }
    });
    return best;
  }, [cleanTournamentResults]);

  // ---------- RECAP (LATEST SAVED MATCH-DAY ONLY) ----------
  const recapResults = useMemo(() => {
    const arr = cleanWeekResults.slice();
    arr.sort((a, b) => a.matchNo - b.matchNo);
    return arr;
  }, [cleanWeekResults]);

  const recapEventsByMatch = useMemo(() => {
    const map = new Map();
    cleanWeekEvents.forEach((e) => {
      if (e?.matchNo == null) return;
      const key = String(e.matchNo);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({
        ...e,
        scorer: normalizeName(e?.scorer),
        assist: normalizeName(e?.assist),
        playerName: normalizeName(e?.playerName),
      });
    });
    map.forEach((list) =>
      list.sort((a, b) => Number(a?.timeSeconds || 0) - Number(b?.timeSeconds || 0))
    );
    return map;
  }, [cleanWeekEvents, normalizeName]);

  const getDisplayEventsForRecapMatch = useCallback((result) => {
    const rawEvents = recapEventsByMatch.get(String(result?.matchNo)) || [];
    const scoringEvents = rawEvents.filter((e) => e?.type === "goal" || e?.type === "shibobo" || !e?.type);

    const teamAEvents = scoringEvents
      .filter((e) => e?.teamId === result?.teamAId)
      .slice(0, Number(result?.goalsA || 0));

    const teamBEvents = scoringEvents
      .filter((e) => e?.teamId === result?.teamBId)
      .slice(0, Number(result?.goalsB || 0));

    return [...teamAEvents, ...teamBEvents].sort(
      (a, b) => Number(a?.timeSeconds || 0) - Number(b?.timeSeconds || 0)
    );
  }, [recapEventsByMatch]);

  // ---------- RESPONSIVE FLAG ----------
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const handleResize = () => {
      if (typeof window !== "undefined") setIsNarrow(window.innerWidth < 640);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // RSVP modal state
  const [showRSVP, setShowRSVP] = useState(false);
  const handleOpenRSVP = () => setShowRSVP(true);

  // Year-end program modal state
  const [showProgramModal, setShowProgramModal] = useState(false);
  useEffect(() => {
    if (initialProgramOpen) setShowProgramModal(true);
  }, [initialProgramOpen]);

  // ---------- STYLE OBJECTS ----------
  const yearEndCardStyle = {
    display: isNarrow ? "flex" : "grid",
    flexDirection: isNarrow ? "column" : undefined,
    gridTemplateColumns: isNarrow ? undefined : "minmax(0, 3fr) minmax(0, 2fr)",
    gap: isNarrow ? "1rem" : "1.5rem",
    padding: isNarrow ? "1.2rem" : "1.8rem",
    borderRadius: "1.5rem",
    background:
      "radial-gradient(circle at top left, rgba(248,250,252,0.22), transparent 55%)," +
      "radial-gradient(circle at bottom right, rgba(248,250,252,0.18), transparent 60%)," +
      "linear-gradient(135deg, #020617, #111827 45%, #0b1120 100%)",
    boxShadow:
      "0 18px 45px rgba(15,23,42,0.85), 0 0 0 1px rgba(148,163,184,0.18)",
    color: "#e5e7eb",
    alignItems: "stretch",
    marginBottom: "1.75rem",
  };

  const yearEndPillStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.22rem 0.8rem",
    borderRadius: "999px",
    background: "rgba(15,23,42,0.9)",
    border: "1px solid rgba(148,163,184,0.45)",
    fontSize: "0.8rem",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "#e5e7eb",
  };

  const yearEndHeadingStyle = {
    fontSize: isNarrow ? "1.3rem" : "1.5rem",
    fontWeight: 700,
    margin: "0.6rem 0 0.25rem",
    color: "#f9fafb",
  };

  const yearEndSubStyle = {
    fontSize: "0.92rem",
    color: "#cbd5f5",
    marginBottom: "0.7rem",
  };

  const yearEndMetaRowStyle = {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.55rem",
    margin: "0.5rem 0 0.9rem",
    fontSize: "0.85rem",
    color: "#e5e7eb",
  };

  const metaChipStyle = {
    padding: "0.28rem 0.75rem",
    borderRadius: "999px",
    background: "rgba(15,23,42,0.85)",
    border: "1px solid rgba(148,163,184,0.4)",
  };

  const bulletListStyle = {
    listStyle: "none",
    paddingLeft: 0,
    margin: "0.4rem 0 0",
    fontSize: "0.88rem",
    color: "#e5e7eb",
  };

  const artContainerStyle = {
    position: "relative",
    overflow: "hidden",
    borderRadius: "1.25rem",
    background:
      "radial-gradient(circle at 20% 0%, rgba(251,191,36,0.27), transparent 55%)," +
      "radial-gradient(circle at 90% 80%, rgba(251,113,133,0.32), transparent 60%)," +
      "linear-gradient(145deg, #020617, #111827)",
    minHeight: isNarrow ? "170px" : "210px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginTop: isNarrow ? "0.4rem" : 0,
  };

  const artGlassHaloStyle = {
    position: "absolute",
    width: isNarrow ? "170px" : "210px",
    height: isNarrow ? "170px" : "210px",
    borderRadius: "999px",
    border: "1px solid rgba(248,250,252,0.2)",
    boxShadow: "0 0 60px rgba(251,191,36,0.22), 0 0 120px rgba(251,113,133,0.18)",
    opacity: 0.9,
  };

  const artInnerOrbStyle = {
    position: "absolute",
    width: isNarrow ? "120px" : "140px",
    height: isNarrow ? "120px" : "140px",
    borderRadius: "999px",
    background:
      "radial-gradient(circle, rgba(15,23,42,0.9) 0%, rgba(15,23,42,0.1) 70%, transparent 100%)",
  };

  const suitCardStyle = {
    position: "relative",
    zIndex: 2,
    padding: isNarrow ? "0.7rem 0.9rem" : "0.9rem 1.15rem",
    borderRadius: "1rem",
    background:
      "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(15,23,42,0.75))",
    border: "1px solid rgba(148,163,184,0.6)",
    backdropFilter: "blur(10px)",
    boxShadow: "0 14px 35px rgba(15,23,42,0.9)",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "0.35rem",
    maxWidth: isNarrow ? "80%" : "100%",
  };

  const suitTitleRowStyle = {
    display: "flex",
    alignItems: "center",
    gap: "0.45rem",
    fontSize: "0.9rem",
    color: "#f9fafb",
  };

  const suitEmojiStyle = { fontSize: "1.4rem" };
  const glassesRowStyle = {
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
    fontSize: "1.35rem",
    marginTop: "0.15rem",
  };

  const glassesLabelStyle = {
    fontSize: "0.8rem",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#e5e7eb",
    opacity: 0.9,
  };

  const sparkleRowStyle = {
    display: "flex",
    gap: "0.4rem",
    marginTop: "0.1rem",
    fontSize: "0.8rem",
    color: "#e5e7eb",
    opacity: 0.9,
  };

  const artCornerBadgeStyle = {
    position: "absolute",
    right: "0.9rem",
    top: "0.9rem",
    padding: "0.3rem 0.7rem",
    borderRadius: "999px",
    border: "1px solid rgba(248,250,252,0.65)",
    background: "rgba(15,23,42,0.9)",
    fontSize: "0.7rem",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: "#f9fafb",
  };

  const artBottomRibbonStyle = {
    position: "absolute",
    left: "-12%",
    bottom: "14%",
    width: "140%",
    height: "40px",
    background:
      "linear-gradient(90deg, rgba(251,191,36,0.95), rgba(251,113,133,0.95))",
    transform: "rotate(-4deg)",
    opacity: 0.85,
  };

  const artBottomRibbonInnerStyle = {
    position: "absolute",
    inset: "6px 10px",
    borderRadius: "999px",
    border: "1px solid rgba(248,250,252,0.6)",
  };

  const artBottomTextStyle = {
    position: "absolute",
    left: "14%",
    bottom: "21%",
    fontSize: "0.78rem",
    fontWeight: 600,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    padding: "0.0rem 0.2rem",
    color: "#f9fafb",
    zIndex: 2,
  };

  const newsInputStyle = {
    width: "100%",
    borderRadius: "0.9rem",
    border: "1px solid rgba(148,163,184,0.22)",
    background: "rgba(2,6,23,0.68)",
    color: "#f8fafc",
    padding: "0.78rem 0.9rem",
    outline: "none",
  };

  const injuredAvatarUrl =
    (injuredPlayerName && mergedPhotoMap[injuredPlayerName]) || JaydTribute;

  const renderVenueChip = () => (
    <a
      href={VENUE_MAP_URL}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        ...metaChipStyle,
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        cursor: "pointer",
        textDecoration: "none",
        color: "#e5e7eb",
      }}
    >
      <span role="img" aria-label="Location pin">
        📍
      </span>
      <span>Haveva · Lower Main Road · Observatory</span>
    </a>
  );

  // ---------------- KIT POLL STATE ----------------
  const [kitOrders, setKitOrders] = useState([]);
  const [kitOrdersError, setKitOrdersError] = useState("");

  const myKitOrderName = useMemo(() => {
    if (!identity || identity.role === "spectator") return "";
    return (identity.shortName || identity.fullName || "").trim();
  }, [identity]);

  const myKitOrderId = identity?.memberId || "";

  const isInKitOrders = useMemo(() => {
    if (!myKitOrderId) return false;
    return kitOrders.some((o) => o && o.memberId === myKitOrderId);
  }, [kitOrders, myKitOrderId]);

  useEffect(() => {
    try {
      const unsub = subscribeToKitOrders((list) => {
        setKitOrders(Array.isArray(list) ? list : []);
        setKitOrdersError("");
      });
      return () => {
        if (unsub) unsub();
      };
    } catch (err) {
      console.error("[NewsPage] kit orders subscribe failed:", err);
      setKitOrdersError("Could not load kit orders.");
    }
  }, []);

  const handleToggleKitOrder = async () => {
    if (!identity || identity.role === "spectator") {
      onGoToSignIn?.();
      return;
    }
    if (!myKitOrderId || !myKitOrderName) return;

    try {
      if (isInKitOrders) {
        await removeKitOrder(myKitOrderId);
      } else {
        await upsertKitOrder({ memberId: myKitOrderId, name: myKitOrderName });
      }
    } catch (err) {
      console.error("[NewsPage] kit order update failed:", err);
      setKitOrdersError("Failed to update your vote. Try again.");
    }
  };


  const renderCustomStoryCard = (story, { archivedView = false } = {}) => {
    if (!story) return null;

    const playerName = String(story.playerName || "").trim();
    const playerPhotoUrl = playerName ? getPlayerPhoto(playerName) : null;
    const displayImageUrl = playerPhotoUrl || String(story.imageUrl || "").trim() || null;

    return (
      <section key={story.id} className="card" style={{ overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              displayImageUrl || playerName ? (isNarrow ? "1fr" : "0.95fr 1.05fr") : "1fr",
            gap: "1rem",
            alignItems: "stretch",
          }}
        >
          {(displayImageUrl || playerName) && (
            <div
              style={{
                minHeight: isNarrow ? 220 : 260,
                borderRadius: "1rem",
                overflow: "hidden",
                position: "relative",
                background:
                  "radial-gradient(circle at top left, rgba(59,130,246,0.22), transparent 55%), linear-gradient(135deg, #020617, #111827 55%, #0f172a 100%)",
                border: "1px solid rgba(148,163,184,0.18)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {displayImageUrl ? (
                <img
                  src={displayImageUrl}
                  alt={playerName || story.title}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: playerPhotoUrl ? "cover" : "contain",
                    display: "block",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 140,
                    height: 140,
                    borderRadius: "999px",
                    background:
                      "linear-gradient(135deg, rgba(250,204,21,0.95), rgba(245,158,11,0.86))",
                    color: "#0f172a",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "2rem",
                    fontWeight: 900,
                    boxShadow:
                      "0 18px 45px rgba(15,23,42,0.6), 0 0 0 5px rgba(255,255,255,0.12)",
                  }}
                >
                  {getInitials(playerName || story.title)}
                </div>
              )}

              {playerName && (
                <div
                  style={{
                    position: "absolute",
                    left: "0.8rem",
                    bottom: "0.8rem",
                    padding: "0.4rem 0.7rem",
                    borderRadius: "999px",
                    background: "rgba(2,6,23,0.8)",
                    border: "1px solid rgba(255,255,255,0.14)",
                    fontWeight: 700,
                    fontSize: "0.82rem",
                    backdropFilter: "blur(8px)",
                  }}
                >
                  {playerName}
                </div>
              )}
            </div>
          )}

          <div style={{ minWidth: 0, position: "relative" }}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.5rem",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "0.7rem",
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.45rem",
                  padding: "0.25rem 0.65rem",
                  borderRadius: "999px",
                  background: "rgba(59,130,246,0.16)",
                  border: "1px solid rgba(59,130,246,0.28)",
                  fontWeight: 700,
                  maxWidth: "100%",
                }}
              >
                <span>📰</span>
                <span>{story.tag || "Story"}</span>
              </div>

              {!archivedView && canManageCustomStories && (
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => handleEditCustomStory(story)}
                    style={{ padding: "0.48rem 0.8rem", fontSize: "0.82rem" }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => handleArchiveToggleCustomStory(story.id)}
                    style={{ padding: "0.48rem 0.8rem", fontSize: "0.82rem" }}
                  >
                    Archive
                  </button>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => handleDeleteCustomStory(story.id)}
                    style={{
                      padding: "0.48rem 0.8rem",
                      fontSize: "0.82rem",
                      borderColor: "rgba(248,113,113,0.4)",
                      color: "#fecaca",
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}

              {archivedView && canManageCustomStories && (
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => handleArchiveToggleCustomStory(story.id)}
                    style={{ padding: "0.48rem 0.8rem", fontSize: "0.82rem" }}
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => handleDeleteCustomStory(story.id)}
                    style={{
                      padding: "0.48rem 0.8rem",
                      fontSize: "0.82rem",
                      borderColor: "rgba(248,113,113,0.4)",
                      color: "#fecaca",
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>

            <h2 style={{ marginTop: 0 }}>{story.title}</h2>
            <p style={{ marginTop: "0.35rem", whiteSpace: "pre-wrap" }}>{story.body}</p>

            {canManageCustomStories && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.55rem",
                  marginTop: "0.9rem",
                  fontSize: "0.82rem",
                  opacity: 0.92,
                }}
              >
                <span style={metaChipStyle}>📍 {getSlotLabel(story.slotKey)}</span>
                {story.createdBy ? <span style={metaChipStyle}>✍️ {story.createdBy}</span> : null}
              </div>
            )}
          </div>
        </div>
      </section>
    );
  };

  const renderCustomStoriesAt = (slotKey) => {
    const stories = sortedActiveCustomStories.filter((story) => story?.slotKey === slotKey);
    if (!stories.length) return null;
    return stories.map((story) => renderCustomStoryCard(story));
  };

  // ---------- RENDER ----------
  return (
    <div className="page news-page">
      <div
        className={`landing-header-sticky ${
          headerScrolled ? "is-scrolled" : ""
        }`}
      >
        <header className="header">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              width: "100%",
            }}
          >
            <div className="header-title" style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0 }}>News &amp; highlights</h1>
            </div>

            <button
              className="secondary-btn"
              onClick={onBack}
              aria-label="Home"
              title="Home"
              style={{
                minWidth: "46px",
                width: "46px",
                height: "46px",
                padding: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.05rem",
                flexShrink: 0,
              }}
            >
              🏠
            </button>
          </div>
        </header>
      </div>

      <header className="header">
        <p className="subtitle">
          Automatic recap built from your full TurfKings match history.
        </p>
      </header>

      {canManageCustomStories && (
        <section className="card" style={{ overflow: "hidden" }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "space-between",
              gap: "1rem",
              alignItems: "center",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <h2 style={{ marginTop: 0, marginBottom: "0.35rem" }}>Custom story studio</h2>
              <p className="muted" style={{ margin: 0 }}>
                Create a story without coding, publish it to everyone,
                and manage only the stories created here.
              </p>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.55rem" }}>
              <span style={metaChipStyle}>
                Active custom stories: <strong>{activeCustomStoryCount}</strong> / {CUSTOM_STORY_LIMIT}
              </span>
              {loadingStories && <span style={metaChipStyle}>Loading shared stories…</span>}
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  setShowCreateStoryForm((current) => !current);
                  setStoryFormError("");
                  setStoryFormNotice("");
                }}
                disabled={hasReachedCustomStoryLimit && !showCreateStoryForm}
                style={{ opacity: hasReachedCustomStoryLimit && !showCreateStoryForm ? 0.65 : 1 }}
              >
                {showCreateStoryForm ? "Close story form" : "Create story"}
              </button>
            </div>
          </div>

          {hasReachedCustomStoryLimit && (
            <div
              style={{
                marginTop: "0.9rem",
                padding: "0.85rem 1rem",
                borderRadius: "1rem",
                background: "rgba(245, 158, 11, 0.12)",
                border: "1px solid rgba(245, 158, 11, 0.25)",
                color: "#fde68a",
              }}
            >
              You have reached the limit of 5 active custom stories. Archive or delete one of
              your older custom stories first.
            </div>
          )}

          {showCreateStoryForm && (
            <div
              style={{
                marginTop: "1rem",
                padding: "1rem",
                borderRadius: "1rem",
                background: "rgba(15,23,42,0.4)",
                border: "1px solid rgba(148,163,184,0.18)",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isNarrow ? "1fr" : "repeat(2, minmax(0, 1fr))",
                  gap: "0.85rem",
                }}
              >
                <label style={{ display: "grid", gap: "0.35rem" }}>
                  <span style={{ fontWeight: 700 }}>Story title</span>
                  <input
                    type="text"
                    value={storyDraft.title}
                    onChange={(e) => handleStoryDraftChange("title", e.target.value)}
                    placeholder="Headline"
                    style={newsInputStyle}
                  />
                </label>

                <label style={{ display: "grid", gap: "0.35rem" }}>
                  <span style={{ fontWeight: 700 }}>Story tag</span>
                  <input
                    type="text"
                    value={storyDraft.tag}
                    onChange={(e) => handleStoryDraftChange("tag", e.target.value)}
                    placeholder="Story / Transfer / Spotlight"
                    style={newsInputStyle}
                  />
                </label>

                <label style={{ display: "grid", gap: "0.35rem" }}>
                  <span style={{ fontWeight: 700 }}>Where should this story appear?</span>
                  <select
                    value={storyDraft.slotKey}
                    onChange={(e) => handleStoryDraftChange("slotKey", e.target.value)}
                    style={newsInputStyle}
                  >
                    {CUSTOM_STORY_SLOT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ display: "grid", gap: "0.35rem" }}>
                  <span style={{ fontWeight: 700 }}>Player in the group (optional)</span>
                  <select
                    value={storyDraft.playerName}
                    onChange={(e) => handleStoryDraftChange("playerName", e.target.value)}
                    style={newsInputStyle}
                  >
                    <option value="">No player selected</option>
                    {allKnownPlayers.map((playerName) => (
                      <option key={playerName} value={playerName}>
                        {playerName}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ display: "grid", gap: "0.35rem" }}>
                  <span style={{ fontWeight: 700 }}>Custom image URL (optional)</span>
                  <input
                    type="text"
                    value={storyDraft.imageUrl}
                    onChange={(e) => handleStoryDraftChange("imageUrl", e.target.value)}
                    placeholder="https://..."
                    style={newsInputStyle}
                  />
                </label>

                <label style={{ display: "grid", gap: "0.35rem", gridColumn: "1 / -1" }}>
                  <span style={{ fontWeight: 700 }}>Story body</span>
                  <textarea
                    value={storyDraft.body}
                    onChange={(e) => handleStoryDraftChange("body", e.target.value)}
                    rows={5}
                    placeholder="Write the story..."
                    style={{ ...newsInputStyle, resize: "vertical", minHeight: 140 }}
                  />
                </label>
              </div>

              {storyFormError && (
                <div style={{ marginTop: "0.85rem", color: "#fca5a5", fontWeight: 600 }}>
                  {storyFormError}
                </div>
              )}

              {storyFormNotice && !storyFormError && (
                <div style={{ marginTop: "0.85rem", color: "#86efac", fontWeight: 600 }}>
                  {storyFormNotice}
                </div>
              )}

              <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap", marginTop: "1rem" }}>
                <button type="button" className="primary-btn" onClick={handleSaveCustomStory}>
                  {editingStoryId ? "Update story" : "Save story"}
                </button>
                <button type="button" className="secondary-btn" onClick={resetStoryDraft}>
                  Reset
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ✅ JERSEY STORY */}
      <section className="card" style={{ overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isNarrow ? "1fr" : "1.1fr 0.9fr",
            gap: "1rem",
            alignItems: "center",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: "inline-flex",
                gap: "0.5rem",
                alignItems: "center",
                padding: "0.25rem 0.6rem",
                borderRadius: "999px",
                background: "rgba(59,130,246,0.18)",
                border: "1px solid rgba(59,130,246,0.35)",
                marginBottom: "0.6rem",
              }}
            >
              <span>👕</span>
              <span style={{ fontWeight: 700 }}>New kit drop</span>
              <span style={{ opacity: 0.85 }}>(~R300 For the top)</span>
            </div>

            <h2 style={{ marginTop: 0 }}>TurfKings jersey orders</h2>
            <p style={{ marginTop: "0.35rem" }}>
              We&apos;re about to place an order for the new TurfKings team kit.
              If you want one, vote below so we can count numbers. Price is
              around <strong>R300</strong> for the Jersey, no short for now.
            </p>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.6rem",
                marginTop: "0.8rem",
                alignItems: "center",
              }}
            >
              <button
                type="button"
                className={
                  identity && identity.role !== "spectator"
                    ? "primary-btn"
                    : "secondary-btn"
                }
                onClick={handleToggleKitOrder}
                style={{ padding: "0.6rem 1rem", fontSize: "0.9rem" }}
              >
                {identity && identity.role !== "spectator"
                  ? isInKitOrders
                    ? "✅ I'm in (remove me)"
                    : "✅ I'm in for a jersey"
                  : "Sign in to vote"}
              </button>

              <span style={{ opacity: 0.9, fontSize: "0.9rem" }}>
                Votes: <strong>{kitOrders?.length || 0}</strong>
              </span>

              {kitOrdersError && (
                <span style={{ color: "#fca5a5", fontSize: "0.85rem" }}>
                  {kitOrdersError}
                </span>
              )}
            </div>

            <div style={{ marginTop: "0.9rem" }}>
              <div style={{ fontWeight: 700, marginBottom: "0.35rem" }}>
                Who&apos;s buying? :
              </div>

              {!kitOrders || kitOrders.length === 0 ? (
                <div className="muted">No votes yet. Be the first 👑</div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
                  {kitOrders
                    .slice()
                    .sort((a, b) =>
                      String(a?.name || "").localeCompare(String(b?.name || ""))
                    )
                    .map((o) => (
                      <span
                        key={o.memberId}
                        style={{
                          padding: "0.22rem 0.55rem",
                          borderRadius: "999px",
                          background: "rgba(15, 23, 42, 0.6)",
                          border: "1px solid rgba(148, 163, 184, 0.25)",
                          fontSize: "0.88rem",
                        }}
                      >
                        {o.name}
                      </span>
                    ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
            <img
              src={JerseyImage}
              alt="TurfKings jersey"
              style={{
                width: "100%",
                maxWidth: 420,
                borderRadius: "1rem",
                border: "1px solid rgba(148,163,184,0.2)",
              }}
            />
          </div>
        </div>
      </section>

      {renderCustomStoriesAt("after-jersey")}

      {/* HERO SUMMARY */}
      <section className="card news-hero-card">
        <div className="news-hero-main">
          <h2>Tournament recap</h2>
          <p className="news-hero-text">
            So far we&apos;ve logged <strong>{totalMatches || 0}</strong> matches and{" "}
            <strong>{totalGoals || 0}</strong> goals in the TurfKings 5-a-side league.
          </p>
          {tableLeader && (
            <p className="news-hero-text">
              <strong>{tableLeader.name}</strong> currently lead the table with{" "}
              <strong>{tableLeader.points}</strong> points and a goal difference of{" "}
              <strong>{tableLeader.goalDiff}</strong> from {tableLeader.played} games.
            </p>
          )}
        </div>

        <div className="news-hero-side">
          <div className="news-stat-chips">
            <div className="news-stat-chip">
              Matches
              <span>{totalMatches || 0}</span>
            </div>
            <div className="news-stat-chip">
              Goals scored
              <span>{totalGoals || 0}</span>
            </div>
            {topScorer && (
              <div className="news-stat-chip">
                Top scorer
                <span>
                  {topScorer.name} ({topScorer.goals})
                </span>
              </div>
            )}
            {topPlaymaker && (
              <div className="news-stat-chip">
                Top playmaker
                <span>
                  {topPlaymaker.name} ({topPlaymaker.assists})
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      {renderCustomStoriesAt("after-hero")}

      {/* HEADLINES + BIGGEST WIN */}
      <section className="card news-grid">
        <div className="news-column">
          <h2>Headlines</h2>
          <ul className="news-list">
            {tableLeader && (
              <li className="news-list-item">
                <span className="news-tag">Standings</span>
                <span>
                  <strong>{tableLeader.name}</strong> sit on top with{" "}
                  {tableLeader.points} points ({tableLeader.won}W {tableLeader.drawn}D{" "}
                  {tableLeader.lost}L).
                </span>
              </li>
            )}

            {topScorer && (
              <li className="news-list-item">
                <span className="news-tag">Goals</span>
                <span>
                  <strong>{topScorer.name}</strong> leads the golden-boot race with{" "}
                  {topScorer.goals} goals so far.
                </span>
              </li>
            )}

            {topPlaymaker && (
              <li className="news-list-item">
                <span className="news-tag">Assists</span>
                <span>
                  <strong>{topPlaymaker.name}</strong> has created {topPlaymaker.assists}{" "}
                  goals, topping the playmaker chart.
                </span>
              </li>
            )}

            {!tableLeader && !topScorer && !topPlaymaker && (
              <li className="news-list-item">
                <span className="news-tag">Info</span>
                <span>
                  No stats yet – start a live match to generate your first round of TurfKings news.
                </span>
              </li>
            )}
          </ul>
        </div>

        <div className="news-column">
          <h2>Match of the Tournament</h2>
          {biggestWin ? (
            <div className="news-match-feature">
              <p className="news-match-label">Match #{biggestWin.matchNo}</p>
              <p className="news-match-scoreline">
                <span>{getTeamName(biggestWin.teamAId)}</span>
                <span className="score">
                  {biggestWin.goalsA} – {biggestWin.goalsB}
                </span>
                <span>{getTeamName(biggestWin.teamBId)}</span>
              </p>
              <p className="news-match-note">
                Margin of <strong>{biggestWin.diff}</strong> goals with{" "}
                <strong>{biggestWin.goals}</strong> total on the board.
              </p>
            </div>
          ) : (
            <p className="muted">
              We&apos;ll highlight the biggest win once a few games have been played.
            </p>
          )}
        </div>
      </section>

      {renderCustomStoriesAt("after-headlines")}

      {/* TOURNAMENT MVP CARD */}
      {bestOverall && (
        <section className="card news-mvp-card">
          <div className="mvp-hero">
            <div
              className="mvp-avatar"
              style={{
                width: 92,
                height: 92,
                minWidth: 92,
                borderRadius: "999px",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid rgba(255,255,255,0.22)",
                boxShadow: "0 0 0 4px rgba(59,130,246,0.12)",
                background: "linear-gradient(135deg, #0f172a, #1e3a8a)",
              }}
            >
              {mvpPhotoUrl ? (
                <img
                  src={mvpPhotoUrl}
                  alt={bestOverall.name}
                  className="mvp-photo"
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              ) : (
                <span className="mvp-initials">{getInitials(bestOverall.name)}</span>
              )}
            </div>
            <div>
              <p className="mvp-label">Tournament MVP (so far)</p>
              <h2 className="mvp-name">{bestOverall.name}</h2>
              <p className="mvp-team">
                {bestOverall.teamName && bestOverall.teamName !== "—"
                  ? `Team: ${bestOverall.teamName}`
                  : "Flying free agent mode."}
              </p>
            </div>
          </div>
          <div className="mvp-stats">
            <div className="mvp-stat-pill">
              <span>Total G+A+S</span>
              <strong>{bestOverall.total}</strong>
            </div>
            <div className="mvp-stat-pill">
              <span>Goals</span>
              <strong>{bestOverall.goals}</strong>
            </div>
            <div className="mvp-stat-pill">
              <span>Assists</span>
              <strong>{bestOverall.assists}</strong>
            </div>
            <div className="mvp-stat-pill">
              <span>Shibobos</span>
              <strong>{bestOverall.shibobos}</strong>
            </div>
          </div>
        </section>
      )}

      {renderCustomStoriesAt("after-mvp")}

      {/* STREAK WATCH */}
      <section className="card news-streak-card">
        <h2>Streak watch</h2>
        {!streakStats.bestGoal && !streakStats.bestAssist ? (
          <p className="muted">
            No streaks yet – once players start scoring and assisting in back-to-back games,
            their names will light up here.
          </p>
        ) : (
          <div className="streak-grid">
            {streakStats.bestGoal && (
              <div className="streak-pill">
                <span className="streak-tag">Goal streak</span>
                <p className="streak-main">
                  <strong>{streakStats.bestGoal.name}</strong> has scored in{" "}
                  <strong>{streakStats.bestGoal.length}</strong>{" "}
                  match{streakStats.bestGoal.length > 1 ? "es" : ""} in a row.
                </p>
                <p className="streak-sub">
                  {streakStats.bestGoal.teamName && streakStats.bestGoal.teamName !== "—"
                    ? `Flying for ${streakStats.bestGoal.teamName}.`
                    : "Free roaming finisher energy."}
                </p>
              </div>
            )}

            {streakStats.bestAssist && (
              <div className="streak-pill">
                <span className="streak-tag">Assist streak</span>
                <p className="streak-main">
                  <strong>{streakStats.bestAssist.name}</strong> has dropped assists in{" "}
                  <strong>{streakStats.bestAssist.length}</strong> straight game
                  {streakStats.bestAssist.length > 1 ? "s" : ""}.
                </p>
                <p className="streak-sub">
                  {streakStats.bestAssist.teamName && streakStats.bestAssist.teamName !== "—"
                    ? `Playmaking for ${streakStats.bestAssist.teamName}.`
                    : "Sharing the shine with everyone."}
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      {renderCustomStoriesAt("after-streak")}

      {renderCustomStoriesAt("before-old-stories")}

      {/* OLD STORIES FOLDER */}
      <details className="card">
        <summary style={{ cursor: "pointer", fontWeight: 800 }}>
          🗂️ Old stories (tap to expand)
        </summary>

        {archivedCustomStories.length > 0 && (
          <details style={{ marginTop: "0.8rem" }}>
            <summary style={{ cursor: "pointer", fontWeight: 800 }}>
              📰 Archived custom stories ({archivedCustomStories.length})
            </summary>

            <div style={{ marginTop: "0.8rem", display: "grid", gap: "0.8rem" }}>
              {archivedCustomStories
                .slice()
                .sort((a, b) => Number(b?.archivedAt || 0) - Number(a?.archivedAt || 0))
                .map((story) => (
                  <details key={story.id}>
                    <summary style={{ cursor: "pointer", fontWeight: 800 }}>
                      📰 {story.title || "Untitled story"}
                    </summary>
                    <div style={{ marginTop: "0.8rem" }}>
                      {renderCustomStoryCard(story, { archivedView: true })}
                    </div>
                  </details>
                ))}
            </div>
          </details>
        )}

        {/* Year-End story inside Old stories */}
        <details style={{ marginTop: "0.8rem" }}>
          <summary style={{ cursor: "pointer", fontWeight: 800 }}>
            ✨ Year-End Function (tap to expand)
          </summary>

          <section className="card year-end-premium-card" style={yearEndCardStyle}>
            <div style={{ minWidth: 0 }}>
              <div style={yearEndPillStyle}>
                <span>✨ Special Event</span>
                <span style={{ fontSize: "0.9rem" }}>• Year-End Function</span>
              </div>

              <h2 style={yearEndHeadingStyle}>TurfKings Year-End Function</h2>
              <p style={yearEndSubStyle}>
                We&apos;re closing off the season in proper TurfKings style – full
                squad night out. 🏆
              </p>

              <div style={yearEndMetaRowStyle}>
                <span style={metaChipStyle}>📅 Friday · 5 December</span>
                <span style={metaChipStyle}>⏰ 18:00 arrival · 19:30 program</span>
                {renderVenueChip()}
              </div>

              <ul style={bulletListStyle}>
                <li>• Dress code: Smart / suit vibes – leave the bibs at home.</li>
              </ul>

              <p style={{ marginTop: "0.7rem", fontSize: "0.85rem", opacity: 0.95 }}>
                🧊 <strong>Coolerboxes &amp; bottles are encouraged</strong> – bring
                your own drinks. There&apos;s a small fee for walking in with them,
                but it works out cheaper and keeps the vibe relaxed for the whole
                night. (<strong>R180</strong> per coolerbox) and (
                <strong>R80</strong> per whisky/brandy/gin bottle).
              </p>

              <p style={{ marginTop: "0.7rem", fontSize: "0.85rem", opacity: 0.95 }}>
                💰 <strong>Cover charge:</strong> <strong>R100</strong> per player +{" "}
                <strong>R75</strong> per friend (max 3) for food/bites. Use the RSVP
                list to confirm your spot and who you&apos;re bringing. If you&apos;re
                not drinking and you&apos;re coming solo, it&apos;s basically{" "}
                <strong>R100</strong> for a full night out with the squad.
              </p>

              <div
                style={{
                  marginTop: "1rem",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.6rem",
                }}
              >
                <button
                  type="button"
                  className="primary-btn"
                  onClick={handleOpenRSVP}
                  style={{ padding: "0.65rem 1.2rem", fontSize: "0.9rem" }}
                >
                  🎟️ Manage RSVP
                </button>

                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => setShowProgramModal(true)}
                  style={{ padding: "0.65rem 1.1rem", fontSize: "0.9rem" }}
                >
                  📋 View Program
                </button>
              </div>

              {!identity && (
                <p style={{ fontSize: "0.8rem", marginTop: "0.35rem", opacity: 0.8 }}>
                  Please sign in on the main page to RSVP and see who&apos;s in.
                </p>
              )}
            </div>

            <div style={artContainerStyle} aria-hidden="true">
              <div style={artGlassHaloStyle} />
              <div style={artInnerOrbStyle} />

              <div style={suitCardStyle}>
                <div style={suitTitleRowStyle}>
                  <span style={suitEmojiStyle}>🎩</span>
                  <div>
                    <div style={{ fontSize: "0.78rem", opacity: 0.8 }}>Dress Code</div>
                    <div style={{ fontWeight: 600, fontSize: "0.92rem" }}>
                      Suits &amp; Smart Fits
                    </div>
                  </div>
                </div>

                <div style={glassesRowStyle}>
                  <span>🥂</span>
                  <span>🥂</span>
                  <div style={glassesLabelStyle}>TurfKings Toast</div>
                </div>

                <div style={sparkleRowStyle}>
                  <span>✦ Photos</span>
                  <span>✦ Stories</span>
                  <span>✦ Drinks</span>
                </div>
              </div>

              <div style={artCornerBadgeStyle}>Year-End 2025</div>

              {!isNarrow && (
                <>
                  <div style={artBottomRibbonStyle}>
                    <div style={artBottomRibbonInnerStyle} />
                  </div>
                  <div style={artBottomTextStyle}>5 DECEMBER · 18:00 · HAVEVA</div>
                </>
              )}
            </div>
          </section>
        </details>

        {/* Jayd story inside Old stories */}
        <details style={{ marginTop: "0.8rem" }}>
          <summary style={{ cursor: "pointer", fontWeight: 800 }}>
            🩹 Jayd story (tap to expand)
          </summary>

          <section className="card injury-tribute-card">
            <div className="injury-photo-wrapper">
              <img src={injuredAvatarUrl} alt="Injury tribute" className="injury-photo" />
            </div>
            <div className="injury-text">
              <h2>Looking forward to Jayd&apos;s recovery</h2>
              <p>
                In the middle of this shot – standing between <strong>Enock</strong> and the
                brilliant <strong>Justin</strong> – is <strong>{injuredPlayerName}</strong>,
                our teammate battling a long-term injury.
              </p>
              <p>
                <strong>Ebrahim</strong> is dropping a knee in front, but the whole frame is
                really about the player in the centre: a reminder of the energy, link-up and calm
                presence we can&apos;t wait to have back on the pitch.
              </p>
              <p className="injury-cta">
                From the whole TurfKings family: speedy recovery, bro – your spot is waiting.
              </p>
            </div>
          </section>
        </details>
      </details>

      {renderCustomStoriesAt("before-recap")}

      {/* MATCH-BY-MATCH RECAP */}
      <section className="card">
        <div className="news-recap-header">
          <h2>Match-by-match recap</h2>
          <span className="news-recap-subtitle">Match-day {latestMatchDayLabel}</span>
        </div>

        {recapResults.length === 0 ? (
          <p className="muted">No matches recorded for the latest saved match-day yet.</p>
        ) : (
          <ul className="news-match-list">
            {recapResults.map((r) => {
              const events = getDisplayEventsForRecapMatch(r);
              return (
                <li key={r.matchNo} className="news-match-item">
                  <div className="news-match-header">
                    <span className="news-match-number">
                      Match #{r.matchNo} – {latestMatchDayLabel}
                    </span>
                    <span className="news-match-scoreline">
                      <span>{getTeamName(r.teamAId)}</span>
                      <span className="score">
                        {r.goalsA} – {r.goalsB}
                      </span>
                      <span>{getTeamName(r.teamBId)}</span>
                    </span>
                  </div>

                  {events.length === 0 ? (
                    <p className="muted small">No event breakdown stored for this match.</p>
                  ) : (
                    <ul className="news-event-list">
                      {events.map((e) => {
                        const abbr = getPlayerTeamAbbrev(e.scorer);
                        const assistPart = e.assist ? ` (assist: ${normalizeName(e.assist)})` : "";
                        const teamSuffix = abbr ? `, ${abbr}` : "";
                        return (
                          <li key={e.id} className="news-event-item">
                            <span className="news-event-time">
                              {formatSecondsSafe(e.timeSeconds)}
                            </span>
                            <span className="news-event-text">
                              <strong>{e.type === "shibobo" ? "Shibobo" : "Goal"}</strong> –{" "}
                              {normalizeName(e.scorer)}
                              {assistPart}
                              {teamSuffix}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {showRSVP && (
        <RSVPModal
          identity={identity}
          onClose={() => setShowRSVP(false)}
        />
      )}

      {showProgramModal && (
        <YearEndProgramModal
          identity={identity}
          onClose={() => setShowProgramModal(false)}
        />
      )}
    </div>
  );
}

function formatSecondsSafe(s) {
  const v = typeof s === "number" && !Number.isNaN(s) && s >= 0 ? s : 0;
  const m = Math.floor(v / 60)
    .toString()
    .padStart(2, "0");
  const sec = (v % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${sec}`;
}

function getInitials(name) {
  if (!name || typeof name !== "string") return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatMatchDayDate(input) {
  let d = null;
  if (input instanceof Date) d = input;
  else if (typeof input === "string") {
    const tmp = new Date(input);
    if (!Number.isNaN(tmp.getTime())) d = tmp;
  }
  if (!d) return "";

  const day = d.getDate().toString().padStart(2, "0");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}