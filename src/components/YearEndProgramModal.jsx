import {createPortal} from "react-dom";
import {fieldLogoStudioRequest} from "../storage/fieldLogoStudioGateway.js";
import "./YearEndOverlay.css";
// src/components/YearEndProgramModal.jsx
import React, { useEffect, useState, useMemo } from "react";
import { db } from "../firebaseConfig";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { isCaptainEmail } from "../core/captainAuth.js";

// Very small config doc in Firestore
const CONFIG_COLLECTION = "yearEndConfig";
const CONFIG_DOC_ID = "2025";

// True app admins (same idea as RSVPModal)
const ADMIN_EMAILS = ["nkululekolerato@gmail.com"];

// Extra people who can preview the full program (even if not captains)
const PREVIEW_EMAILS = [
  "anathi.swaphi@gmail.com", // Anathi
  "tyasi.sibabalo@gmail.com", // Barlo
];

// Default program start time if nothing stored
const DEFAULT_START_TIME = "19:30";

// Base program items defined as OFFSETS from the start time (in minutes)
// so shifting the start time keeps all durations the same.
const BASE_ITEMS = [
  {
    offsetStart: 0,
    offsetEnd: 3,
    title: "Intro & Starters",
    icon: "🎤",
    speaker: "MC Mdu",
    desc: [
      "MC Mdu welcomes everyone and sets the tone for the night.",
      "Requests the serving lady to begin serving starters.",
      "Gives a short explanation of what the event is about.",
      "Shares a brief background on TurfKings and why we are celebrating.",
    ],
  },
  {
    offsetStart: 8,
    offsetEnd: 10,
    title: "DJ Akhona – Take the Booth",
    icon: "🎧",
    desc:
      "MC Mdu introduces DJ Akhona properly and welcomes him to the booth. DJ drops an opener as he settles in and sets the sound.",
  },
  {
    offsetStart: 10,
    offsetEnd: 15,
    title: "Welcome by Barlo",
    icon: "🤝",
    desc:
      "Official welcoming from Captain Barlo (about 4–5 minutes) – acknowledging teams, new faces and how far TurfKings has come.",
  },
  {
    offsetStart: 15,
    offsetEnd: 25,
    title: "Hit After Hit – By Anathi",
    icon: "🎶",
    desc:
      "Two back-to-back tracks from Anathi (around 5 minutes each) to lift the energy and set the mood before the keynote.",
  },
  {
    offsetStart: 25,
    offsetEnd: 35,
    title: "Keynote Address",
    icon: "🗝️",
    speaker: "Nkululeko (Team Lead)",
    desc:
      "Keynote speech (max 10 minutes) from Nkululeko – reflections on the journey, shout-outs, and the vision for TurfKings and next season.",
  },
  {
    offsetStart: 35,
    offsetEnd: 40,
    title: "Official TurfKings Team Photo",
    icon: "📸",
    desc:
      "Right after the keynote, MC calls everyone together for the official TurfKings team photo moment to capture the full squad",
  },
  {
    offsetStart: 40,
    offsetEnd: 45,
    title: "MC Close & Mains",
    icon: "🍽️",
    desc:
      "MC Mdu closes the formal program, announces that mains will be served, the helping lady clears starters and brings mains. DJ Akhona then takes over fully for the night.",
  },
];

// ---- simple helpers to work with "HH:MM" times ----
function parseTimeToMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== "string") return null;
  const [hStr, mStr] = hhmm.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (
    Number.isNaN(h) ||
    Number.isNaN(m) ||
    h < 0 ||
    h > 23 ||
    m < 0 ||
    m > 59
  ) {
    return null;
  }
  return h * 60 + m;
}

function formatMinutesToTime(totalMinutes) {
  // wrap around 24h just in case, though you won't go past midnight realistically
  let m = totalMinutes % (24 * 60);
  if (m < 0) m += 24 * 60;
  const h = Math.floor(m / 60);
  const min = m % 60;
  const hStr = h.toString().padStart(2, "0");
  const mStr = min.toString().padStart(2, "0");
  return `${hStr}:${mStr}`;
}

