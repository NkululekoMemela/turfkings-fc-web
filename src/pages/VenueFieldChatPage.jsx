import React, { useEffect, useRef, useState } from "react";
import {
  collection, deleteDoc, doc, getDoc, limit, onSnapshot,
  orderBy, query, serverTimestamp, setDoc, updateDoc,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import "./VenueFieldChatPage.css";

const reactions = ["⚽", "🔥", "🧤", "👏", "😂", "❤️", "👍", "👎", "😩", "🤯"];
const path = (venueId, collectionName, id) =>
  doc(db, "leagueVenues", venueId, collectionName, id);

function timeLabel(value) {
  const date = value?.toDate?.();
  return date ? date.toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit",
  }) : "";
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
    if (!actor || muted || busy || !text) return;
    setBusy(true);
    try {
      const messageRef = doc(
        collection(db, "leagueVenues", venueId, "chatMessages"),
      );
      await setDoc(messageRef, {
        text: text.slice(0, 2000),
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
        <div className="field-chat-return-controls">
          <strong>{venue?.name || "Field"} Chat</strong>
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
          {messages.map((message) => {
            const mine = message.senderUid === uid;
            const counts = Object.values(message.reactionsByUser || {})
              .reduce((totals, emoji) => {
                if (emoji) totals[emoji] = (totals[emoji] || 0) + 1;
                return totals;
              }, {});
            return (
              <article key={message.id}
                className={`fanm-club-chat-message field-chat-message ${mine ? "is-mine" : ""}`}>
                <div className="fanm-club-chat-message-meta field-chat-meta">
                  <strong>{message.senderName}</strong>
                  <span>{message.clubName || "Field team"}</span>
                </div>
                {message.replyToId && (
                  <blockquote className="fanm-chat-reply-quote field-chat-quote">
                    <strong>{message.replyToSenderName}</strong>
                    <span>{message.replyToText}</span>
                  </blockquote>
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
            );
          })}
          <div ref={endRef} />
        </div>

        {replyTo && (
          <div className="field-chat-reply">
            Replying to {replyTo.senderName}
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
        <form className="fanm-club-chat-compose field-chat-compose" onSubmit={send}>
          <div className="fanm-club-chat-input-wrap">
            <textarea className="text-input" rows={1}
              aria-label="Field chat message" value={draft}
              maxLength={2000} disabled={!actor || muted}
              onChange={event => setDraft(event.target.value)}
              placeholder={muted ? "Sending restricted" : "Message"}
            />
            <button type="button" className="fanm-club-chat-emoji-btn"
              disabled={!actor || muted} aria-label="Add emoji"
              aria-expanded={emojiOpen}
              onClick={() => setEmojiOpen(value => !value)}>😀</button>
          </div>
          <button type="submit" className="primary-btn fanm-premium-send-btn"
            aria-label="Send message"
            disabled={!actor || muted || busy || !draft.trim()}>Send</button>
        </form>
      </section>
    </main>
  );
}
