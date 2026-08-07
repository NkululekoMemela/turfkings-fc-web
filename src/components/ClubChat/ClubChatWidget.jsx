// src/components/ClubChat/ClubChatWidget.jsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { db } from "../../firebaseConfig";
import VideoHighlightsRepository from "../../storage/VideoHighlightsRepository.js";
import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";

function isChallengerChatActive(fixture = {}) {
  const status = String(fixture?.status || "").toLowerCase();

  if (
    status.includes("cancel") ||
    status.includes("rejected") ||
    status.includes("declined")
  ) {
    return false;
  }

  const dateText = String(fixture?.proposedDate || "").trim();
  if (!dateText) return true;

  const kickoffText = String(fixture?.proposedKickoff || "23:59").trim();
  const timeText = /^\d{2}:\d{2}$/.test(kickoffText) ? kickoffText : "23:59";
  const fixtureTime = new Date(`${dateText}T${timeText}:00`);

  if (Number.isNaN(fixtureTime.getTime())) return true;

  return fixtureTime.getTime() + 24 * 60 * 60 * 1000 >= Date.now();
}

export function ClubChatWidget({
  activeClubId,
  activeClubName,
  currentUser,
  selectedMember,
  identity,
  isAdminViewer,
  premiumPanelStyle,
  activeSeasonId = null,
  currentMatchNo = 1,
  matchType = "FRIENDLY",
  gameFormat = "5_V_5",
  members = [],
  variant = "inline",
  onOpenFullChat,
  onOpenHighlight,
}) {

  /*
   * Club Chat viewport behaviour:
   * - opening the chat lands on the latest message;
   * - incoming messages follow only while the reader is already
   *   close to the bottom;
   * - scrolling upward to read history is respected.
   */
  const clubChatMessagesRef = useRef(null);
  const clubChatInitialScrollDoneRef = useRef(false);
  const clubChatShouldFollowBottomRef = useRef(true);

  const scrollClubChatToBottom = useCallback((behavior = "auto") => {
    const node = clubChatMessagesRef.current;
    if (!node) return;

    node.scrollTo({
      top: node.scrollHeight,
      behavior,
    });
  }, []);

  const handleClubChatMessagesScroll = useCallback(() => {
    const node = clubChatMessagesRef.current;
    if (!node) return;

    const distanceFromBottom =
      node.scrollHeight - node.scrollTop - node.clientHeight;

    clubChatShouldFollowBottomRef.current =
      distanceFromBottom <= 80;
  }, []);


  const isLauncherOnly = variant === "launcher";
  const isPageMode = variant === "page";
  const [challengerChatFixture, setChallengerChatFixture] = useState(null);
  const [activeChatRoom, setActiveChatRoom] = useState("club");
  const [challengerChatMessages, setChallengerChatMessages] = useState([]);
  const [challengerChatDraft, setChallengerChatDraft] = useState("");
  const [challengerChatEmojiOpen, setChallengerChatEmojiOpen] = useState(false);
  const challengerChatEndRef = useRef(null);

  const [clubChatMessages, setClubChatMessages] = useState([]);
  const [clubChatDraft, setClubChatDraft] = useState("");
  const [clubChatOpen, setClubChatOpen] = useState(isPageMode);
  const [clubChatTeaseOpen, setClubChatTeaseOpen] = useState(false);
  const [clubChatEmojiOpen, setClubChatEmojiOpen] = useState(false);
  const [highlightPickerOpen, setHighlightPickerOpen] = useState(false);
  const [availableHighlights, setAvailableHighlights] = useState([]);
  const [selectedHighlight, setSelectedHighlight] = useState(null);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionPickerOpen, setMentionPickerOpen] = useState(false);
  const [selectedMentions, setSelectedMentions] = useState([]);
  const [replyTarget, setReplyTarget] = useState(null);
  const [previewHighlight, setPreviewHighlight] = useState(null);
  const [activeReactionPickerMessageId, setActiveReactionPickerMessageId] = useState(null);
  const [clubChatLastSeenMs, setClubChatLastSeenMs] = useState(0);
  const [launcherBottom, setLauncherBottom] = useState(() => {
    try {
      return Number(window.localStorage.getItem("fanm_chat_launcher_bottom") || 88);
    } catch {
      return 88;
    }
  });
  const [launcherIsDragging, setLauncherIsDragging] = useState(false);
  const [launcherIsIdle, setLauncherIsIdle] = useState(false);
  const dragStartRef = useRef({ y: 0, bottom: 88 });
  const idleTimerRef = useRef(null);
  const clubChatEndRef = useRef(null);

  const [challengerChatLastSeenMs, setChallengerChatLastSeenMs] = useState(0);
  const [chatToast, setChatToast] = useState(null);
  const toastTimerRef = useRef(null);
  const latestNotifiedRef = useRef({ club: 0, challenger: 0 });

  const chatReactionOptions = ["⚽", "🔥", "🧤", "👏", "😂", "❤️", "👍", "👎", "😩", "🤯"];

  const getCurrentReactorKey = () =>
    String(
      currentUser?.uid ||
      selectedMember?.id ||
      identity?.memberId ||
      identity?.playerId ||
      currentUser?.email ||
      selectedMember?.email ||
      identity?.email ||
      "anonymous"
    )
      .trim()
      .replace(/[^A-Za-z0-9_-]/g, "_");

  const getReactionUsers = (message, emoji) => {
    const reactionsByUser = message?.reactionsByUser || {};
    return Object.entries(reactionsByUser)
      .filter(([, selectedEmoji]) => selectedEmoji === emoji)
      .map(([reactorKey]) => reactorKey);
  };

  const getMyReaction = (message) => {
    const key = getCurrentReactorKey();
    const direct = message?.reactionsByUser?.[key] || "";
    if (direct) return direct;

    return chatReactionOptions.find((emoji) => getReactionUsers(message, emoji).includes(key)) || "";
  };

  const getVisibleReactions = (message) =>
    chatReactionOptions
      .filter((emoji) => getReactionUsers(message, emoji).length > 0)
      .sort((a, b) => getReactionUsers(message, b).length - getReactionUsers(message, a).length)
      .slice(0, 3);

  const userReacted = (message, emoji) => {
    const key = getCurrentReactorKey();
    return getReactionUsers(message, emoji).includes(key);
  };

  const toggleClubChatReaction = async (message, emoji) => {
    if (!message?.id || !activeClubId) return;

    const key = getCurrentReactorKey();
    if (!key) return;

    const currentEmoji = message?.reactionsByUser?.[key] || "";
    const nextEmoji = currentEmoji === emoji ? "" : emoji;

    try {
      await updateDoc(doc(db, "clubs", activeClubId, "chatMessages", message.id), {
        [`reactionsByUser.${key}`]: nextEmoji,
      });
      setActiveReactionPickerMessageId(null);
    } catch (err) {
      console.error("[ClubChatWidget] Failed updating reaction:", err);
      window.alert("Could not update reaction just now.");
    }
  };

  useEffect(() => {
    try {
      setClubChatLastSeenMs(
        Number(window.localStorage.getItem(`fanm_club_chat_seen_${activeClubId}`) || 0)
      );
    } catch {
      setClubChatLastSeenMs(0);
    }
  }, [activeClubId]);

  useEffect(() => {
    const handleAttachHighlightToChat = (event) => {
      const highlight = event?.detail || {};
      if (!highlight?.id) return;

      setSelectedHighlight({
        ...highlight,
        scorerName: highlight.scorerName || highlight.playerName || "",
        teamName: highlight.teamName || "",
        label: highlight.label || highlight.title || "Goal clip",
      });
      setClubChatOpen(true);
      setActiveChatRoom("club");
      setHighlightPickerOpen(false);
    };

    window.addEventListener("fanm_attach_highlight_to_chat", handleAttachHighlightToChat);

    return () => {
      window.removeEventListener("fanm_attach_highlight_to_chat", handleAttachHighlightToChat);
    };
  }, []);

  /*
   * Opening Club Chat:
   * land on the newest message once the message viewport exists.
   */
  useEffect(() => {
    if (!clubChatOpen) {
      clubChatInitialScrollDoneRef.current = false;
      return;
    }

    if (clubChatInitialScrollDoneRef.current) return;

    clubChatInitialScrollDoneRef.current = true;
    clubChatShouldFollowBottomRef.current = true;

    const frame = window.requestAnimationFrame(() => {
      scrollClubChatToBottom("auto");
    });

    return () => window.cancelAnimationFrame(frame);
  }, [clubChatOpen, scrollClubChatToBottom]);

  /*
   * New Club Chat messages:
   * auto-follow only while the reader is already near the bottom.
   * Someone reading older messages must not be pulled downward.
   */
  useEffect(() => {
    if (!clubChatOpen) return;
    if (!clubChatInitialScrollDoneRef.current) return;
    if (!clubChatShouldFollowBottomRef.current) return;

    const frame = window.requestAnimationFrame(() => {
      scrollClubChatToBottom("smooth");
    });

    return () => window.cancelAnimationFrame(frame);
  }, [
    clubChatOpen,
    clubChatMessages.length,
    scrollClubChatToBottom,
  ]);

  const buildChatHighlightMatchId = () => {
    const today = new Date().toISOString().slice(0, 10);
    const type = String(matchType || "").toLowerCase().includes("league") ? "league" : "friendly";
    const format = String(gameFormat || "5_V_5").toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const baseMatchId =
      type === "league"
        ? `league_${String(activeSeasonId || "season").trim() || "season"}_${today}_m${Number(currentMatchNo || 1)}`
        : `friendly_${format}_${today}`;

    const clubId = String(activeClubId || "").trim().toLowerCase();

    if (!clubId || clubId === "turf-kings") return baseMatchId;
    return `${clubId}__${baseMatchId}`;
  };

  const getMentionDisplayName = (member = {}) => {
    const shortName = String(member.shortName || "").trim();
    if (shortName) return shortName;

    const rawName = String(
      member.fullName ||
      member.displayName ||
      member.name ||
      ""
    ).trim();

    return rawName.split(/\s+/)[0] || "";
  };

  if (typeof window !== "undefined") {
    console.log("[ClubChat mention debug]", {
      membersCount: Array.isArray(members) ? members.length : 0,
      sampleMember: Array.isArray(members) ? members[0] : null,
      mentionQuery,
      mentionPickerOpen,
    });
  }

  const mentionCandidates = (Array.isArray(members) ? members : [])
    .map((member) => {
      const raw =
        typeof member === "string"
          ? { fullName: member, name: member }
          : member || {};

      const fullName = String(
        raw.fullName ||
        raw.displayName ||
        raw.playerName ||
        raw.name ||
        [raw.firstName, raw.surname || raw.lastName].filter(Boolean).join(" ") ||
        raw.shortName ||
        ""
      ).trim();

      const name = getMentionDisplayName(raw) || fullName.split(/\s+/)[0] || "";
      const parts = fullName.split(/\s+/).filter(Boolean);
      const surnameInitial = parts.length > 1 ? parts[parts.length - 1][0] : "";
      const id = raw.id || raw.memberId || raw.playerId || raw.uid || raw.email || fullName || name;

      return {
        id,
        name,
        fullName,
        label: name && surnameInitial ? `${name} ${surnameInitial}` : name,
      };
    })
    .filter((member) => member.name);

  const duplicateMentionNames = mentionCandidates.reduce((acc, member) => {
    acc[member.name] = (acc[member.name] || 0) + 1;
    return acc;
  }, {});

  const normalizedMentionQuery = mentionQuery.toLowerCase();

  const mentionOptions = mentionCandidates
    .map((member) => ({
      ...member,
      label: duplicateMentionNames[member.name] > 1 ? member.label : member.name,
    }))
    .filter((member) => {
      if (!mentionPickerOpen && !mentionQuery) return false;
      if (!normalizedMentionQuery) return true;

      return (
        member.name.toLowerCase().startsWith(normalizedMentionQuery) ||
        member.label.toLowerCase().startsWith(normalizedMentionQuery) ||
        member.fullName.toLowerCase().startsWith(normalizedMentionQuery)
      );
    })
    .sort((a, b) => {
      if (!normalizedMentionQuery) return a.label.localeCompare(b.label);

      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();

      if (aName.startsWith(normalizedMentionQuery) && !bName.startsWith(normalizedMentionQuery)) return -1;
      if (!aName.startsWith(normalizedMentionQuery) && bName.startsWith(normalizedMentionQuery)) return 1;

      return a.label.localeCompare(b.label);
    })
    .slice(0, 6);

  const handleClubChatDraftChange = (value) => {
    const nextValue = String(value || "");
    setClubChatDraft(nextValue);

    const atIndex = nextValue.lastIndexOf("@");
    const afterAt = atIndex >= 0 ? nextValue.slice(atIndex + 1) : "";

    const isActiveMention =
      atIndex >= 0 &&
      !/\s/.test(afterAt) &&
      afterAt.length <= 30;

    setMentionQuery(isActiveMention ? afterAt.trim() : "");
    setMentionPickerOpen(isActiveMention);
  };

  const insertMention = (member) => {
    const mention = typeof member === "string" ? { name: member, label: member, id: member } : member;
    const safeName = String(mention?.name || "").trim();
    if (!safeName) return;

    setClubChatDraft((current) => {
      const base = String(current || "");
      if (/@([A-Za-zÀ-ÿ'-]{0,30})$/.test(base)) {
        return base.replace(/@([A-Za-zÀ-ÿ'-]{0,30})$/, `@${safeName} `);
      }
      return `${base}${base.endsWith(" ") || !base ? "" : " "}@${safeName} `;
    });

    setSelectedMentions((current) => {
      const next = current.filter((item) => String(item.id) !== String(mention.id));
      return [
        ...next,
        {
          id: mention.id || safeName,
          name: safeName,
          label: mention.label || safeName,
          fullName: mention.fullName || "",
        },
      ];
    });

    setMentionQuery("");
    setMentionPickerOpen(false);
  };

  const renderMessageTextWithMentions = (text = "") => {
    const parts = String(text || "").split(/(@[A-Za-zÀ-ÿ'-]+)/g);

    return parts.map((part, index) => {
      if (!part.startsWith("@")) return part;

      return (
        <span key={`mention-${index}`} className="fanm-chat-mention-token">
          {part}
        </span>
      );
    });
  };

  const getHighlightTitleForChat = (highlight = {}) => {
    return (
      highlight.title ||
      highlight.clipTitle ||
      highlight.tag ||
      highlight.type ||
      highlight.playerName ||
      "Club highlight"
    );
  };

  const loadChatHighlights = async () => {
    const matchId = buildChatHighlightMatchId();
    if (!matchId) return;

    try {
      const [raw, archived] = await Promise.all([
        VideoHighlightsRepository.loadRawHighlightsFromFirebase(matchId),
        typeof VideoHighlightsRepository.loadArchivedHighlightsFromFirebase === "function"
          ? VideoHighlightsRepository.loadArchivedHighlightsFromFirebase(matchId)
          : Promise.resolve([]),
      ]);

      const merged = [...(archived || []), ...(raw || [])]
        .filter(Boolean)
        .slice(0, 12)
        .map((highlight, index) => ({
          id: highlight.id || highlight.clipId || highlight.highlightId || `highlight-${index}`,
          title: getHighlightTitleForChat(highlight),
          playerName: highlight.playerName || highlight.goalScorer || highlight.scorer || "",
          matchDayId: highlight.matchDayId || highlight.matchdayId || highlight.archiveMatchDayId || matchId,
          mediaUrl: highlight.mediaUrl || highlight.videoUrl || highlight.downloadUrl || highlight.fileUrl || "",
          type: highlight.type || highlight.tag || "highlight",
        }));

      setAvailableHighlights(merged);
    } catch (err) {
      console.error("[ClubChatWidget] Failed loading highlights for chat attach:", err);
      setAvailableHighlights([]);
    }
  };


  useEffect(() => {
    if (!isLauncherOnly || clubChatOpen) return;

    const resetIdle = () => {
      setLauncherIsIdle(false);
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = window.setTimeout(() => {
        setLauncherIsIdle(true);
      }, 10000);
    };

    resetIdle();

    const events = ["mousemove", "touchstart", "keydown", "scroll", "click"];
    events.forEach((eventName) => window.addEventListener(eventName, resetIdle, { passive: true }));

    return () => {
      window.clearTimeout(idleTimerRef.current);
      events.forEach((eventName) => window.removeEventListener(eventName, resetIdle));
    };
  }, [isLauncherOnly, clubChatOpen]);

  const clampLauncherBottom = (value) => {
    const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 720;
    const minBottom = 72;
    const maxBottom = Math.max(120, viewportHeight - 120);
    return Math.min(Math.max(Number(value) || 88, minBottom), maxBottom);
  };

  const startLauncherDrag = (event) => {
    if (!isLauncherOnly || clubChatOpen) return;

    const point = event.touches?.[0] || event;
    dragStartRef.current = { y: point.clientY, bottom: launcherBottom };
    setLauncherIsDragging(true);
    setLauncherIsIdle(false);
  };

  useEffect(() => {
    if (!launcherIsDragging) return;

    const move = (event) => {
      const point = event.touches?.[0] || event;
      const deltaY = dragStartRef.current.y - point.clientY;
      setLauncherBottom(clampLauncherBottom(dragStartRef.current.bottom + deltaY));
    };

    const stop = () => {
      setLauncherIsDragging(false);
      const safeBottom = clampLauncherBottom(launcherBottom);
      setLauncherBottom(safeBottom);
      try {
        window.localStorage.setItem("fanm_chat_launcher_bottom", String(safeBottom));
      } catch {
        // localStorage is optional
      }
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", stop);

    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", stop);
    };
  }, [launcherIsDragging, launcherBottom]);


  useEffect(() => {
    if (!activeClubId) {
      setChallengerChatFixture(null);
      return;
    }

    const q = query(
      collection(db, "clubs", activeClubId, "fixtures"),
      orderBy("createdAtMs", "desc"),
      limit(8)
    );

    const unsub = onSnapshot(q, (snap) => {
      const fixtures = snap.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() || {}),
        }))
        .filter((fixture) => fixture?.source === "club_challenge")
        .filter((fixture) => isChallengerChatActive(fixture))
        .filter((fixture) =>
          [fixture.homeClubId, fixture.awayClubId]
            .map((value) => String(value || ""))
            .includes(String(activeClubId || ""))
        )
        .sort((a, b) => {
          const aTime = new Date(
            `${a.proposedDate || "2999-12-31"}T${a.proposedKickoff || "23:59"}:00`
          ).getTime();
          const bTime = new Date(
            `${b.proposedDate || "2999-12-31"}T${b.proposedKickoff || "23:59"}:00`
          ).getTime();
          return aTime - bTime;
        });

      setChallengerChatFixture(fixtures[0] || null);
    });

    return () => unsub();
  }, [activeClubId]);

  useEffect(() => {
    if (!challengerChatFixture?.fixtureId) {
      setChallengerChatMessages([]);
      return;
    }

    try {
      setChallengerChatLastSeenMs(
        Number(
          window.localStorage.getItem(
            `fanm_challenger_chat_seen_${challengerChatFixture.fixtureId}`
          ) || 0
        )
      );
    } catch {
      setChallengerChatLastSeenMs(0);
    }

    const q = query(
      collection(db, "clubChallengeFixtures", challengerChatFixture.fixtureId, "messages"),
      orderBy("createdAtMs", "asc"),
      limit(30)
    );

    const unsub = onSnapshot(q, (snap) => {
      setChallengerChatMessages(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() || {}),
        }))
      );
    });

    return () => unsub();
  }, [challengerChatFixture?.fixtureId]);

  useEffect(() => {
    if (!activeClubId) {
      setClubChatMessages([]);
      return;
    }

    const q = query(
      collection(db, "clubs", activeClubId, "chatMessages"),
      orderBy("createdAtMs", "asc"),
      limit(30)
    );

    const unsub = onSnapshot(q, (snap) => {
      setClubChatMessages(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() || {}),
        }))
      );
    });

    return () => unsub();
  }, [activeClubId]);

  useEffect(() => {
    clubChatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [clubChatMessages.length]);

  useEffect(() => {
    if (activeChatRoom !== "challenger") return;
    challengerChatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [challengerChatMessages.length, activeChatRoom]);

  const challengerChatOpponentName =
    challengerChatFixture &&
    String(challengerChatFixture.homeClubId || "") === String(activeClubId || "")
      ? challengerChatFixture.awayClubName || "Opponent Club"
      : challengerChatFixture?.homeClubName || "Opponent Club";

  const canSendChallengerChat =
    Boolean(currentUser) &&
    Boolean(challengerChatFixture?.fixtureId) &&
    (Boolean(selectedMember?.id) || Boolean(isAdminViewer));

  const canSendClubChat =
    Boolean(currentUser) &&
    Boolean(activeClubId) &&
    (Boolean(selectedMember?.id) || Boolean(isAdminViewer));

  const getCurrentChatActorName = () =>
    selectedMember?.fullName ||
    selectedMember?.shortName ||
    currentUser?.displayName ||
    currentUser?.email?.split("@")[0] ||
    identity?.fullName ||
    identity?.shortName ||
    "Club admin";


  const getChatDateLabel = (createdAtMs) => {
    const ms = Number(createdAtMs || 0);
    if (!ms) return "";
    const date = new Date(ms);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const sameDay = (a, b) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();

    if (sameDay(date, today)) return "Today";
    if (sameDay(date, yesterday)) return "Yesterday";

    return date.toLocaleDateString([], {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const getChatTimeLabel = (createdAtMs) => {
    const ms = Number(createdAtMs || 0);
    if (!ms) return "";
    return new Date(ms).toLocaleString([], {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleDeleteClubChatMessage = async (message) => {
    if (!message?.id || !activeClubId) return;

    const isOwnMessage =
      currentUser?.uid &&
      message.senderUid &&
      String(message.senderUid) === String(currentUser.uid);

    const canAdminDelete = Boolean(isAdminViewer) && !isOwnMessage;

    if (!isOwnMessage && !canAdminDelete) return;

    try {
      await deleteDoc(doc(db, "clubs", activeClubId, "chatMessages", message.id));
    } catch (err) {
      console.error("[ClubChatWidget] Failed deleting chat message:", err);
      window.alert("Could not delete this message just now.");
    }
  };

  const addChallengerChatEmoji = (emoji) => {
    setChallengerChatDraft((current) => `${current || ""}${emoji}`);
    setChallengerChatEmojiOpen(false);
  };

  const addClubChatEmoji = (emoji) => {
    setClubChatDraft((current) => `${current || ""}${emoji}`);
    setClubChatEmojiOpen(false);
  };

  const handleSendChallengerChatMessage = async () => {
    const text = String(challengerChatDraft || "").trim();

    if (!text || !canSendChallengerChat || !challengerChatFixture?.fixtureId) return;

    const senderName =
      selectedMember?.fullName ||
      selectedMember?.shortName ||
      currentUser?.displayName ||
      currentUser?.email?.split("@")[0] ||
      "Club member";

    try {
      await addDoc(collection(db, "clubChallengeFixtures", challengerChatFixture.fixtureId, "messages"), {
        type: "challenger_chat",
        text: text || "Shared a club highlight",
        fromClubId: activeClubId,
        fromClubName: activeClubName,
        senderName,
        senderUid: currentUser?.uid || "",
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
      });

      setChallengerChatDraft("");
      setChallengerChatEmojiOpen(false);
    } catch (err) {
      console.error("[ClubChatWidget] Failed sending challenger chat message:", err);
      window.alert("Could not send this challenger chat message just now.");
    }
  };

  const handleSendClubChatMessage = async () => {
    const text = String(clubChatDraft || "").trim();
    if ((!text && !selectedHighlight) || !canSendClubChat) return;

    const senderName =
      selectedMember?.fullName ||
      selectedMember?.shortName ||
      currentUser?.displayName ||
      currentUser?.email?.split("@")[0] ||
      "Club member";

    const senderRole = isAdminViewer
      ? "admin"
      : selectedMember?.role || identity?.role || "player";

    try {
      await addDoc(collection(db, "clubs", activeClubId, "chatMessages"), {
        text: text || "Shared a club highlight",
        senderName,
        senderRole,
        senderEmail: currentUser?.email || selectedMember?.email || identity?.email || "",
        senderUid: currentUser?.uid || "",
        clubId: activeClubId,
        clubName: activeClubName,
        mentions: selectedMentions.filter((mention) =>
          String(text || "").includes(`@${mention.name}`)
        ),
        ...(replyTarget ? {
          replyToId: replyTarget.id || "",
          replyToSenderName: replyTarget.senderName || "Club member",
          replyToText: replyTarget.text || "Attachment",
        } : {}),
        ...(selectedHighlight ? {
          attachmentType: "highlight",
          highlightId: selectedHighlight.id,
          highlightTitle: selectedHighlight.title,
          highlightPlayerName: selectedHighlight.playerName || "",
          highlightMatchDayId: selectedHighlight.matchDayId || "",
          highlightMediaUrl: selectedHighlight.mediaUrl || "",
          highlightType: selectedHighlight.type || "highlight",
          highlightScorerName: selectedHighlight.scorerName || selectedHighlight.playerName || "",
          highlightTeamName: selectedHighlight.teamName || "",
          highlightLabel: selectedHighlight.label || selectedHighlight.title || "Goal clip",
        } : {}),
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
      });

      setClubChatDraft("");
      setSelectedMentions([]);
      setSelectedHighlight(null);
      setReplyTarget(null);
      setHighlightPickerOpen(false);
      setClubChatEmojiOpen(false);
    } catch (err) {
      console.error("[ClubChatWidget] Failed sending club chat message:", err);
      window.alert("Could not send this club chat message just now.");
    }
  };

  const clubChatLatestMessageMs = clubChatMessages.reduce(
    (latest, message) => Math.max(latest, Number(message.createdAtMs || 0)),
    0
  );

  const clubChatUnreadCount = clubChatMessages.filter(
    (message) =>
      Number(message.createdAtMs || 0) > Number(clubChatLastSeenMs || 0) &&
      String(message.senderUid || "") !== String(currentUser?.uid || "")
  ).length;

  const challengerChatLatestMessageMs = challengerChatMessages.reduce(
    (latest, message) => Math.max(latest, Number(message.createdAtMs || 0)),
    0
  );

  const challengerChatUnreadCount = challengerChatMessages.filter(
    (message) =>
      Number(message.createdAtMs || 0) > Number(challengerChatLastSeenMs || 0) &&
      String(message.senderUid || "") !== String(currentUser?.uid || "")
  ).length;

  const totalChatUnreadCount = clubChatUnreadCount + challengerChatUnreadCount;
  const showChatToast = ({ room, senderName, text }) => {
    if (!isLauncherOnly || clubChatOpen) return;

    window.clearTimeout(toastTimerRef.current);

    setChatToast({
      room,
      senderName: senderName || "Club member",
      text: text || "New chat message",
    });

    try {
      navigator.vibrate?.(120);
    } catch {
      // Vibration is optional.
    }

    toastTimerRef.current = window.setTimeout(() => {
      setChatToast(null);
    }, 4200);
  };

  useEffect(() => {
    if (!clubChatMessages.length) return;

    const latestMessage = clubChatMessages[clubChatMessages.length - 1];
    const latestMs = Number(latestMessage?.createdAtMs || 0);

    if (!latestMs) return;

    if (!latestNotifiedRef.current.club) {
      latestNotifiedRef.current.club = latestMs;
      return;
    }

    if (
      latestMs > latestNotifiedRef.current.club &&
      String(latestMessage?.senderUid || "") !== String(currentUser?.uid || "")
    ) {
      showChatToast({
        room: "club",
        senderName: latestMessage?.senderName,
        text: latestMessage?.text,
      });
    }

    latestNotifiedRef.current.club = latestMs;
  }, [clubChatMessages.length, currentUser?.uid, clubChatOpen, isLauncherOnly]);

  useEffect(() => {
    if (!challengerChatMessages.length) return;

    const latestMessage = challengerChatMessages[challengerChatMessages.length - 1];
    const latestMs = Number(latestMessage?.createdAtMs || 0);

    if (!latestMs) return;

    if (!latestNotifiedRef.current.challenger) {
      latestNotifiedRef.current.challenger = latestMs;
      return;
    }

    if (
      latestMs > latestNotifiedRef.current.challenger &&
      String(latestMessage?.senderUid || "") !== String(currentUser?.uid || "")
    ) {
      showChatToast({
        room: "challenger",
        senderName: latestMessage?.senderName || latestMessage?.fromClubName,
        text: latestMessage?.text || latestMessage?.message,
      });
    }

    latestNotifiedRef.current.challenger = latestMs;
  }, [challengerChatMessages.length, currentUser?.uid, clubChatOpen, isLauncherOnly]);



  useEffect(() => {
    if (activeChatRoom !== "challenger" || !challengerChatFixture?.fixtureId || !challengerChatLatestMessageMs) return;

    try {
      window.localStorage.setItem(
        `fanm_challenger_chat_seen_${challengerChatFixture.fixtureId}`,
        String(challengerChatLatestMessageMs)
      );
    } catch {
      // localStorage is optional
    }

    setChallengerChatLastSeenMs(challengerChatLatestMessageMs);
  }, [activeChatRoom, challengerChatFixture?.fixtureId, challengerChatLatestMessageMs]);

  useEffect(() => {
    if (!clubChatOpen || !activeClubId || !clubChatLatestMessageMs) return;

    try {
      window.localStorage.setItem(
        `fanm_club_chat_seen_${activeClubId}`,
        String(clubChatLatestMessageMs)
      );
    } catch {
      // localStorage is optional
    }

    setClubChatLastSeenMs(clubChatLatestMessageMs);
  }, [clubChatOpen, activeClubId, clubChatLatestMessageMs]);

  useEffect(() => {
    if (!isLauncherOnly || !clubChatOpen) return;

    try {
      window.history.pushState(
        { ...(window.history.state || {}), fanmClubChatOpen: true },
        "",
        window.location.href
      );
    } catch {
      // Browser history is optional.
    }

    const handlePhoneBack = () => {
      setClubChatOpen(false);
    };

    window.addEventListener("popstate", handlePhoneBack);

    return () => {
      window.removeEventListener("popstate", handlePhoneBack);
    };
  }, [isLauncherOnly, clubChatOpen]);

  useEffect(() => {
    if (clubChatOpen) {
      setClubChatTeaseOpen(false);
      return;
    }

    let idleTimer;
    let shrinkTimer;

    const startIdleTimer = () => {
      setClubChatTeaseOpen(false);
      window.clearTimeout(idleTimer);
      window.clearTimeout(shrinkTimer);

      idleTimer = window.setTimeout(() => {
        setClubChatTeaseOpen(true);

        shrinkTimer = window.setTimeout(() => {
          setClubChatTeaseOpen(false);
        }, 2000);
      }, 7000);
    };

    startIdleTimer();

    const activityEvents = ["click", "keydown", "mousemove", "touchstart", "scroll"];
    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, startIdleTimer, { passive: true });
    });

    return () => {
      window.clearTimeout(idleTimer);
      window.clearTimeout(shrinkTimer);
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, startIdleTimer);
      });
    };
  }, [clubChatOpen]);

  return (
    <>
      {chatToast && !clubChatOpen && (
        <button
          type="button"
          className="fanm-club-chat-toast"
          onClick={() => {
            setActiveChatRoom(chatToast.room || "club");
            setClubChatOpen(true);
            setChatToast(null);
          }}
        >
          <span>💬</span>
          <strong>{chatToast.senderName}</strong>
          <small>{chatToast.text}</small>
        </button>
      )}

      {isLauncherOnly && clubChatOpen && (
        <button
          type="button"
          className="fanm-club-chat-modal-backdrop"
          aria-label="Close club chat"
          onClick={() => setClubChatOpen(false)}
        />
      )}

      <section
      className={`card fanm-club-chat-card ${clubChatOpen ? "is-open" : "is-collapsed"} ${isLauncherOnly && clubChatOpen ? "is-modal-open" : ""} ${isLauncherOnly && !clubChatOpen && launcherIsIdle ? "is-idle" : ""} ${isLauncherOnly && launcherIsDragging ? "is-dragging" : ""} ${
        !clubChatOpen && clubChatTeaseOpen ? "is-teasing" : ""
      }`}
      style={{
        ...premiumPanelStyle,
        ...(isLauncherOnly && !clubChatOpen ? { bottom: `${launcherBottom}px` } : {}),
      }}
    >
      <button
        type="button"
        className="fanm-club-chat-launcher"
        onMouseDown={startLauncherDrag}
        onTouchStart={startLauncherDrag}
        onClick={() => {
          if (isLauncherOnly) {
            setClubChatOpen(true);
            return;
          }
          setClubChatOpen((current) => !current);
        }}
      >
        <span className="fanm-club-chat-launcher-icon">💬</span>

        <span className="fanm-club-chat-launcher-text">
          <strong>{activeClubName} Chat</strong>
          <small>
            {clubChatMessages.length
              ? `${clubChatMessages.length} club message${clubChatMessages.length === 1 ? "" : "s"}`
              : "Private club room"}
          </small>
        </span>

        <span className="fanm-club-chat-header-actions">
          {totalChatUnreadCount > 0 ? (
            <span className="fanm-club-chat-unread">{totalChatUnreadCount}</span>
          ) : (
            <span className="fanm-club-chat-live-pill">Live</span>
          )}

          {isLauncherOnly && clubChatOpen ? (
            <span
              className="fanm-club-chat-minimize-icon"
              onClick={(event) => {
                event.stopPropagation();
                setClubChatOpen(false);
              }}
              title="Minimize chat"
            >
              −
            </span>
          ) : null}
        </span>
      </button>

      {clubChatOpen && (
        <>
          <div className="fanm-club-chat-head">
            <div>
              <h2>
                {activeChatRoom === "challenger"
                  ? "Challenger Chat"
                  : `${activeClubName} Chat`}
              </h2>
              <p className="muted small">
                {activeChatRoom === "challenger"
                  ? `Match chat with ${challengerChatOpponentName}. This room is available only while the fixture is active.`
                  : "Private messages for approved club members, captains and admins."}
              </p>
            </div>
          </div>

          {challengerChatFixture?.fixtureId ? (
            <div className="fanm-chat-room-switcher fanm-chat-room-switcher--compact">
              {activeChatRoom === "club" ? (
                <button
                  type="button"
                  className="fanm-chat-room-tab fanm-chat-room-tab--challenger"
                  onClick={() => setActiveChatRoom("challenger")}
                >
                  <span>💬</span>
                  <div>
                    <strong>Challenger Chat</strong>
                    <small>
                      vs {challengerChatOpponentName} · {challengerChatFixture.proposedDate || "Date TBC"}{" "}
                      {challengerChatFixture.proposedKickoff || ""}
                    </small>
                  </div>
                  {challengerChatUnreadCount > 0 ? <em>{challengerChatUnreadCount}</em> : null}
                </button>
              ) : (
                <button
                  type="button"
                  className="fanm-chat-room-tab"
                  onClick={() => setActiveChatRoom("club")}
                >
                  <span>💬</span>
                  <div>
                    <strong>Club Chat</strong>
                    <small>Back to private club room</small>
                  </div>
                  {clubChatUnreadCount > 0 ? <em>{clubChatUnreadCount}</em> : null}
                </button>
              )}
            </div>
          ) : null}

          {activeChatRoom === "club" ? (
            <div className="fanm-club-chat-messages"
        ref={clubChatMessagesRef}
        onScroll={handleClubChatMessagesScroll}
      >
              {clubChatMessages.length ? (
                clubChatMessages.map((message, index) => {
                  const previousMessage = clubChatMessages[index - 1];
                  const currentDateLabel = getChatDateLabel(message.createdAtMs);
                  const previousDateLabel = getChatDateLabel(previousMessage?.createdAtMs);
                  const showDateChip = currentDateLabel && currentDateLabel !== previousDateLabel;

                  const currentViewerKeys = [
                    currentUser?.uid,
                    currentUser?.email,
                    selectedMember?.email,
                    identity?.email,
                    selectedMember?.fullName,
                    selectedMember?.shortName,
                    identity?.fullName,
                    identity?.shortName,
                    currentUser?.displayName,
                  ]
                    .map((value) => String(value || "").trim().toLowerCase())
                    .filter(Boolean);

                  const messageSenderKeys = [
                    message.senderUid,
                    message.senderEmail,
                    message.senderName,
                  ]
                    .map((value) => String(value || "").trim().toLowerCase())
                    .filter(Boolean);

                  const mine = messageSenderKeys.some((key) => currentViewerKeys.includes(key));

                  const isAdminMessage =
                    String(message.senderRole || "").toLowerCase().includes("admin") ||
                    String(message.senderRole || "").toLowerCase().includes("captain");

                  const previousSenderKeys = [
                    previousMessage?.senderUid,
                    previousMessage?.senderEmail,
                    previousMessage?.senderName,
                  ]
                    .map((value) => String(value || "").trim().toLowerCase())
                    .filter(Boolean);

                  const sameSenderAsPrevious =
                    previousSenderKeys.length > 0 &&
                    messageSenderKeys.some((key) => previousSenderKeys.includes(key));

                  const minutesSincePrevious =
                    previousMessage?.createdAtMs && message.createdAtMs
                      ? Math.abs(Number(message.createdAtMs) - Number(previousMessage.createdAtMs)) / 60000
                      : 999;

                  const groupedWithPrevious =
                    !showDateChip &&
                    sameSenderAsPrevious &&
                    minutesSincePrevious <= 5 &&
                    !message.replyToId &&
                    !previousMessage?.replyToId &&
                    !message.attachmentType &&
                    !previousMessage?.attachmentType;

                  return (
                    <React.Fragment key={message.id}>
                      {showDateChip ? (
                        <div className="fanm-chat-date-chip">{currentDateLabel}</div>
                      ) : null}

                      <div
                        className={`fanm-club-chat-message ${mine ? "is-mine" : ""} ${isAdminMessage ? "is-admin" : ""} ${groupedWithPrevious ? "is-grouped" : ""}`}
                      >
                      {!groupedWithPrevious ? (
                        <div className="fanm-club-chat-message-meta">
                          <strong>{message.senderName || "Club member"}</strong>
                          {isAdminMessage ? <span>Captain/Admin</span> : null}
                        </div>
                      ) : null}
                      {message.replyToId ? (
                        <div className="fanm-chat-reply-quote">
                          <strong>Replying to {message.replyToSenderName || "Club member"}</strong>
                          <small>{message.replyToText || "Message"}</small>
                        </div>
                      ) : null}

                      {message.attachmentType === "highlight" ? (
                        <button
                          type="button"
                          className="fanm-chat-highlight-card"
                          onClick={() => {
                            setPreviewHighlight({
                              messageId: message.id,
                              id: message.highlightId,
                              title: message.highlightLabel || message.highlightTitle || "Goal clip",
                              scorer: message.highlightScorerName || message.highlightPlayerName || "",
                              team: message.highlightTeamName || "",
                              mediaUrl: message.highlightMediaUrl || "",
                              type: message.highlightType || "highlight",
                            });
                          }}
                        >
                          {message.highlightMediaUrl ? (
                            <video
                              src={message.highlightMediaUrl}
                              muted
                              playsInline
                              preload="metadata"
                              className="fanm-chat-highlight-card-video"
                            />
                          ) : (
                            <span className="fanm-chat-highlight-card-icon">🎥</span>
                          )}
                          <div>
                            <strong>{message.highlightLabel || message.highlightTitle || "Goal clip"}</strong>
                            <small>
                              {[
                                message.highlightType ? String(message.highlightType).replace(/_/g, " ") : "",
                                message.highlightScorerName || message.highlightPlayerName ? `Scorer: ${message.highlightScorerName || message.highlightPlayerName}` : "",
                                message.highlightTeamName || "",
                              ].filter(Boolean).join(" • ") || "Tap to open video"}
                            </small>
                          </div>
                        </button>
                      ) : null}
                      <p>{renderMessageTextWithMentions(message.text)}</p>

                      <div className="fanm-club-chat-message-footer fanm-club-chat-message-footer--compact">
                        <div className="fanm-chat-reaction-row">
                        {getVisibleReactions(message)
                          .map((emoji) => {
                            const count = getReactionUsers(message, emoji).length;
                            return (
                              <button
                                type="button"
                                key={`${message.id}-${emoji}`}
                                className={userReacted(message, emoji) ? "is-selected" : ""}
                                onClick={() => toggleClubChatReaction(message, emoji)}
                                title={`React ${emoji}`}
                              >
                                <span>{emoji}</span>
                                <em>{count}</em>
                              </button>
                            );
                          })}


                        </div>

                        <small className="fanm-club-chat-time">
                          {getChatTimeLabel(message.createdAtMs)}
                        </small>
                      </div>

                      {activeReactionPickerMessageId === message.id ? (
                        <div className="fanm-chat-reaction-picker">
                          {chatReactionOptions.map((emoji) => (
                            <button
                              type="button"
                              key={`pick-${message.id}-${emoji}`}
                              className={userReacted(message, emoji) ? "is-selected" : ""}
                              onClick={() => toggleClubChatReaction(message, emoji)}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      ) : null}

                      <div className="fanm-chat-message-actions">
                        <button
                          type="button"
                          className="fanm-chat-reply-btn"
                          onClick={() => setReplyTarget({
                            id: message.id,
                            senderName: message.senderName || "Club member",
                            text: message.text || message.highlightTitle || "Attachment",
                          })}
                        >
                          Reply
                        </button>

                        {!getMyReaction(message) ? (
                          <button
                            type="button"
                            className="fanm-chat-react-btn"
                            onClick={() =>
                              setActiveReactionPickerMessageId((current) =>
                                current === message.id ? null : message.id
                              )
                            }
                            title="Add reaction"
                          >
                            React 😊
                          </button>
                        ) : null}

                        {(mine || isAdminViewer) && !message.deleted ? (
                          <button
                            type="button"
                            className="fanm-chat-delete-btn"
                            onClick={() => handleDeleteClubChatMessage(message)}
                            title={mine ? "Delete your message" : "Delete as admin"}
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                      </div>
                    </React.Fragment>
                  );
                })
              ) : (
                <div className="fanm-club-chat-empty">
                  No messages yet. Start the club conversation.
                </div>
              )}

              <div ref={clubChatEndRef} />
            </div>
          ) : (
            <div className="fanm-challenger-chat-messages fanm-chat-room-content">
              {challengerChatMessages.length ? (
                challengerChatMessages.map((message) => {
                  const mine =
                    currentUser?.uid &&
                    message.senderUid &&
                    String(currentUser.uid) === String(message.senderUid);

                  return (
                    <div
                      key={message.id}
                      className={`fanm-challenger-chat-message ${mine ? "is-mine" : ""}`}
                    >
                      <div className="fanm-challenger-chat-message-meta">
                        <strong>{message.fromClubName || "Club"}</strong>
                        {message.senderName ? <span>{message.senderName}</span> : null}
                      </div>
                      <p>{message.text || message.message || ""}</p>
                    </div>
                  );
                })
              ) : (
                <div className="fanm-challenger-chat-empty">
                  This temporary room is open for the scheduled fixture only.
                </div>
              )}

              <div ref={challengerChatEndRef} />
            </div>
          )}

          {activeChatRoom === "club" && clubChatEmojiOpen ? (
            <div className="fanm-club-chat-emoji-tray">
              {["😀", "😂", "🤣", "😎", "😭", "😡", "❤️", "🔥", "⚽", "🥅", "🏆", "💪", "👏", "🙌", "👌", "👀"].map((emoji) => (
                <button
                  type="button"
                  key={`club-chat-emoji-${emoji}`}
                  onClick={() => addClubChatEmoji(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          ) : null}

          {activeChatRoom === "club" ? (
            <div className="fanm-club-chat-compose">
              <div className="fanm-club-chat-input-wrap">
                <textarea
                  className="text-input"
                  rows={1}
                  value={clubChatDraft}
                  onChange={(event) => handleClubChatDraftChange(event.target.value)}
                  placeholder={
                    canSendClubChat
                      ? "Message"
                      : "Select your name and sign in to chat."
                  }
                  disabled={!canSendClubChat}
                />

                <button
                  type="button"
                  className="fanm-club-chat-emoji-btn"
                  disabled={!canSendClubChat}
                  onClick={() => setClubChatEmojiOpen((current) => !current)}
                  title="Add emoji"
                >
                  😀
                </button>
                <button
                  type="button"
                  className="fanm-club-chat-attach-btn"
                  disabled={!canSendClubChat}
                  onClick={() => {
                    setMentionPickerOpen((current) => !current);
                    setMentionQuery("");
                  }}
                  title="Tag player"
                >
                  @
                </button>

                <button
                  type="button"
                  className="fanm-club-chat-attach-btn"
                  disabled={!canSendClubChat}
                  onClick={() => {
                    onOpenHighlight?.({ mode: "attach" });
                    setClubChatOpen(false);
                  }}
                  title="Attach highlight"
                >
                  📎
                </button>
              </div>

              {(mentionPickerOpen || mentionQuery !== "") ? (
                <div className="fanm-chat-mention-picker">
                  {(mentionOptions.length ? mentionOptions : (!mentionQuery ? mentionCandidates.slice(0, 6) : [])).map((member) => (
                    <button
                      type="button"
                      key={member.id || member.name}
                      onClick={() => insertMention(member)}
                    >
                      @{member.label}
                    </button>
                  ))}
                  {!mentionOptions.length && !mentionCandidates.length ? (
                    <span className="fanm-chat-mention-empty">No club players found</span>
                  ) : null}
                </div>
              ) : null}

              {replyTarget ? (
                <div className="fanm-chat-replying-box">
                  <div>
                    <strong>Replying to {replyTarget.senderName}</strong>
                    <small>{replyTarget.text}</small>
                  </div>
                  <button type="button" onClick={() => setReplyTarget(null)}>Cancel</button>
                </div>
              ) : null}

              {selectedHighlight ? (
                <div className="fanm-chat-selected-highlight">
                  {selectedHighlight.mediaUrl ? (
                    <video
                      className="fanm-chat-selected-highlight-video"
                      src={selectedHighlight.mediaUrl}
                      controls
                      preload="metadata"
                      playsInline
                    />
                  ) : (
                    <span>⚽</span>
                  )}
                  <div>
                    <strong>{selectedHighlight.label || selectedHighlight.title || "Goal clip"}</strong>
                    <small>
                      {[
                        selectedHighlight.type ? String(selectedHighlight.type).replace(/_/g, " ") : "",
                        selectedHighlight.scorerName || selectedHighlight.playerName ? `Scorer: ${selectedHighlight.scorerName || selectedHighlight.playerName}` : "",
                        selectedHighlight.teamName || "",
                      ].filter(Boolean).join(" • ") || "Attached video highlight"}
                    </small>
                  </div>
                  <button type="button" onClick={() => setSelectedHighlight(null)}>Remove</button>
                </div>
              ) : null}

              {highlightPickerOpen && (
                <div className="fanm-chat-highlight-picker">
                  <strong>Attach highlight</strong>
                  {availableHighlights.length ? (
                    availableHighlights.map((highlight) => (
                      <button
                        type="button"
                        key={highlight.id}
                        onClick={() => {
                          setSelectedHighlight(highlight);
                          setHighlightPickerOpen(false);
                        }}
                      >
                        <span>⚽</span>
                        <div>
                          <strong>{highlight.title}</strong>
                          <small>{highlight.playerName || "Club highlight"}</small>
                        </div>
                      </button>
                    ))
                  ) : (
                    <p>No highlights found for the current match yet.</p>
                  )}
                </div>
              )}

              <button
                type="button"
                className="primary-btn fanm-premium-send-btn"
                disabled={!canSendClubChat || (!String(clubChatDraft || "").trim() && !selectedHighlight)}
                onClick={handleSendClubChatMessage}
              >
                ➤
              </button>
            </div>
          ) : (
            <div className="fanm-challenger-chat-compose">
              <div className="fanm-challenger-chat-input-wrap">
                <textarea
                  className="text-input"
                  rows={3}
                  value={challengerChatDraft}
                  onChange={(event) => setChallengerChatDraft(event.target.value)}
                  placeholder={
                    canSendChallengerChat
                      ? "Message the other club..."
                      : "Select your name and sign in to chat."
                  }
                  disabled={!canSendChallengerChat}
                />

                <button
                  type="button"
                  className="fanm-challenger-chat-emoji-btn"
                  disabled={!canSendChallengerChat}
                  onClick={() => setChallengerChatEmojiOpen((current) => !current)}
                  title="Add emoji"
                >
                  😀
                </button>
              </div>

              {challengerChatEmojiOpen && (
                <div className="fanm-challenger-chat-emoji-tray">
                  {["😀", "😂", "🤣", "😎", "😭", "😡", "❤️", "🔥", "⚽", "🥅", "🏆", "💪", "👏", "🙌", "👌", "👀"].map((emoji) => (
                    <button
                      type="button"
                      key={`challenger-chat-emoji-${emoji}`}
                      onClick={() => addChallengerChatEmoji(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                className="primary-btn"
                disabled={!canSendChallengerChat || !String(challengerChatDraft || "").trim()}
                onClick={handleSendChallengerChatMessage}
              >
                Send
              </button>
            </div>
          )}
        </>
      )}
      </section>

      {previewHighlight ? (
        <div className="fanm-highlight-preview-overlay">
          <div className="fanm-highlight-preview-modal">
            <button
              type="button"
              className="fanm-highlight-preview-close"
              onClick={() => setPreviewHighlight(null)}
            >
              ✕
            </button>

            <h3>{previewHighlight.title || "Goal clip"}</h3>

            <div className="fanm-highlight-preview-meta">
              🎥 {String(previewHighlight.type || "highlight").replace(/_/g, " ")}
              {previewHighlight.scorer ? ` • Scorer: ${previewHighlight.scorer}` : ""}
              {previewHighlight.team ? ` • ${previewHighlight.team}` : ""}
            </div>

            {previewHighlight.mediaUrl ? (
              <video
                src={previewHighlight.mediaUrl}
                controls
                autoPlay
                playsInline
                preload="metadata"
                className="fanm-highlight-preview-video"
              />
            ) : (
              <p className="muted small">This clip has no playable video URL.</p>
            )}

            <div className="fanm-highlight-reactions">
              {(() => {
                const sourceMessage = clubChatMessages.find((msg) => msg.id === previewHighlight.messageId);
                if (!sourceMessage) return null;

                return (
                  <>
                    {getVisibleReactions(sourceMessage).map((emoji) => {
                      const count = getReactionUsers(sourceMessage, emoji).length;
                      return (
                        <button
                          type="button"
                          key={`preview-count-${emoji}`}
                          className={userReacted(sourceMessage, emoji) ? "is-selected" : ""}
                          onClick={() => toggleClubChatReaction(sourceMessage, emoji)}
                        >
                          <span>{emoji}</span>
                          <em>{count}</em>
                        </button>
                      );
                    })}

                    {!getMyReaction(sourceMessage) ? (
                      <button
                        type="button"
                        className="fanm-chat-add-reaction"
                        onClick={() =>
                          setActiveReactionPickerMessageId((current) =>
                            current === sourceMessage.id ? null : sourceMessage.id
                          )
                        }
                        title="Add reaction"
                      >
                        ☺
                      </button>
                    ) : null}

                    {activeReactionPickerMessageId === sourceMessage.id ? (
                      <div className="fanm-chat-reaction-picker fanm-chat-reaction-picker--preview">
                        {chatReactionOptions.map((emoji) => (
                          <button
                            type="button"
                            key={`preview-pick-${emoji}`}
                            className={userReacted(sourceMessage, emoji) ? "is-selected" : ""}
                            onClick={() => toggleClubChatReaction(sourceMessage, emoji)}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
