// src/components/ClubChat/ClubChatWidget.jsx
import React, { useEffect, useRef, useState } from "react";
import { db } from "../../firebaseConfig";
import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
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
  variant = "inline",
  onOpenFullChat,
}) {
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
  const [clubChatLastSeenMs, setClubChatLastSeenMs] = useState(0);
  const clubChatEndRef = useRef(null);

  const [challengerChatLastSeenMs, setChallengerChatLastSeenMs] = useState(0);

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
        text,
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
    if (!text || !canSendClubChat) return;

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
        text,
        senderName,
        senderRole,
        senderEmail: currentUser?.email || selectedMember?.email || identity?.email || "",
        senderUid: currentUser?.uid || "",
        clubId: activeClubId,
        clubName: activeClubName,
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
      });

      setClubChatDraft("");
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
      {isLauncherOnly && clubChatOpen && (
        <button
          type="button"
          className="fanm-club-chat-modal-backdrop"
          aria-label="Close club chat"
          onClick={() => setClubChatOpen(false)}
        />
      )}

      <section
      className={`card fanm-club-chat-card ${clubChatOpen ? "is-open" : "is-collapsed"} ${isLauncherOnly && clubChatOpen ? "is-modal-open" : ""} ${
        !clubChatOpen && clubChatTeaseOpen ? "is-teasing" : ""
      }`}
      style={premiumPanelStyle}
    >
      <button
        type="button"
        className="fanm-club-chat-launcher"
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
              <p className="fanm-club-chat-kicker">
                {activeChatRoom === "challenger" ? "Temporary fixture room" : "Club room"}
              </p>
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

          <div className="fanm-chat-room-switcher">
            <button
              type="button"
              className={`fanm-chat-room-tab ${activeChatRoom === "club" ? "is-active" : ""}`}
              onClick={() => setActiveChatRoom("club")}
            >
              <span>💬</span>
              <div>
                <strong>Club Chat</strong>
                <small>Private club room</small>
              </div>
              {clubChatUnreadCount > 0 ? <em>{clubChatUnreadCount}</em> : null}
            </button>

            {challengerChatFixture?.fixtureId && (
              <button
                type="button"
                className={`fanm-chat-room-tab fanm-chat-room-tab--challenger ${activeChatRoom === "challenger" ? "is-active" : ""}`}
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
            )}
          </div>

          {activeChatRoom === "club" ? (
            <div className="fanm-club-chat-messages">
              {clubChatMessages.length ? (
                clubChatMessages.map((message) => {
                  const mine =
                    currentUser?.uid &&
                    message.senderUid &&
                    String(currentUser.uid) === String(message.senderUid);

                  const isAdminMessage =
                    String(message.senderRole || "").toLowerCase().includes("admin") ||
                    String(message.senderRole || "").toLowerCase().includes("captain");

                  return (
                    <div
                      key={message.id}
                      className={`fanm-club-chat-message ${mine ? "is-mine" : ""} ${isAdminMessage ? "is-admin" : ""}`}
                    >
                      <div className="fanm-club-chat-message-meta">
                        <strong>{message.senderName || "Club member"}</strong>
                        {isAdminMessage ? <span>Captain/Admin</span> : null}
                      </div>
                      <p>{message.text}</p>
                    </div>
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

          {activeChatRoom === "club" ? (
            <div className="fanm-club-chat-compose">
              <div className="fanm-club-chat-input-wrap">
                <textarea
                  className="text-input"
                  rows={3}
                  value={clubChatDraft}
                  onChange={(event) => setClubChatDraft(event.target.value)}
                  placeholder={
                    canSendClubChat
                      ? "Message your club..."
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
              </div>

              {clubChatEmojiOpen && (
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
              )}

              <button
                type="button"
                className="primary-btn"
                disabled={!canSendClubChat || !String(clubChatDraft || "").trim()}
                onClick={handleSendClubChatMessage}
              >
                Send
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
    </>
  );
}
