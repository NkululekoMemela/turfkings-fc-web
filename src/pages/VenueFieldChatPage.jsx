import React, { useEffect, useRef, useState } from "react";
import {
  collection, deleteDoc, doc, getDoc, limit, onSnapshot,
  orderBy, query, serverTimestamp, setDoc, updateDoc,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import "./VenueFieldChatPage.css";
import FieldVideoRepository from "../storage/venueVideoHighlightsRepository.js";

const reactions = ["⚽", "🔥", "🧤", "👏", "😂", "❤️", "👍", "👎", "😩", "🤯"];
const path = (venueId, collectionName, id) =>
  doc(db, "leagueVenues", venueId, collectionName, id);

function timeLabel(value) {
  const date = value?.toDate?.();
  return date ? date.toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit",
  }) : "";
}


function fieldChatMessageDate(message) {
  const value = message?.createdAt;
  const date = typeof value?.toDate === "function"
    ? value.toDate()
    : new Date(message?.createdAtMs || 0);
  return Number.isFinite(date.getTime()) && date.getTime() > 0 ? date : null;
}

function fieldChatDateLabel(date) {
  if (!date) return "";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], {
    day: "numeric", month: "short", year: "numeric",
  });
}

export default function VenueFieldChatPage({
  venue, season, identity, currentUser, staff, isAdmin, onBack,
}) {
  const venueId = venue?.id || "";
  const uid = currentUser?.uid || "";
  const isClubMember = identity?.role === "club_member";
  const isOwner = Boolean(uid && venue?.ownerUid === uid);
  const activeStaff = staff?.status === "active";
  const [actor, setActor] = useState(null);
  const [accessError, setAccessError] = useState("");
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [fieldClipPickerOpen, setFieldClipPickerOpen] =
    useState(false);
  const [fieldClips, setFieldClips] = useState([]);
  const [fieldClipsLoading, setFieldClipsLoading] =
    useState(false);
  const [fieldClipsError, setFieldClipsError] =
    useState("");
  const [fieldSelectedClip, setFieldSelectedClip] =
    useState(null);

  async function openFieldClipPicker() {
    setFieldClipPickerOpen(true);
    setFieldClipsLoading(true);
    setFieldClipsError("");

    try {
      const results = await Promise.allSettled([
        typeof FieldVideoRepository
          .loadAllClubHighlightsForAudit === "function"
          ? FieldVideoRepository
              .loadAllClubHighlightsForAudit(venueId)
          : Promise.resolve([]),
        typeof FieldVideoRepository
          .loadClubArchivedHighlightsFromFirebase ===
            "function"
          ? FieldVideoRepository
              .loadClubArchivedHighlightsFromFirebase(
                venueId
              )
          : Promise.resolve([]),
      ]);

      const seen = new Set();

      const clips = results
        .flatMap((result) =>
          result.status === "fulfilled" &&
          Array.isArray(result.value)
            ? result.value
            : []
        )
        .map((clip) => ({
          venueId,
          clipId: String(
            clip.clipId ||
            clip.id ||
            clip.highlightId ||
            ""
          ),
          matchId: String(
            clip.matchId ||
            clip.fixtureId ||
            ""
          ),
          title: String(
            clip.title ||
            clip.playerName ||
            "Field highlight"
          ).slice(0, 160),
          mediaUrl: String(
            clip.videoUrl ||
            clip.downloadUrl ||
            clip.mediaUrl ||
            clip.fileUrl ||
            clip.uri ||
            ""
          ),
        }))
        .filter((clip) => {
          if (
            !clip.clipId ||
            !/^https:\/\//i.test(clip.mediaUrl)
          ) {
            return false;
          }

          const key =
            `${clip.matchId}:${clip.clipId}`;

          if (seen.has(key)) {
            return false;
          }

          seen.add(key);
          return true;
        });

      setFieldClips(clips);

      const failed = results.find(
        (result) => result.status === "rejected"
      );

      if (failed) {
        setFieldClipsError(
          failed.reason?.message ||
          "Some Field videos could not load."
        );
      }
    } catch (error) {
      setFieldClipsError(
        error?.message ||
        "Could not load Field videos."
      );
    } finally {
      setFieldClipsLoading(false);
    }
  }
  const fieldDraftRef = useRef(null);

  useEffect(() => {
    const input = fieldDraftRef.current;
    if (!input) return;
    input.style.setProperty("--field-unused-height", "auto");
    const maximum = Math.min(180, window.innerHeight * 0.28);
    input.style.setProperty("--field-unused-height", `${Math.max(50, Math.min(input.scrollHeight, maximum))}px`);
    input.style.overflowY = input.scrollHeight > maximum ? "auto" : "hidden";
  }, [draft]);
  const [replyTo, setReplyTo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [openReactions, setOpenReactions] = useState("");
  const [moderatingUid, setModeratingUid] = useState("");
  const endRef = useRef(null);
  const messagesRef = useRef(null);
  const pageRef = useRef(null);
  const followLatestRef = useRef(true);
  const [emojiOpen, setEmojiOpen] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => {
      const page = pageRef.current;
      if (!page) return;
      page.style.setProperty("--field-chat-height",
        `${viewport?.height || window.innerHeight}px`);
      page.style.setProperty("--field-chat-top",
        `${viewport?.offsetTop || 0}px`);
    };
    resize();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    window.addEventListener("resize", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      window.removeEventListener("resize", resize);
    };
  }, []);

  useEffect(() => {
    setActor(null);
    setAccessError("");
    if (!venueId || !uid || !identity) return undefined;

    if (!isClubMember) {
      if (!isOwner && !activeStaff) {
        setAccessError("Your Field staff access is no longer active.");
        return undefined;
      }
      const name = activeStaff
        ? String(staff.fullName || "").trim()
        : String(currentUser.email || "").trim();
      const role = activeStaff
        ? String(staff.role || "field_manager")
        : "field_manager";
      if (!name) {
        setAccessError("Your Field staff profile needs a name.");
        return undefined;
      }
      setActor({ uid, name, role, clubId: "", clubName: "" });
      return undefined;
    }

    const clubId = String(identity.clubId || "");
    const memberId = String(identity.memberId || "");
    if (!clubId || !memberId) {
      setAccessError("Enter this Field through your Club portal.");
      return undefined;
    }

    let cancelled = false;
    let version = 0;
    let fieldMembership;
    let member;
    let club;
    let participantReady = false;

    async function refreshActor() {
      const currentVersion = ++version;
      if (fieldMembership === undefined ||
          member === undefined || club === undefined) return;
      if (!fieldMembership ||
          fieldMembership.status !== "active" ||
          fieldMembership.venueId !== venueId) {
        setActor(null);
        setAccessError("Your Club is no longer a member of this Field.");
        return;
      }
      if (!member || member.status !== "active" ||
          member.email !== currentUser.email ||
          (member.uid && member.uid !== uid)) {
        setActor(null);
        setAccessError("Your active Club membership could not be verified.");
        return;
      }
      const name = String(member.fullName || "").trim();
      const clubName = String(club?.name || clubId);
      if (!name) {
        setActor(null);
        setAccessError("Your Club member profile needs a name.");
        return;
      }
      try {
        if (!participantReady) {
          await setDoc(path(venueId, "chatParticipants", uid), {
            clubId, memberId,
          });
        }
        if (cancelled || currentVersion !== version) return;
        participantReady = true;
        setActor({ uid, name, role: "club_member", clubId, clubName });
        setAccessError("");
      } catch (error) {
        if (!cancelled && currentVersion === version) {
          setActor(null);
          setAccessError(error.message || "Could not verify Field chat access.");
        }
      }
    }

    function fail() {
      ++version;
      if (!cancelled) {
        setActor(null);
        setAccessError("Could not verify Field or Club membership.");
      }
    }

    const stopFieldMembership = onSnapshot(
      doc(db, "clubFieldMemberships", clubId),
      snapshot => {
        fieldMembership = snapshot.exists() ? snapshot.data() : null;
        void refreshActor();
      }, fail,
    );
    const stopMember = onSnapshot(
      doc(db, "clubs", clubId, "members", memberId),
      snapshot => {
        member = snapshot.exists() ? snapshot.data() : null;
        void refreshActor();
      }, fail,
    );
    const stopClub = onSnapshot(
      doc(db, "clubs", clubId),
      snapshot => {
        club = snapshot.exists() ? snapshot.data() : null;
        void refreshActor();
      }, fail,
    );

    return () => {
      cancelled = true;
      ++version;
      stopFieldMembership();
      stopMember();
      stopClub();
    };
  }, [
    venueId, uid, identity?.role, identity?.clubId,
    identity?.memberId, currentUser?.email,
    isOwner, activeStaff, staff?.fullName, staff?.role,
  ]);

  useEffect(() => {
    if (!venueId || !uid || !actor) {
      setMessages([]);
      return undefined;
    }
    return onSnapshot(
      query(
        collection(db, "leagueVenues", venueId, "chatMessages"),
        orderBy("createdAt", "asc"),
        limit(100),
      ),
      (snapshot) => {
        setMessages(snapshot.docs.map((item) => ({
          id: item.id, ...item.data(),
        })));
        setAccessError("");
      },
      () => {
        setMessages([]);
        setAccessError("Chat access could not be verified.");
      },
    );
  }, [venueId, uid, actor?.clubId, actor?.name]);

  useEffect(() => {
    if (!venueId || !uid || !actor) return undefined;
    return onSnapshot(
      path(venueId, "chatRestrictions", uid),
      (snapshot) => setMuted(snapshot.data()?.muted === true),
      () => setMuted(false),
    );
  }, [venueId, uid, actor?.clubId, actor?.name]);

  useEffect(() => {
    const list = messagesRef.current;
    if (list && followLatestRef.current) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages]);

  const send = async (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (
      !actor ||
      muted ||
      busy ||
      (!text && !fieldSelectedClip)
    ) return;
    setBusy(true);
    try {
      const messageRef = doc(
        collection(db, "leagueVenues", venueId, "chatMessages"),
      );
      await setDoc(messageRef, {
        text: (
          text ||
          fieldSelectedClip?.title ||
          "Field highlight"
        ).slice(0, 2000),
        ...(fieldSelectedClip
          ? { attachment: fieldSelectedClip }
          : {}),
        senderUid: actor.uid,
        senderName: actor.name,
        senderRole: actor.role,
        clubId: actor.clubId,
        clubName: actor.clubName,
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
        reactionsByUser: {},
        ...(replyTo ? {
          replyToId: replyTo.id,
          replyToSenderName: replyTo.senderName,
          replyToText: String(replyTo.text || "").slice(0, 300),
        } : {}),
      });
      followLatestRef.current = true;
      setEmojiOpen(false);
      setDraft("");
      setFieldSelectedClip(null);
      setReplyTo(null);
    } catch (error) {
      setAccessError(error.message || "Could not send this message.");
    } finally {
      setBusy(false);
    }
  };

  const react = async (message, emoji) => {
    if (!actor || muted) return;
    const current = message.reactionsByUser?.[uid] || "";
    try {
      await updateDoc(path(venueId, "chatMessages", message.id), {
        [`reactionsByUser.${uid}`]: current === emoji ? "" : emoji,
      });
      setOpenReactions("");
    } catch (error) {
      setAccessError(error.message || "Could not save reaction.");
    }
  };

  const remove = async (message) => {
    if (!isAdmin || !window.confirm("Remove this message from Field chat?")) return;
    try {
      await deleteDoc(path(venueId, "chatMessages", message.id));
    } catch (error) {
      setAccessError(error.message || "Could not remove message.");
    }
  };

  const mute = async (message) => {
    if (!isAdmin || !message.senderUid || message.senderUid === uid) return;
    if (!window.confirm(`Mute ${message.senderName} from sending and reacting?`)) return;
    setModeratingUid(message.senderUid);
    try {
      await setDoc(path(venueId, "chatRestrictions", message.senderUid), {
        uid: message.senderUid,
        muted: true,
        reason: "Field chat moderation",
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      setAccessError(error.message || "Could not mute participant.");
    } finally {
      setModeratingUid("");
    }
  };

  return (
    <main ref={pageRef} className="field-chat-page">
      <section className="card fanm-club-chat-card is-open is-modal-open field-chat-card">
        <div className="field-chat-return-controls field-chat-premium-header">
          <span className="fanm-club-chat-launcher-icon field-chat-brand-icon"
            aria-hidden="true">💬</span>
          <span className="fanm-club-chat-launcher-text field-chat-brand">
            <strong>{venue?.name || "Your Field"}</strong>
            <small>Field Chat · Football community</small>
          </span>
          <button type="button" className="secondary-btn"
            onClick={onBack} aria-label="Minimize Field chat">−</button>
          <button type="button" className="secondary-btn"
            onClick={onBack} aria-label="Close Field chat">×</button>
        </div>


        {accessError && <p className="field-chat-error" role="alert">{accessError}</p>}
        {muted && <p className="field-chat-muted">You can read chat, but sending and reactions are restricted.</p>}

        <div className="fanm-club-chat-messages field-chat-messages"
          ref={messagesRef} aria-label="Field messages"
          onScroll={() => {
            const list = messagesRef.current;
            if (list) followLatestRef.current =
              list.scrollHeight - list.scrollTop - list.clientHeight < 80;
          }}>
          {messages.length === 0 && !accessError && (
            <p className="fanm-club-chat-empty field-chat-empty">No messages yet. Start the conversation.</p>
          )}
          {messages.map((message, index) => {
            const mine = message.senderUid === uid;
            const previous = messages[index - 1];
            const date = fieldChatMessageDate(message);
            const previousDate = fieldChatMessageDate(previous);
            const dateLabel = fieldChatDateLabel(date);
            const showDate = Boolean(dateLabel && (
              !previousDate || date.toDateString() !== previousDate.toDateString()
            ));
            const grouped = Boolean(
              !showDate && previous &&
              message.senderUid &&
              previous.senderUid === message.senderUid &&
              date && previousDate &&
              Math.abs(date.getTime() - previousDate.getTime()) <= 300000 &&
              !message.replyToId && !previous.replyToId
            );
            const counts = Object.values(message.reactionsByUser || {})
              .reduce((totals, emoji) => {
                if (emoji) totals[emoji] = (totals[emoji] || 0) + 1;
                return totals;
              }, {});
            return (
              <React.Fragment key={message.id}>
                {showDate && (
                  <div className="fanm-chat-date-chip field-chat-date-chip">
                    {dateLabel}
                  </div>
                )}
                <div className={`fanm-chat-message-row field-chat-message-row ${mine ? "is-mine" : ""}`}>
                  {grouped ? (
                    <span className="fanm-chat-sender-avatar-spacer" />
                  ) : (
                    <span className="fanm-chat-sender-avatar field-chat-avatar"
                      aria-hidden="true">
                      {String(message.senderName || "Field member")
                        .trim().split(/\s+/).slice(0, 2)
                        .map(part => part[0]).join("").toUpperCase()}
                    </span>
                  )}
              <article
                className={`fanm-club-chat-message field-chat-message ${mine ? "is-mine" : ""} ${grouped ? "is-grouped" : ""}`}>
                {!grouped && (
                  <div className="fanm-club-chat-message-meta field-chat-meta">
                    <strong>{message.senderName}</strong>
                    <span>{message.clubName || "Field team"}</span>
                  </div>
                )}
                {message.replyToId && (
                  <blockquote className="fanm-chat-reply-quote field-chat-quote">
                    <strong>{message.replyToSenderName}</strong>
                    <span>{message.replyToText}</span>
                  </blockquote>
                )}
                {message.attachment?.mediaUrl && (
                  <div className="field-chat-video">
                    <strong>
                      {message.attachment.title ||
                        "Field highlight"}
                    </strong>

                    <video
                      controls
                      playsInline
                      preload="none"
                      src={message.attachment.mediaUrl}
                    />
                  </div>
                )}

                <p>{message.text}</p>
                <div className="field-chat-message-footer">
                  <small>{timeLabel(message.createdAt)}</small>
                  {Object.entries(counts).map(([emoji, count]) => (
                    <button key={emoji} type="button"
                      disabled={!actor || muted}
                      onClick={() => react(message, emoji)}>
                      {emoji} {count}
                    </button>
                  ))}
                </div>
                <div className="fanm-chat-message-actions field-chat-actions">
                  <button type="button" disabled={!actor || muted}
                    onClick={() => setReplyTo(message)}>Reply</button>
                  <button type="button" disabled={!actor || muted}
                    onClick={() => setOpenReactions(
                      openReactions === message.id ? "" : message.id
                    )}>React</button>
                  {isAdmin && (
                    <>
                      <button type="button" onClick={() => remove(message)}>
                        Remove
                      </button>
                      {message.senderUid !== uid && (
                        <button type="button"
                          disabled={moderatingUid === message.senderUid}
                          onClick={() => mute(message)}>Mute</button>
                      )}
                    </>
                  )}
                </div>
                {openReactions === message.id && !muted && (
                  <div className="fanm-chat-reaction-picker field-chat-reaction-picker">
                    {reactions.map((emoji) => (
                      <button type="button" key={emoji}
                        onClick={() => react(message, emoji)}>{emoji}</button>
                    ))}
                  </div>
                )}
              </article>
                </div>
              </React.Fragment>
            );
          })}
          <div ref={endRef} />
        </div>

        {replyTo && (
          <div className="field-chat-reply">
            <div>
              <strong>Replying to {replyTo.senderName}</strong>
              <small>{replyTo.text || "Message"}</small>
            </div>
            <button type="button" onClick={() => setReplyTo(null)}
              aria-label="Cancel reply">×</button>
          </div>
        )}
        {emojiOpen && (
          <div className="fanm-club-chat-emoji-tray field-chat-emoji-tray">
            {["😀", "😂", "🤣", "😎", "😭", "😡", "❤️", "🔥",
              "⚽", "🥅", "🏆", "💪", "👏", "🙌", "👌", "👀"].map(emoji => (
              <button key={emoji} type="button" disabled={!actor || muted}
                onClick={() => setDraft(value => (value + emoji).slice(0, 2000))}>
                {emoji}
              </button>
            ))}
          </div>
        )}
        {fieldSelectedClip && (
          <div className="field-chat-selected-clip">
            <span>
              <strong>Video attached</strong>
              <small>{fieldSelectedClip.title}</small>
            </span>

            <button
              type="button"
              aria-label="Remove attached video"
              onClick={() => setFieldSelectedClip(null)}
            >
              ×
            </button>
          </div>
        )}

        <form
          className="fanm-club-chat-compose field-chat-compose"
          onSubmit={send}
        >
          <div className="fanm-club-chat-input-wrap">
            <textarea ref={fieldDraftRef} className="text-input field-growing-input" rows={1}
              aria-label="Field chat message" value={draft}
              maxLength={2000} disabled={!actor || muted}
              onChange={event => setDraft(event.target.value)}
              placeholder={muted ? "Sending restricted" : "Message"}
            />
            <button type="button" className="fanm-club-chat-emoji-btn"
              disabled={!actor || muted} aria-label="Add emoji"
              aria-expanded={emojiOpen}
              onClick={() => setEmojiOpen(value => !value)}>😀</button>
            <button
              type="button"
              className="fanm-club-chat-attach-btn field-chat-attach"
              disabled={!actor || muted || busy}
              aria-label="Attach Field video"
              title="Attach Field video"
              onClick={openFieldClipPicker}
            >
              <svg
                viewBox="0 0 24 24"
                width="19"
                height="19"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m8 13 7-7a3 3 0 0 1 4 4L9 20a5 5 0 0 1-7-7L13 2a2 2 0 0 1 3 3L5 16" />
              </svg>
            </button>
          </div>
          <button type="submit" className="primary-btn fanm-premium-send-btn"
            aria-label="Send message"
            disabled={
              !actor ||
              muted ||
              busy ||
              (!draft.trim() && !fieldSelectedClip)
            }>Send</button>
        </form>
      </section>

      {fieldClipPickerOpen && (
        <div
          className="field-chat-clip-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setFieldClipPickerOpen(false);
            }
          }}
        >
          <section
            className="field-chat-clip-picker"
            role="dialog"
            aria-modal="true"
            aria-label="Attach Field video"
          >
            <header>
              <div>
                <small>
                  {venue?.name || "Your Field"}
                </small>
                <h2>Attach a highlight</h2>
              </div>

              <button
                type="button"
                aria-label="Close video picker"
                onClick={() =>
                  setFieldClipPickerOpen(false)
                }
              >
                ×
              </button>
            </header>

            {fieldClipsLoading && (
              <p>Loading Field videos…</p>
            )}

            {fieldClipsError && (
              <p role="alert">{fieldClipsError}</p>
            )}

            {!fieldClipsLoading &&
              !fieldClips.length && (
                <p>
                  No playable Field videos are
                  available yet.
                </p>
              )}

            <div className="field-chat-clip-list">
              {fieldClips.map((clip) => (
                <button
                  type="button"
                  key={`${clip.matchId}:${clip.clipId}`}
                  onClick={() => {
                    setFieldSelectedClip(clip);
                    setFieldClipPickerOpen(false);
                  }}
                >
                  <span aria-hidden="true">▶</span>

                  <span>
                    <strong>{clip.title}</strong>
                    <small>
                      Attach to your message
                    </small>
                  </span>

                  <span aria-hidden="true">＋</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