export function YearEndProgramModal({ identity, onClose, event, canEditEvent, onSaved }) {
  const [editorOpen,setEditorOpen]=useState(false);
  const [itemsDraft,setItemsDraft]=useState([]);
  const [publishedDraft,setPublishedDraft]=useState(false);
  const [saveError,setSaveError]=useState("");
  const currentItems=event?.programItems?.length?event.programItems:BASE_ITEMS;
  const startEditing=()=>{
    setItemsDraft(currentItems.map(item=>({...item,desc:Array.isArray(item.desc)?item.desc.join("\n"):item.desc||""})));
    setPublishedDraft(event?.programPublished===true);setEditorOpen(true);setSaveError("");
  };
  const [programPublished, setProgramPublished] = useState(false);
  const [programStartTime, setProgramStartTime] = useState(
    DEFAULT_START_TIME
  );
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingStartTime, setSavingStartTime] = useState(false);

  const identityEmail = useMemo(
    () =>
      (identity?.email || identity?.user?.email || "")
        .trim()
        .toLowerCase(),
    [identity]
  );

  const isAdmin =
    !!identityEmail &&
    (ADMIN_EMAILS.includes(identityEmail) ||
      identity?.role === "admin");

  const isCaptain =
    !!identityEmail &&
    (isCaptainEmail(identityEmail) || identity?.role === "captain");

  const isPreviewUser =
    !!identityEmail && PREVIEW_EMAILS.includes(identityEmail);

  const canSeeFullProgram = event ? canEditEvent || event.programPublished : isAdmin || isCaptain || isPreviewUser || programPublished;

  // Load programPublished + programStartTime from Firestore
  useEffect(() => {
    if(event){setLoadingConfig(false);return;}
    let cancelled = false;

    async function loadConfig() {
      try {
        const ref = doc(db, CONFIG_COLLECTION, CONFIG_DOC_ID);
        const snap = await getDoc(ref);
        if (cancelled) return;

        if (snap.exists()) {
          const data = snap.data() || {};
          setProgramPublished(!!data.programPublished);

          const storedStart = data.programStartTime;
          if (typeof storedStart === "string" && storedStart.trim()) {
            setProgramStartTime(storedStart);
          } else {
            setProgramStartTime(DEFAULT_START_TIME);
          }
        } else {
          // default: not yet published, default start time
          setProgramPublished(false);
          setProgramStartTime(DEFAULT_START_TIME);
        }
      } catch (err) {
        console.error("Failed to load year-end program config:", err);
      } finally {
        if (!cancelled) setLoadingConfig(false);
      }
    }

    loadConfig();
    return () => {
      cancelled = true;
    };
  }, [event]);

  async function handleTogglePublish() {
    if (!isAdmin) return;

    const next = !programPublished;

    let msg;
    if (next) {
      msg =
        "Make the year-end program visible to ALL players and spectators?\n" +
        "After this, anyone opening the Program will see the full running order.";
    } else {
      msg =
        "Hide the full program from ordinary players and show 'Program coming soon' again?\n" +
        "Captains, admin and preview users will still be able to see the details.";
    }

    const ok = window.confirm(msg);
    if (!ok) return;

    try {
      setSaving(true);
      const ref = doc(db, CONFIG_COLLECTION, CONFIG_DOC_ID);
      await setDoc(
        ref,
        {
          programPublished: next,
          programUpdatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setProgramPublished(next);
    } catch (err) {
      console.error("Failed to update program visibility:", err);
      alert("Could not update program visibility. Check console for details.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveStartTime() {
    if (!isAdmin) return;
    const mins = parseTimeToMinutes(programStartTime);
    if (mins == null) {
      alert("Please enter a valid start time in HH:MM format (e.g. 19:30).");
      return;
    }

    try {
      setSavingStartTime(true);
      const ref = doc(db, CONFIG_COLLECTION, CONFIG_DOC_ID);
      await setDoc(
        ref,
        {
          programStartTime,
          programStartTimeUpdatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error("Failed to update program start time:", err);
      alert("Could not update program start time. Check console for details.");
    } finally {
      setSavingStartTime(false);
    }
  }

  // ---- Compute adjusted times for all items based on programStartTime ----
  const { itemsWithTimes, headerStartLabel, headerEndLabel } = useMemo(() => {
    const baseStartMinutes =
      parseTimeToMinutes(event?.program || programStartTime) ??
      parseTimeToMinutes(DEFAULT_START_TIME) ??
      19 * 60 + 30; // ultimate fallback: 19:30

    const items = currentItems.map((item) => {
      const start = formatMinutesToTime(
        baseStartMinutes + item.offsetStart
      );
      const end = formatMinutesToTime(
        baseStartMinutes + item.offsetEnd
      );
      return {
        ...item,
        timeLabel: `${start} – ${end}`,
      };
    });

    const first = items[0];
    const last = items[items.length - 1];
    const startLabel = first ? first.timeLabel.split("–")[0].trim() : "";
    const endLabel = last
      ? last.timeLabel.split("–")[1].trim()
      : "";

    return {
      itemsWithTimes: items,
      headerStartLabel: startLabel || programStartTime,
      headerEndLabel: endLabel || "",
    };
  }, [programStartTime,event?.program,currentItems]);

  return createPortal(
    <div className="year-end-overlay">
      <div
        className="modal year-end-overlay-panel" role="dialog" aria-modal="true" aria-label="Year-End Programme"
        style={{
          maxWidth: "560px",
          width: "100%",
          maxHeight: "85vh",
          overflowY: "auto",
          padding: "1.4rem 1.4rem 1.1rem",
          background:
            "radial-gradient(circle at top left, #020617, #020617 40%, #020617)",
          boxShadow:
            "0 18px 45px rgba(15,23,42,0.9), 0 0 0 1px rgba(148,163,184,0.25)",
          borderRadius: "1.25rem",
        }}
      >
        <div className="year-end-overlay-actions">
          <button className="secondary-btn" onClick={onClose}>Close</button>
          {event&&canEditEvent&&<button className="primary-btn" onClick={editorOpen?()=>setEditorOpen(false):startEditing}>
            {editorOpen?"Back to programme":"Edit programme"}
          </button>}
        </div>
        {editorOpen&&<form className="year-end-program-editor" onSubmit={async e=>{
          e.preventDefault();if(saving)return;setSaving(true);setSaveError("");
          try {
            await fieldLogoStudioRequest({action:"yearEndProgramme",eventId:event.id,items:itemsDraft,published:publishedDraft});
            await onSaved?.();setEditorOpen(false);
          }catch(error){setSaveError(error.message);}finally{setSaving(false);}
        }}>
          <p>Times are minutes from the advertised programme start ({event.program}).</p>
          {itemsDraft.map((item,i)=>{
            const update=(key,value)=>setItemsDraft(rows=>rows.map((row,index)=>index===i?{...row,[key]:value}:row));
            return <fieldset key={i}><legend>Item {i+1}</legend>
              <label>Title<input className="text-input" required maxLength={100} value={item.title} onChange={e=>update("title",e.target.value)}/></label>
              <label>Speaker<input className="text-input" maxLength={100} value={item.speaker||""} onChange={e=>update("speaker",e.target.value)}/></label>
              <label>Start minute<input className="text-input" type="number" required min={0} max={719} value={item.offsetStart} onChange={e=>update("offsetStart",Number(e.target.value))}/></label>
              <label>End minute<input className="text-input" type="number" required min={item.offsetStart+1} max={720} value={item.offsetEnd} onChange={e=>update("offsetEnd",Number(e.target.value))}/></label>
              <label>Notes<textarea className="text-input" maxLength={2000} value={item.desc} onChange={e=>update("desc",e.target.value)}/></label>
              <button type="button" className="secondary-btn" onClick={()=>setItemsDraft(rows=>rows.filter((_,index)=>index!==i))}>Remove item</button>
            </fieldset>;
          })}
          <button type="button" className="secondary-btn" onClick={()=>setItemsDraft(rows=>[...rows,{title:"",speaker:"",desc:"",offsetStart:0,offsetEnd:5,icon:"🎤"}])}>Add programme item</button>
          <label><input type="checkbox" checked={publishedDraft} onChange={e=>setPublishedDraft(e.target.checked)}/> Publish programme to players</label>
          {saveError&&<p role="alert">{saveError}</p>}
          <button className="primary-btn" disabled={saving||!itemsDraft.length}>{saving?"Saving…":"Save programme"}</button>
        </form>}
        {/* HEADER */}
        <header style={{ marginBottom: "0.9rem" }}>
          <h2 style={{ marginBottom: "0.25rem" }}>
            🗓️ TurfKings Year-End Program
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: "0.85rem",
              opacity: 0.9,
            }}
          >
            Formal program runs from{" "}
            <strong>{headerStartLabel}</strong> to about{" "}
            <strong>{headerEndLabel}</strong>, so that the rest of the
            night is for food, drinks and vibes.
          </p>
          <p
            style={{
              margin: "0.25rem 0 0",
              fontSize: "0.8rem",
              opacity: 0.9,
            }}
          >
            MC for the night:{" "}
            <strong style={{ fontWeight: 700 }}>Mdu</strong>.
          </p>

          {loadingConfig && (
            <p
              style={{
                marginTop: "0.3rem",
                fontSize: "0.8rem",
                opacity: 0.8,
              }}
            >
              Loading program visibility…
            </p>
          )}

          {!event && !loadingConfig && (isAdmin || isCaptain || isPreviewUser) && (
            <p
              style={{
                marginTop: "0.4rem",
                fontSize: "0.8rem",
                opacity: 0.9,
              }}
            >
              {(event ? event.programPublished : programPublished) ? (
                <span style={{ color: "#22c55e" }}>
                  ✅ Program is currently <strong>visible to everyone</strong>.
                </span>
              ) : (
                <span style={{ color: "#facc15" }}>
                  🔒 Program is in{" "}
                  <strong>captains / admin</strong> preview mode only. Ordinary
                  players see “Program coming soon”.
                </span>
              )}
            </p>
          )}
        </header>

        {/* CONTENT */}
        {loadingConfig ? (
          <p>Loading…</p>
        ) : !canSeeFullProgram ? (
          // Ordinary players & spectators BEFORE publish
          <section
            style={{
              padding: "0.9rem 0.9rem 0.8rem",
              borderRadius: "0.9rem",
              background:
                "linear-gradient(135deg, rgba(15,23,42,0.95), #020617)",
              border: "1px solid rgba(148,163,184,0.55)",
              fontSize: "0.9rem",
            }}
          >
            <p style={{ marginTop: 0 }}>
              📋 <strong>Program coming soon</strong>
            </p>
            <p style={{ marginBottom: "0.4rem" }}>
              Will be visible just before event starts.
            </p>
            <p style={{ fontSize: "0.8rem", opacity: 0.8 }}>
              For now, just know: the formal part will be short and sweet so we
              can maximise food, drinks and music.
            </p>
          </section>
        ) : (
          // Full program view
          <section
            style={{
              padding: "0.85rem 0.9rem 0.85rem",
              borderRadius: "0.9rem",
              background:
                "linear-gradient(135deg, rgba(15,23,42,0.95), #020617)",
              border: "1px solid rgba(148,163,184,0.55)",
            }}
          >
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
              }}
            >
              {itemsWithTimes.map((item, idx) => (
                <li
                  key={item.title}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr",
                    columnGap: "0.75rem",
                    paddingBottom:
                      idx === itemsWithTimes.length - 1 ? 0 : "0.75rem",
                    marginBottom:
                      idx === itemsWithTimes.length - 1 ? 0 : "0.75rem",
                    borderBottom:
                      idx === itemsWithTimes.length - 1
                        ? "none"
                        : "1px dashed rgba(148,163,184,0.35)",
                  }}
                >
                  {/* Timeline indicator */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "0.25rem",
                    }}
                  >
                    <div
                      style={{
                        width: "26px",
                        height: "26px",
                        borderRadius: "999px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background:
                          "radial-gradient(circle at 30% 0%, rgba(59,130,246,0.4), transparent 60%), #020617",
                        boxShadow:
                          "0 0 0 1px rgba(148,163,184,0.6), 0 0 12px rgba(59,130,246,0.7)",
                        fontSize: "1.05rem",
                      }}
                    >
                      {item.icon}
                    </div>
                    {idx !== itemsWithTimes.length - 1 && (
                      <div
                        style={{
                          flex: 1,
                          width: "2px",
                          background:
                            "linear-gradient(to bottom, rgba(148,163,184,0.6), transparent)",
                        }}
                      />
                    )}
                  </div>

                  {/* Text block */}
                  <div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "0.78rem",
                        letterSpacing: "0.03em",
                        textTransform: "uppercase",
                        opacity: 0.8,
                      }}
                    >
                      {item.timeLabel}
                    </p>
                    <p
                      style={{
                        margin: "0.1rem 0 0.05rem",
                        fontSize: "1rem",
                        fontWeight: 700,
                      }}
                    >
                      {item.title}
                    </p>
                    {item.speaker && (
                      <p
                        style={{
                          margin: "0 0 0.15rem",
                          fontSize: "0.86rem",
                          fontWeight: 600,
                        }}
                      >
                        Speaker:{" "}
                        <span style={{ fontWeight: 700 }}>
                          {item.speaker}
                        </span>
                      </p>
                    )}
                    <p
                      style={{
                        margin: 0,
                        fontSize: "0.86rem",
                        opacity: 0.9,
                      }}
                    >
                      {item.desc}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ADMIN PUBLISH TOGGLE + START TIME CONTROL */}
        {!event && !loadingConfig && (isAdmin || isCaptain || isPreviewUser) && (
          <section
            style={{
              marginTop: "0.85rem",
              padding: "0.6rem 0.8rem",
              borderRadius: "0.85rem",
              background: "#020617",
              border: "1px solid rgba(148,163,184,0.45)",
              fontSize: "0.8rem",
            }}
          >
            {isAdmin ? (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "0.55rem",
                    marginBottom: "0.7rem",
                  }}
                >
                  <input
                    type="checkbox"
                    id="program-published-toggle"
                    checked={programPublished}
                    disabled={saving}
                    onChange={handleTogglePublish}
                    style={{ marginTop: "0.15rem" }}
                  />
                  <label
                    htmlFor="program-published-toggle"
                    style={{ cursor: "pointer" }}
                  >
                    <strong>Program visible to all players</strong>
                    <br />
                    <span style={{ opacity: 0.85 }}>
                      When turned on, ordinary players and spectators will see
                      this full program when they click the Program button. When
                      off, they only see &quot;Program coming soon&quot;. You
                      will be asked to confirm whenever you change this.
                    </span>
                  </label>
                </div>

                {/* Quick start-time editor */}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                    alignItems: "center",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <label
                      htmlFor="program-start-time"
                      style={{
                        fontWeight: 600,
                        marginBottom: "0.2rem",
                      }}
                    >
                      Program start time
                    </label>
                    <input
                      id="program-start-time"
                      type="time"
                      value={programStartTime}
                      onChange={(e) =>
                        setProgramStartTime(e.target.value)
                      }
                      style={{
                        padding: "0.25rem 0.4rem",
                        borderRadius: "0.35rem",
                        border: "1px solid rgba(148,163,184,0.7)",
                        backgroundColor: "#020617",
                        color: "#e5e7eb",
                        fontSize: "0.85rem",
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveStartTime}
                    disabled={savingStartTime}
                    style={{
                      padding: "0.35rem 0.8rem",
                      borderRadius: "999px",
                      border: "1px solid rgba(52,211,153,0.8)",
                      background:
                        savingStartTime
                          ? "rgba(16,185,129,0.25)"
                          : "rgba(16,185,129,0.12)",
                      color: "#a7f3d0",
                      cursor: savingStartTime ? "default" : "pointer",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                    }}
                  >
                    {savingStartTime ? "Saving…" : "Save start time"}
                  </button>
                  <span style={{ opacity: 0.75 }}>
                    Use this if the program is delayed – all item times will
                    shift but durations stay the same.
                  </span>
                </div>
              </>
            ) : (
              <p style={{ margin: 0, opacity: 0.85 }}>
                As a captain or preview user you can always see the full
                program, even before it is published to players.
              </p>
            )}
          </section>
        )}

        {/* CLOSE BUTTON */}
        <button
          className="secondary-btn"
          style={{ marginTop: "1rem", width: "100%" }}
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>, document.body
  );
}
