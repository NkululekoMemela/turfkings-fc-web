import {createPortal} from "react-dom";
import {fieldLogoStudioRequest} from "../storage/fieldLogoStudioGateway.js";
import {openYearEndCheckout} from "./YearEndBooking.jsx";
import PremiumSelect from "./PremiumSelect.jsx";
import ShopPaymentReview from "./ShopPaymentReview.jsx";
import "./YearEndOverlay.css";
// src/components/RSVPModal.jsx
import React, { useState, useEffect } from "react";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  addDoc, // to log withdrawals for admin
} from "firebase/firestore";
import { db } from "../firebaseConfig";

const MAX_CAPACITY = 60;
const PLAYER_FEE = 100;
const FRIEND_FEE = 75;

// 🔐 True app admins (not just captains)
const ADMIN_EMAILS = ["nkululekolerato@gmail.com"];

// Explicit confirmation for destructive administrative actions
// Administrative actions use explicit typed confirmation.

export function RSVPModal({ identity, onClose, event }) {
  const capacity=event?.capacity ?? MAX_CAPACITY;
  const playerFee=event ? event.player/100 : PLAYER_FEE;
  const friendFee=event ? event.guest/100 : FRIEND_FEE;
  const maxFriends=event?.maxGuests ?? 3;
  const [booking,setBooking]=useState(null);
  const [dietaryRequests,setDietaryRequests]=useState([]);
  const [dietary,setDietary]=useState("");
  const [dietaryNotes,setDietaryNotes]=useState("");
  const [reviewPayment,setReviewPayment]=useState(false);
  const [paymentError,setPaymentError]=useState("");
  const [busy,setBusy]=useState(false);
  const loadEdition=React.useCallback(async()=>{
    const result=await fieldLogoStudioRequest({action:"yearEndView",includeAttendees:true});
    if(result.event?.id!==event?.id || result.event.archived)throw Error("Reopen the current event.");
    setAttendees(result.attendees||[]);
    setDietaryRequests(result.dietaryRequests||[]);
    setBooking(result.booking||null);
  },[event?.id]);
  const [attendees, setAttendees] = useState([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [friends, setFriends] = useState(0);
  const [paid, setPaid] = useState(false);
  const [popNote, setPopNote] = useState("");
  const [error, setError] = useState("");
  const [friendsOpen, setFriendsOpen] = useState(Boolean(event));
  const [paymentOpen, setPaymentOpen] = useState(false); // collapsed by default
  const [editing, setEditing] = useState(false); // view vs edit mode

  const identityEmail = (identity?.email || identity?.user?.email || "")
    .trim()
    .toLowerCase();

  // 🔑 Admin detection – ONLY real admin, not all captains
  const isAdmin =
    !!identityEmail &&
    (ADMIN_EMAILS.includes(identityEmail) || identity?.role === "admin");

  // Firestore subscription
  useEffect(() => {
    if(event){
      loadEdition().catch(e=>setError(e.message)).finally(()=>setLoading(false));
      return;
    }
    const unsub = onSnapshot(collection(db, "yearEndRSVP"), (snap) => {
      const list = [];
      snap.forEach((d) => list.push(d.data()));
      setAttendees(list);
      setLoading(false);
    });
    return () => unsub();
  }, [event,loadEdition]);

  // Who is logged in?
  const currentUser =
    identity?.displayName ||
    identity?.fullName ||
    identity?.name ||
    identity?.email ||
    null;

  const currentEmail = identity?.email || identity?.user?.email || null;

  const existing = attendees.find((a) => event ? a.id === "self" : a.name === currentUser) || null;

  // Separate active vs withdrawn attendees
  const activeAttendees = attendees.filter((a) => !a.withdrawn);
  const existingActive = existing && !existing.withdrawn;

  // Totals (capacity counts ONLY active attendees)
  const totalPlayers = activeAttendees.length;
  const totalFriends = activeAttendees.reduce(
    (acc, a) => acc + (a.friends || 0),
    0
  );
  const totalPeople = totalPlayers + totalFriends;

  const remaining = capacity - totalPeople;

  // If capacity is full, only block people who *aren't* already active
  const isFullForNew = remaining <= 0 && !existingActive;

  const pending=booking?.status==="pending";
  const yourAmount = pending ? booking.amount/100 : playerFee + friendFee * friends;

  // When existing entry changes, sync local form state + default view/edit mode
  useEffect(() => {
    if (existing) {
      setFriends(existing.friends || 0);
      setPaid(!!existing.paid);
      setPopNote(existing.popNote || "");
      // If they are withdrawn, drop them straight into edit mode so they can re-join
      setEditing(event ? existing.status==="pending" : !!existing.withdrawn);
    } else {
      // No RSVP yet → open edit mode
      setFriends(0);
      setPaid(false);
      setPopNote("");
      setEditing(true);
    }
  }, [existing,event]);

  useEffect(()=>{
    if(!booking)return;
    setDietary(booking.dietary||"");
    setDietaryNotes(booking.dietaryNotes||"");
  },[booking]);

  // Only layout tweaks, colours come from .primary-btn CSS (same as Start Match)
  const primaryBtnStyle = {
    width: "100%",
    marginTop: "0.4rem",
  };

  async function handleJoin(accepted = false) {
    setError("");
    if (!currentUser) {
      alert("Please sign in to RSVP.");
      return;
    }

    if(event){
      if(busy)return;
      if(!accepted)return;
      setPaymentError("");
      setBusy(true);
      try {
        await openYearEndCheckout(event,{guestCount:pending?booking.guestCount:friends,dietary,dietaryNotes,accepted});
        await loadEdition();
        setReviewPayment(false);
      } catch(e){setPaymentError(e.message);} finally{setBusy(false);}
      return;
    }

    if (!currentEmail) {
      console.warn(
        "No email on identity; calendar invite function will have nothing to send to."
      );
    }

    if (isFullForNew) {
      setError(
        "RSVP list full (60 people). You can only withdraw or reduce friends."
      );
      return;
    }

    if (friends < 0 || friends > maxFriends) {
      setError("Choose a valid number of friends.");
      return;
    }

    // Capacity calculation, respecting any existing *active* entry for this user
    const previousFriends = existingActive ? existing.friends || 0 : 0;
    const previousPeople = existingActive ? 1 + previousFriends : 0;
    const newPeopleForYou = 1 + friends;
    const peopleWithoutYou = totalPeople - previousPeople;
    const projectedTotal = peopleWithoutYou + newPeopleForYou;

    if (projectedTotal > capacity) {
      const freeSpots = capacity - peopleWithoutYou - 1;
      if (freeSpots <= 0) {
        setError("RSVP list full (60 people).");
      } else {
        setError(
          `There is space for you + ${freeSpots} friend${
            freeSpots === 1 ? "" : "s"
          }. Please reduce your friend count.`
        );
      }
      return;
    }

    await setDoc(doc(db, "yearEndRSVP", currentUser), {
      name: currentUser,
      email: currentEmail || "",
      friends,
      paid,
      popNote: popNote || "",
      withdrawn: false, // mark as active
      withdrawnAt: null,
      timestamp: Date.now(),
    });

    // ✅ After saving, collapse into summary mode
    setEditing(false);
    setFriendsOpen(false);
    setPaymentOpen(false);
  }

  // WITHDRAW: confirm, log for admin, and mark as withdrawn (keep in list)
  async function handleWithdraw() {
    setError("");
    if (!currentUser) return;

    const confirmMsg =
      "Are you sure you want to withdraw from the year-end function?\n" +
      "You and your listed friends will be removed from the active list, " +
      "and the captains will be notified.";
    const ok = window.confirm(confirmMsg);
    if (!ok) return;

    try {
      // Log this event in a separate collection for admin follow-up
      if (existing) {
        await addDoc(collection(db, "yearEndRSVP_withdrawals"), {
          name: existing.name || currentUser,
          email: existing.email || currentEmail || "",
          friends: existing.friends || 0,
          paid: !!existing.paid,
          popNote: existing.popNote || "",
          withdrawnAt: Date.now(),
        });
      }
    } catch (e) {
      console.error("Failed to log withdrawal", e);
    }

    // Instead of deleting, mark as withdrawn (so we can show grey/red in list)
    await setDoc(
      doc(db, "yearEndRSVP", currentUser),
      {
        withdrawn: true,
        withdrawnAt: Date.now(),
      },
      { merge: true }
    );
  }

  // 🔁 toggle "paid" from the attendees list
  // - normal users: only their own row
  // - admin: can toggle anyone
  async function togglePaidFromList(attendee) {
    if (!currentUser && !isAdmin) return;
    if (!isAdmin && attendee.name !== currentUser) return;

    const newPaid = !attendee.paid;
    setError("");

    await setDoc(
      doc(db, "yearEndRSVP", attendee.name),
      {
        ...attendee,
        paid: newPaid,
        email: attendee.email || currentEmail || "",
      },
      { merge: true }
    );
  }

  // ADMIN-ONLY: remove an attendee after typed confirmation
  async function handleAdminRemove(attendee) {
    if (!isAdmin) return;
    if (!attendee?.name) return;

    const ok = window.confirm(
      `Admin: permanently remove ${attendee.name} from the RSVP list?`
    );
    if (!ok) return;

    const code = window.prompt(
      "Type DELETE to remove this RSVP. This action cannot be undone."
    );
    if (code === null) return; // cancelled

    if (String(code).trim().toUpperCase() !== "DELETE") {
      alert("Type DELETE to confirm. RSVP not removed.");
      return;
    }

    try {
      await deleteDoc(doc(db, "yearEndRSVP", attendee.name));
      alert(`RSVP for ${attendee.name} has been removed.`);
    } catch (err) {
      console.error("Admin remove failed:", err);
      alert("Could not remove RSVP. Check console for details.");
    }
  }

  return createPortal(
    <div className="modal-backdrop year-end-overlay">
      <div
        className="modal year-end-overlay-panel" role="dialog" aria-modal="true" aria-label="Year-end RSVP"
        style={{
          maxWidth: "540px",
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
        {/* HEADER (simple text, no cards) */}
        <header style={{ marginBottom: "0.9rem" }}>
          <span className="rsvp-eyebrow">Turf Kings · Year-End</span>
          <h2 style={{ marginBottom: "0.3rem" }}>Your RSVP</h2>
          <p
            style={{
              margin: 0,
              fontSize: "0.85rem",
              opacity: 0.85,
            }}
          >
            Places booked:{" "}
            <strong>
              {totalPeople} / {capacity}
            </strong>{" "}
          </p>
          <p
            style={{
              margin: "0.15rem 0 0",
              fontSize: "0.8rem",
              opacity: 0.8,
            }}
          >
            {/*Players: <strong>{totalPlayers}</strong> · Friends:{" "}
            <strong>{totalFriends}</strong> · Total amount:{" "}
            <strong>R{totalAmount}</strong> */}
          </p>
        </header>

        {event && error && <p role="alert">{error}</p>}
        {loading ? (
          <p>Loading RSVP list...</p>
        ) : (
          <>
            {/* YOU / IDENTITY SECTION */}
            <section
              style={{
                padding: "0.75rem 0.85rem",
                borderRadius: "0.9rem",
                background:
                  "linear-gradient(135deg, rgba(15,23,42,0.95), #020617)",
                border: "1px solid rgba(148,163,184,0.55)",
                marginBottom: "0.9rem",
              }}
            >
              <p style={{ margin: 0, fontSize: "0.9rem" }}>
                Booking for{" "}
                <strong>{currentUser || "Not signed in"}</strong>
              </p>
              {currentEmail && (
                <p
                  style={{
                    margin: "0.15rem 0 0.45rem",
                    fontSize: "0.8rem",
                    opacity: 0.85,
                  }}
                >
                  <strong>{currentEmail}</strong>
                </p>
              )}

              {!currentUser && (
                <p
                  style={{
                    margin: "0.4rem 0 0",
                    fontSize: "0.83rem",
                    opacity: 0.9,
                  }}
                >
                  Please sign in on the main page to RSVP.
                </p>
              )}
            </section>

            {/* EDIT MODE: FRIENDS & PAYMENT ACCORDIONS + ACTION BUTTONS */}
            {currentUser && editing && (
              <>
                {/* Friends & amount accordion */}
                <section
                  style={{
                    borderRadius: "0.9rem",
                    background: "#020617",
                    border: "1px solid rgba(148,163,184,0.35)",
                    marginBottom: "0.7rem",
                    overflow: "hidden",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setFriendsOpen((v) => !v)}
                    style={{
                      width: "100%",
                      padding: "0.6rem 0.85rem",
                      background: "transparent",
                      border: "none",
                      color: "inherit",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: "0.85rem",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>
                      Guests
                    </span>
                    <span
                      style={{
                        transform: friendsOpen ? "rotate(90deg)" : "rotate(0deg)",
                        transition: "transform 0.15s ease-out",
                        fontSize: "1rem",
                      }}
                    >
                      ▶
                    </span>
                  </button>
                  {friendsOpen && (
                    <div style={{ padding: "0 0.85rem 0.7rem" }}>
                      <p
                        style={{
                          margin: "0.15rem 0 0.25rem",
                          fontSize: "0.83rem",
                        }}
                      >
                        Guests (up to {maxFriends})
                      </p>

                      <PremiumSelect aria-label="Number of guests"
                        className="text-input"
                        value={friends}
                        disabled={pending}
                        onChange={(e) =>
                          setFriends(Number(e.target.value) || 0)
                        }
                        style={{
                          marginBottom: "0.35rem",
                          fontSize: "0.85rem",
                        }}
                      >
                        {Array.from({length:maxFriends+1},(_,count)=><option key={count} value={count}>{count===0?"Myself alone":count===1?"Me + 1 friend or partner":`Me + ${count} friends`}</option>)}
                      </PremiumSelect>
                      <p
                        style={{
                          margin: "0.2rem 0",
                          fontSize: "0.83rem",
                          opacity: 0.9,
                        }}
                      >
                        Booking:{" "}
                        <strong>
                          1 player + {friends} friend
                          {friends === 1 ? "" : "s"}
                        </strong>
                        . Total:{" "}
                        <strong>R{yourAmount.toFixed(2)}</strong>{event ? "." : " on the night."}
                      </p>
                      {event && <>
                        {pending && <p>Resume your existing checkout.</p>}
                        <details className="year-end-rsvp-dietary">
                          <summary>Dietary requirements</summary>
                          <label>Dietary preference <select className="text-input" value={dietary} disabled={pending} onChange={e=>setDietary(e.target.value)}>
                            {["","Vegetarian","Vegan","Halal","Allergy or other"].map(option=><option key={option} value={option}>{option||"None"}</option>)}
                          </select></label>
                          <label>Notes (optional) <textarea className="text-input" maxLength={240} value={dietaryNotes} disabled={pending} onChange={e=>setDietaryNotes(e.target.value)}/></label>
                        </details>
                        <button type="button" className="primary-btn" onClick={()=>{setPaymentError("");setReviewPayment(true);}} disabled={busy||isFullForNew} style={primaryBtnStyle}>
                          {pending?"Resume payment":yourAmount?"Continue to payment":"Review RSVP"}
                        </button>
                        {reviewPayment&&<ShopPaymentReview title="Year-End Function" context="RSVP"
                          lines={pending?[["Reserved places",booking.amount]]:[["Your place",event.player],...(friends?[[`${friends} guest${friends===1?"":"s"}`,event.guest*friends]]:[])]}
                          total={Math.round(yourAmount*100)} busy={busy} error={paymentError}
                          onBack={()=>setReviewPayment(false)} onPay={()=>handleJoin(true)}/>}
                      </>}

                    </div>
                  )}
                </section>

                {!event && (
                <section
                  style={{
                    borderRadius: "0.9rem",
                    background: "#020617",
                    border: "1px solid rgba(148,163,184,0.35)",
                    marginBottom: "0.7rem",
                    overflow: "hidden",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setPaymentOpen((v) => !v)}
                    style={{
                      width: "100%",
                      padding: "0.6rem 0.85rem",
                      background: "transparent",
                      border: "none",
                      color: "inherit",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontSize: "0.85rem",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>Payment details</span>
                    <span
                      style={{
                        transform: paymentOpen
                          ? "rotate(90deg)"
                          : "rotate(0deg)",
                        transition: "transform 0.15s ease-out",
                        fontSize: "1rem",
                      }}
                    >
                      ▶
                    </span>
                  </button>
                  {paymentOpen && (
                    <div
                      style={{
                        padding: "0 0.85rem 0.75rem",
                        fontSize: "0.84rem",
                      }}
                    >
                      <p style={{ margin: "0.1rem 0" }}>
                        Bank: <strong>FNB</strong>
                      </p>
                      <p style={{ margin: "0.1rem 0" }}>
                        Reference: <strong>KingsYearEnd-YourName</strong>
                        <br />
                        <span style={{ opacity: 0.8 }}>
                          e.g. <em>KingsYearEnd-Nkululeko</em>
                        </span>
                      </p>
                      <p style={{ margin: "0.1rem 0 0.6rem" }}>
                        Acc No: <strong>630 885 137 18</strong>
                      </p>

                      <label
                        style={{
                          display: "block",
                          marginBottom: "0.25rem",
                          fontSize: "0.78rem",
                          opacity: 0.9,
                        }}
                      >
                        POP / reference note (optional)
                      </label>
                      <input
                        type="text"
                        className="text-input"
                        placeholder="e.g. Sent EFT on 27 Nov, ref: KingsYearEnd-Nkululeko"
                        value={popNote}
                        onChange={(e) => setPopNote(e.target.value)}
                      />
                    </div>
                  )}
                </section>

                )}

                {/* Action buttons while editing */}
                <section style={{ marginBottom: "0.6rem" }}>
                  {!event && (existing ? (
                    <>
                      <p style={{ marginTop: 0, fontSize: "0.83rem" }}>
                        You are currently on the list with{" "}
                        <strong>{existing.friends}</strong> friend
                        {existing.friends === 1 ? "" : "s"}.
                      </p>

                      <button
                        className="primary-btn"
                        onClick={handleJoin}
                        style={primaryBtnStyle}
                      >
                        Update my RSVP / POP
                      </button>

                      <button
                        className="secondary-btn"
                        onClick={handleWithdraw}
                        style={{ marginTop: "0.4rem", width: "100%" }}
                      >
                        I can&apos;t make it – withdraw me
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="primary-btn"
                        disabled={isFullForNew}
                        onClick={handleJoin}
                        style={primaryBtnStyle}
                      >
                        Confirm RSVP
                      </button>

                      {isFullForNew && (
                        <p style={{ color: "red", marginTop: "0.4rem" }}>
                          RSVP list full (60 people). You can only withdraw or
                          reduce friends from existing entries.
                        </p>
                      )}
                    </>
                  ))}

                  {!event && error && (
                    <p style={{ color: "red", marginTop: "0.45rem" }}>
                      {error}
                    </p>
                  )}
                </section>
              </>
            )}

            {/* SUMMARY MODE (after saving) */}
            {currentUser && existing && !editing && (
              <section
                style={{
                  padding: "0.75rem 0.85rem",
                  borderRadius: "0.9rem",
                  background: "#020617",
                  border: "1px solid rgba(148,163,184,0.35)",
                  marginBottom: "0.8rem",
                  fontSize: "0.83rem",
                }}
              >
                <p style={{ margin: "0 0 0.35rem" }}>
                  {existing.withdrawn ? (
                    <>
                      You&apos;ve marked yourself as{" "}
                      <strong style={{ color: "#f97373" }}>pulled out</strong>.
                      If your plans change and you can attend, tap below to
                      re-join the list.
                    </>
                  ) : (
                    <>
                      You are currently on the list with{" "}
                      <strong>{existing.friends}</strong> friend
                      {existing.friends === 1 ? "" : "s"}. Your expected amount
                      is{" "}
                      <strong>
                        R
                        {event ? (existing.amount/100).toFixed(2) : playerFee + friendFee * (existing.friends || 0)}
                      </strong>
                      .
                    </>
                  )}
                </p>
                {!event && <button
                  type="button"
                  className="secondary-btn"
                  style={{ width: "100%", marginTop: "0.25rem" }}
                  onClick={() => setEditing(true)}
                >
                  Edit my RSVP / POP
                </button>}
              </section>
            )}

            {/* DIVIDER BEFORE ATTENDEES */}
            <div
              style={{
                margin: "0.9rem 0 0.7rem",
                borderTop: "1px solid rgba(148,163,184,0.4)",
              }}
            />

            {dietaryRequests.length>0&&<details className="year-end-rsvp-dietary"><summary>Dietary requests for organisers</summary>
              {dietaryRequests.map((row,index)=><p key={index}><strong>{row.name}</strong> · {[row.dietary,row.notes].filter(Boolean).join(" · ")}</p>)}
            </details>}
            {/* ATTENDEES LIST */}
            <section>
              <h3 style={{ margin: "0 0 0.4rem" }}>Attendees</h3>
              <p
                style={{
                  margin: "0 0 0.5rem",
                  fontSize: "0.8rem",
                  opacity: 0.8,
                }}
              >
                {event ? "Confirmed bookings appear here." :
                  "Scroll to see the full list. Green tick shows who has marked themselves as paid. Players shown in red/grey have pulled out."}
              </p>

              <ul
                style={{
                  maxHeight: "210px",
                  overflowY: "auto",
                  paddingLeft: 0,
                  margin: 0,
                }}
              >
                {attendees.length === 0 ? (
                  <li style={{ listStyle: "none" }}>
                    <span className="muted small">
                      No RSVPs yet.
                    </span>
                  </li>
                ) : (
                  attendees
                    .slice()
                    // Active first, withdrawn after
                    .sort(
                      (a, b) =>
                        Number(!!a.withdrawn) - Number(!!b.withdrawn)
                    )
                    .map((a, idx) => {
                      const perPlayerAmount =
                        event ? (a.amount/100).toFixed(2) : playerFee + friendFee * (a.friends || 0);
                      const peopleForPlayer = 1 + (a.friends || 0);
                      const isSelf = currentUser && a.name === currentUser;
                      const isWithdrawn = !!a.withdrawn;

                      return (
                        <li
                          key={a.id || a.name}
                          style={{
                            listStyle: "none",
                            padding: "0.45rem 0.55rem",
                            marginBottom: "0.25rem",
                            borderRadius: "0.6rem",
                            background: isWithdrawn ? "#111827" : "#020617",
                            border: isWithdrawn
                              ? "1px dashed rgba(239,68,68,0.6)"
                              : "1px solid rgba(30,64,175,0.35)",
                            opacity: isWithdrawn ? 0.55 : 1,
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.2rem",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.4rem",
                            }}
                          >
                            <strong>{idx + 1}.</strong>{" "}
                            <strong>{a.name}</strong>
                            {isWithdrawn && (
                              <span
                                style={{
                                  color: "#f97373",
                                  fontSize: "0.75rem",
                                }}
                              >
                                (pulled out)
                              </span>
                            )}

                            {/* Paid / checkbox logic */}
                            {event && <span>{a.paid ? "✔ paid" : a.status==="pending" ? "Payment pending" : "Confirmed"}</span>}
                            {!event && !isWithdrawn &&
                              (isSelf || isAdmin ? (
                                <label
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.25rem",
                                    fontSize: "0.8rem",
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={!!a.paid}
                                    onChange={() => togglePaidFromList(a)}
                                  />
                                  <span>
                                    {isSelf
                                      ? "I have paid"
                                      : "Mark as paid"}
                                  </span>
                                </label>
                              ) : (
                                a.paid && (
                                  <span
                                    style={{
                                      color: "#22c55e",
                                      fontSize: "0.8rem",
                                    }}
                                  >
                                    ✔ paid
                                  </span>
                                )
                              ))}

                            {/* ADMIN-ONLY REMOVE BUTTON */}
                            {!event && isAdmin && (
                              <button
                                type="button"
                                className="secondary-btn"
                                onClick={() => handleAdminRemove(a)}
                                style={{
                                  marginLeft: "auto",
                                  padding: "0.15rem 0.45rem",
                                  fontSize: "0.72rem",
                                }}
                              >
                                Admin remove
                              </button>
                            )}
                          </div>

                          <span
                            style={{
                              fontSize: "0.8rem",
                              opacity: 0.9,
                            }}
                          >
                            Friends: <strong>{a.friends || 0}</strong> · Total:{" "}
                            <strong>{peopleForPlayer}</strong> · Amount:{" "}
                            <strong>R{perPlayerAmount}</strong>
                          </span>

                          {a.popNote && (
                            <span
                              style={{
                                fontSize: "0.75rem",
                                opacity: 0.75,
                                display: "block",
                              }}
                            >
                              POP: {a.popNote}
                            </span>
                          )}
                        </li>
                      );
                    })
                )}
              </ul>
            </section>
          </>
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
