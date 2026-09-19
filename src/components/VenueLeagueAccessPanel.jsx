import React, {
  useEffect,
  useMemo,
  useState,
} from "react";
import { doc, getDoc } from "firebase/firestore";
import {
  auth,
  db,
  signInWithGoogle,
} from "../firebaseConfig";
import {
  requestVenueStaffAccess,
  watchVenueStaff,
} from "../storage/leagueVenueRepository.js";

const normalize = (value) =>
  String(value || "").trim();

const normalizeEmail = (value) =>
  normalize(value).toLowerCase();

function clubAdminMatches(club, user) {
  const uid = normalize(user?.uid);
  const email = normalizeEmail(user?.email);

  const allowedUids = [
    club?.createdByUid,
    club?.ownerUid,
    ...(Array.isArray(club?.adminUids)
      ? club.adminUids
      : []),
  ]
    .map(normalize)
    .filter(Boolean);

  const allowedEmails = [
    club?.adminEmail,
    club?.ownerEmail,
    club?.captainEmail,
    club?.createdByEmail,
    club?.createdBy,
    club?.captain?.email,
    ...(Array.isArray(club?.adminEmails)
      ? club.adminEmails
      : []),
    ...(Array.isArray(club?.captainEmails)
      ? club.captainEmails
      : []),
  ]
    .map(normalizeEmail)
    .filter(Boolean);

  return Boolean(
    (uid && allowedUids.includes(uid)) ||
    (email && allowedEmails.includes(email))
  );
}

export default function VenueLeagueAccessPanel({
  venue,
  season,
  onEnter,
  premiumPanelStyle,
  brightPrimaryStyle,
}) {
  const [mode, setMode] = useState("club_rep");
  const [selectedClubId, setSelectedClubId] =
    useState("");
  const [clubPickerOpen, setClubPickerOpen] =
    useState(false);
  const [clubProfiles, setClubProfiles] =
    useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [staffMembers, setStaffMembers] = useState([]);
  const [selectedStaffUid, setSelectedStaffUid] =
    useState("");
  const [joinStaffOpen, setJoinStaffOpen] =
    useState(false);
  const [joinStaffRole, setJoinStaffRole] =
    useState("");
  const [joinFirstName, setJoinFirstName] =
    useState("");
  const [joinSurname, setJoinSurname] =
    useState("");
  const [joinEmail, setJoinEmail] =
    useState("");
  const [joinPhoneNumber, setJoinPhoneNumber] =
    useState("");

  const clubs = useMemo(() => {
    const invitations = Object.values(
      season?.invitations || {}
    );

    return invitations
      .filter((item) =>
        item?.clubId &&
        ["pending", "accepted"].includes(item?.status)
      )
      .map((item) => ({
        id: normalize(item.clubId),
        name: normalize(
          item.clubName || item.clubId
        ),
        status: normalize(item.status),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [season]);

  useEffect(() => {
    let cancelled = false;

    if (!clubs.length) {
      setClubProfiles({});
      return () => {
        cancelled = true;
      };
    }

    Promise.all(
      clubs.map(async (club) => {
        try {
          const snapshot = await getDoc(
            doc(db, "clubs", club.id)
          );

          if (!snapshot.exists()) {
            return [club.id, {}];
          }

          const data = snapshot.data() || {};

          return [
            club.id,
            {
              logoUrl:
                normalize(data?.branding?.logoUrl) ||
                normalize(data?.logoUrl) ||
                normalize(data?.image) ||
                normalize(data?.teamPhoto),
            },
          ];
        } catch {
          return [club.id, {}];
        }
      })
    ).then((entries) => {
      if (!cancelled) {
        setClubProfiles(
          Object.fromEntries(entries)
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [clubs]);

  const selectedClub = useMemo(
    () =>
      clubs.find(
        (club) => club.id === selectedClubId
      ) || null,
    [clubs, selectedClubId]
  );

  useEffect(() => {
    if (!venue?.id || !auth.currentUser?.uid) {
      setStaffMembers([]);
      return undefined;
    }

    return watchVenueStaff(
      venue.id,
      (items) => setStaffMembers(items),
      () => setStaffMembers([])
    );
  }, [venue?.id, status]);

  const selectableStaff = useMemo(() => {
    const items = [...staffMembers];
    const ownerUid = normalize(venue?.ownerUid);

    if (
      ownerUid &&
      !items.some((item) =>
        normalize(item.uid || item.id) === ownerUid
      )
    ) {
      items.unshift({
        uid: ownerUid,
        id: ownerUid,
        name:
          normalize(venue?.createdByName) ||
          "Field administrator",
        role: "field_manager",
        status: "active",
      });
    }

    return items;
  }, [
    staffMembers,
    venue?.ownerUid,
    venue?.createdByName,
  ]);

  async function requestStaffAccess() {
    const firstName = normalize(joinFirstName);
    const surname = normalize(joinSurname);
    const email = normalizeEmail(joinEmail);
    const phoneNumber = normalize(joinPhoneNumber);

    if (!joinStaffRole) {
      setError("Choose your role at this Field before continuing.");
      return;
    }

    if (!firstName) {
      setError("Enter your name.");
      return;
    }

    if (!surname) {
      setError("Enter your surname.");
      return;
    }

    if (
      !email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      setError("Enter a valid email address.");
      return;
    }

    if (
      phoneNumber &&
      phoneNumber.replace(/\D/g, "").length < 7
    ) {
      setError(
        "Enter a valid phone or WhatsApp number."
      );
      return;
    }

    setBusy(true);
    setError("");
    setStatus("Verifying your Google account…");

    try {
      const user = await googleUser();
      const googleEmail = normalizeEmail(user.email);

      if (email !== googleEmail) {
        throw new Error(
          "The email entered must match the Google account used to sign in."
        );
      }

      setStatus("Sending your Field Team request…");

      await requestVenueStaffAccess({
        venueId: venue?.id,
        role: joinStaffRole,
        firstName,
        surname,
        email,
        phoneNumber,
      });

      setStatus(
        "Request sent. A Field administrator must approve it before you can enter as staff."
      );

      setJoinStaffOpen(false);
      setJoinStaffRole("");
      setJoinFirstName("");
      setJoinSurname("");
      setJoinEmail("");
      setJoinPhoneNumber("");
    } catch (requestError) {
      setStatus("");
      setError(
        requestError?.message ||
        "Could not submit your Field Team request."
      );
    } finally {
      setBusy(false);
    }
  }

  function chooseMode(nextMode) {
    setMode(nextMode);
    setError("");
    setStatus("");
  }

  async function googleUser() {
    await signInWithGoogle();

    const user = auth.currentUser;

    if (!user?.uid) {
      throw new Error(
        "Google sign-in did not complete."
      );
    }

    return user;
  }

  async function enterAsClubRep() {
    if (!selectedClubId) {
      setError("Select your club first.");
      return;
    }

    setBusy(true);
    setError("");
    setStatus("Verifying your club administration…");

    try {
      const user = await googleUser();
      const clubSnapshot = await getDoc(
        doc(db, "clubs", selectedClubId)
      );

      if (!clubSnapshot.exists()) {
        throw new Error(
          "The selected club no longer exists."
        );
      }

      const club = {
        id: clubSnapshot.id,
        ...clubSnapshot.data(),
      };

      if (!clubAdminMatches(club, user)) {
        throw new Error(
          "This Gmail account is not registered as an administrator of the selected club."
        );
      }

      const invitation =
        season?.invitations?.[selectedClubId];

      onEnter({
        role: "club_rep",
        actingRole: "club_rep",
        venueId: venue?.id || "",
        venueName: venue?.name || "",
        clubId: selectedClubId,
        clubName:
          invitation?.clubName ||
          club?.name ||
          selectedClubId,
        uid: user.uid,
        email: user.email || "",
        fullName:
          user.displayName ||
          invitation?.clubName ||
          club?.name ||
          "Club representative",
        status: invitation?.status || "invited",
      });
    } catch (signInError) {
      setStatus("");
      setError(
        signInError?.message ||
        "Could not verify this club representative."
      );
    } finally {
      setBusy(false);
    }
  }

  async function enterAsFieldStaff() {
    if (!selectedStaffUid) {
      setError("Select your staff profile first.");
      return;
    }
    setBusy(true);
    setError("");
    setStatus("Verifying your field staff access…");

    try {
      const user = await googleUser();
      const uid = normalize(user.uid);

      if (uid !== normalize(selectedStaffUid)) {
        throw new Error(
          "This Google account does not match the selected Field staff profile."
        );
      }

      const managerUids = [
        venue?.ownerUid,
        venue?.createdByUid,
        ...(Array.isArray(venue?.adminUids)
          ? venue.adminUids
          : []),
      ]
        .map(normalize)
        .filter(Boolean);

      let staffRole = "";
      let staffName = user.displayName || "Field staff";
      let isAdministrator = false;

      const staffSnapshot = await getDoc(
        doc(
          db,
          "leagueVenues",
          venue?.id,
          "staff",
          uid
        )
      );

      if (
        staffSnapshot.exists() &&
        staffSnapshot.data()?.status === "active"
      ) {
        const staff = staffSnapshot.data();

        staffRole =
          normalize(staff.role) || "other_staff";
        staffName =
          normalize(staff.name) || staffName;
        isAdministrator =
          staff.isAdministrator === true;
      } else if (managerUids.includes(uid)) {
        // Compatibility for Fields created before staff records existed.
        staffRole =
          uid === normalize(venue?.ownerUid)
            ? "field_manager"
            : "assistant_manager";
        isAdministrator = true;
      } else {
        throw new Error(
          "This Gmail account is not registered as active field staff."
        );
      }

      onEnter({
        role: staffRole,
        actingRole: staffRole,
        staffRole,
        isAdministrator,
        venueId: venue?.id || "",
        venueName: venue?.name || "",
        uid,
        email: user.email || "",
        fullName: staffName,
        status: "active",
      });
    } catch (signInError) {
      setStatus("");
      setError(
        signInError?.message ||
        "Could not verify field staff access."
      );
    } finally {
      setBusy(false);
    }
  }

  function enterAsSpectator() {
    setError("");
    setStatus("");

    onEnter({
      role: "spectator",
      actingRole: "spectator",
      venueId: venue?.id || "",
      venueName: venue?.name || "",
      clubId: "",
      clubName: "",
      uid: "",
      email: "",
      fullName: "",
      status: "guest",
    });
  }

  const tabs = [
    ["club_rep", "🏟️ Club rep"],
    ["field_staff", "🦺 Field staff"],
    ["spectator", "👁️ Spectator"],
  ];

  return (
    <>
      <section
        className="card"
        style={premiumPanelStyle}
      >
        <h2 style={{ marginBottom: "0.35rem" }}>
          Who are you?
        </h2>

        <div
          className="pill-toggle-group"
          style={{ marginTop: "0.9rem" }}
        >
          {tabs.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={
                "pill-toggle" +
                (mode === value
                  ? " pill-toggle-active"
                  : "")
              }
              onClick={() => chooseMode(value)}
              style={
                mode === value
                  ? {
                      background: "#ffffff",
                      backgroundImage: "none",
                      borderColor:
                        "rgba(255,255,255,0.92)",
                      color: "#020617",
                      WebkitTextFillColor: "#020617",
                    }
                  : {
                      color: "#f8fafc",
                      WebkitTextFillColor: "#f8fafc",
                    }
              }
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {mode === "club_rep" && (
        <section
          className="card"
          style={premiumPanelStyle}
        >
          <span style={{
            display: "inline-flex",
            borderRadius: "999px",
            padding: "0.3rem 0.65rem",
            border:
              "1px solid rgba(56,189,248,0.28)",
            background: "rgba(56,189,248,0.1)",
            color: "#bae6fd",
            fontSize: "0.72rem",
            fontWeight: 800,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}>
            Club entry
          </span>

          <h2 style={{
            marginTop: "0.85rem",
            marginBottom: "0.35rem",
          }}>
            Confirm your club
          </h2>

          <p className="muted small" style={{ marginTop: 0 }}>
            Select your club, then sign in with its registered administrator Gmail account.
          </p>

          <div
            className="field-column"
            style={{ marginTop: "1rem" }}
          >
            <label>Club</label>

            <p className="muted small" style={{
              marginTop: "0.25rem",
            }}>
              {clubs.length
                ? `${clubs.length} invited or participating club${clubs.length === 1 ? "" : "s"}`
                : "No clubs have been invited to this season yet."}
            </p>

            <div
              style={{
                position: "relative",
                zIndex: clubPickerOpen ? 20 : 1,
              }}
            >
              <button
                type="button"
                className="text-input"
                aria-haspopup="listbox"
                aria-expanded={clubPickerOpen}
                onClick={() =>
                  setClubPickerOpen((current) => !current)
                }
                style={{
                  width: "100%",
                  minHeight: "58px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.8rem",
                  padding: "0.55rem 0.75rem",
                  cursor: "pointer",
                  textAlign: "left",
                  borderColor: selectedClub
                    ? "rgba(56,189,248,0.7)"
                    : undefined,
                  boxShadow: selectedClub
                    ? "0 0 0 1px rgba(56,189,248,0.14), 0 12px 28px rgba(2,132,199,0.1)"
                    : undefined,
                }}
              >
                {selectedClub ? (
                  <span style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    minWidth: 0,
                  }}>
                    <span style={{
                      width: "42px",
                      height: "42px",
                      flex: "0 0 42px",
                      borderRadius: "12px",
                      display: "grid",
                      placeItems: "center",
                      overflow: "hidden",
                      border:
                        "1px solid rgba(148,163,184,0.3)",
                      background:
                        "rgba(255,255,255,0.96)",
                    }}>
                      <img
                        src={
                          clubProfiles[selectedClub.id]
                            ?.logoUrl ||
                          "/favicon_nobackground.png"
                        }
                        alt=""
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "contain",
                        }}
                      />
                    </span>

                    <span style={{
                      display: "grid",
                      gap: "0.15rem",
                      minWidth: 0,
                    }}>
                      <strong style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>
                        {selectedClub.name}
                      </strong>

                      <small className="muted">
                        {selectedClub.status === "pending"
                          ? "Invited club"
                          : "Participating club"}
                      </small>
                    </span>
                  </span>
                ) : (
                  <span className="muted">
                    Select your club…
                  </span>
                )}

                <span
                  aria-hidden="true"
                  style={{
                    fontSize: "0.9rem",
                    transform: clubPickerOpen
                      ? "rotate(180deg)"
                      : "rotate(0deg)",
                    transition: "transform 160ms ease",
                  }}
                >
                  ▾
                </span>
              </button>

              {clubPickerOpen && (
                <div
                  role="listbox"
                  aria-label="Invited clubs"
                  style={{
                    position: "relative",
                    width: "100%",
                    marginTop: "0.45rem",
                    display: "grid",
                    gap: "0.35rem",
                    maxHeight: "min(310px, 46vh)",
                    overflowX: "hidden",
                    overflowY: "auto",
                    overscrollBehavior: "contain",
                    WebkitOverflowScrolling: "touch",
                    touchAction: "pan-y",
                    scrollbarGutter: "stable",
                    padding: "0.45rem",
                    borderRadius: "16px",
                    border:
                      "1px solid rgba(56,189,248,0.35)",
                    background:
                      "linear-gradient(180deg, #0f1d33, #07101f)",
                    boxShadow:
                      "0 22px 55px rgba(2,6,23,0.68)",
                  }}
                >
                  {clubs.map((club) => {
                    const selected =
                      club.id === selectedClubId;

                    return (
                      <button
                        key={club.id}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => {
                          setSelectedClubId(club.id);
                          setClubPickerOpen(false);
                          setError("");
                          setStatus("");
                        }}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.75rem",
                          padding: "0.65rem",
                          borderRadius: "12px",
                          border: selected
                            ? "1px solid rgba(56,189,248,0.72)"
                            : "1px solid transparent",
                          background: selected
                            ? "linear-gradient(135deg, rgba(34,211,238,0.2), rgba(99,102,241,0.18))"
                            : "rgba(15,23,42,0.52)",
                          color: "#f8fafc",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <span style={{
                          width: "44px",
                          height: "44px",
                          flex: "0 0 44px",
                          display: "grid",
                          placeItems: "center",
                          overflow: "hidden",
                          borderRadius: "12px",
                          border:
                            "1px solid rgba(148,163,184,0.28)",
                          background:
                            "rgba(255,255,255,0.96)",
                        }}>
                          <img
                            src={
                              clubProfiles[club.id]
                                ?.logoUrl ||
                              "/favicon_nobackground.png"
                            }
                            alt=""
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "contain",
                            }}
                          />
                        </span>

                        <span style={{
                          display: "grid",
                          gap: "0.15rem",
                          flex: 1,
                          minWidth: 0,
                        }}>
                          <strong>
                            {club.name}
                          </strong>

                          <small style={{
                            color: club.status === "pending"
                              ? "#facc15"
                              : "#86efac",
                          }}>
                            {club.status === "pending"
                              ? "Invitation pending"
                              : "Participating"}
                          </small>
                        </span>

                        {selected && (
                          <span
                            aria-label="Selected"
                            style={{
                              color: "#67e8f9",
                              fontWeight: 900,
                            }}
                          >
                            ✓
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            className="primary-btn"
            style={{
              ...brightPrimaryStyle,
              marginTop: "1rem",
            }}
            disabled={busy || !selectedClubId}
            onClick={enterAsClubRep}
          >
            {busy
              ? "Verifying…"
              : "Sign in as club rep"}
          </button>
        </section>
      )}

      {mode === "field_staff" && (
        <section
          className="card"
          style={premiumPanelStyle}
        >
          <span style={{
            display: "inline-flex",
            borderRadius: "999px",
            padding: "0.3rem 0.65rem",
            border:
              "1px solid rgba(56,189,248,0.28)",
            background: "rgba(56,189,248,0.1)",
            color: "#bae6fd",
            fontSize: "0.72rem",
            fontWeight: 800,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}>
            Field staff
          </span>

          <h2 style={{
            marginTop: "0.85rem",
            marginBottom: "0.35rem",
          }}>
            Field staff access
          </h2>

          <p className="muted small" style={{ marginTop: 0 }}>
            Select your registered staff profile, then verify it with your Google account.
          </p>

          <label style={{
            display: "grid",
            gap: "0.45rem",
            marginTop: "1rem",
          }}>
            Registered Field staff
            <select
              value={selectedStaffUid}
              onChange={(event) => {
                setSelectedStaffUid(event.target.value);
                setError("");
                setStatus("");
              }}
              disabled={busy}
            >
              <option value="">
                Select staff profile…
              </option>

              {selectableStaff.map((staff) => (
                <option
                  key={staff.uid || staff.id}
                  value={staff.uid || staff.id}
                >
                  {staff.name || "Field staff"} — {
                    {
                      field_manager: "Field Manager",
                      assistant_manager: "Assistant Manager",
                      field_assistant: "Field Assistant",
                      other_staff: "Other field staff",
                      referee: "Referee",
                    }[staff.role] || "Field staff"
                  }
                </option>
              ))}
            </select>
          </label>

          <div
            className="actions-row"
            style={{ marginTop: "1rem" }}
          >
            <button
              type="button"
              className="primary-btn"
              style={brightPrimaryStyle}
              disabled={busy || !selectedStaffUid}
              onClick={enterAsFieldStaff}
            >
              {busy
                ? "Verifying…"
                : "Enter as Field staff"}
            </button>

            {!joinStaffOpen && (
              <button
                type="button"
                className="secondary-btn join-club-flip-button"
                disabled={busy}
                onClick={() => {
                  setJoinStaffOpen(true);
                  setError("");
                  setStatus("");

                  window.setTimeout(() => {
                    document
                      .getElementById(
                        "field-team-join-request-panel"
                      )
                      ?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      });
                  }, 80);
                }}
              >
                <span className="join-club-flip-button__stage">
                  <span className="join-club-flip-button__face join-club-flip-button__face--front">
                    My name is not on the Field Team list
                  </span>

                  <span className="join-club-flip-button__face join-club-flip-button__face--back">
                    Click to join this Field Team.
                  </span>
                </span>
              </button>
            )}
          </div>

          {joinStaffOpen && (
            <div
              id="field-team-join-request-panel"
              className="entry-join-request-panel"
              style={{
                display: "grid",
                gap: "0.85rem",
                marginTop: "1.25rem",
                padding: "1rem",
                borderRadius: "16px",
                border:
                  "1px solid rgba(56,189,248,0.3)",
                background:
                  "linear-gradient(180deg, rgba(2,132,199,0.12), rgba(15,23,42,0.2))",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.55rem",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={{
                  display: "inline-flex",
                  width: "fit-content",
                  borderRadius: "999px",
                  padding: "0.3rem 0.65rem",
                  border:
                    "1px solid rgba(56,189,248,0.3)",
                  background:
                    "rgba(56,189,248,0.1)",
                  color: "#bae6fd",
                  fontSize: "0.72rem",
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}>
                  Field Team join request
                </span>

                <button
                  type="button"
                  className="secondary-btn entry-join-request-close"
                  disabled={busy}
                  onClick={() => {
                    setJoinStaffOpen(false);
                    setError("");
                    setStatus("");
                  }}
                >
                  Close
                </button>
              </div>

              <h3 style={{
                marginTop: "0.15rem",
                marginBottom: 0,
              }}>
                Request to join the Field Team
              </h3>

              <p
                className="muted small"
                style={{ margin: 0 }}
              >
                Add your details and select your real role at this Field.
                Your request will be reviewed by a permanent Field official.
              </p>

              <label
                className="field-column"
                style={{
                  padding: "0.9rem",
                  borderRadius: "14px",
                  border: joinStaffRole
                    ? "1px solid rgba(56,189,248,0.58)"
                    : "1px solid rgba(250,204,21,0.5)",
                  background: joinStaffRole
                    ? "linear-gradient(135deg, rgba(14,165,233,0.13), rgba(99,102,241,0.1))"
                    : "rgba(250,204,21,0.07)",
                  boxShadow: joinStaffRole
                    ? "0 12px 30px rgba(2,132,199,0.08)"
                    : "none",
                }}
              >
                <span style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                }}>
                  <strong>
                    1. Choose your role at this Field
                  </strong>

                  <small style={{
                    color: joinStaffRole
                      ? "#86efac"
                      : "#fde68a",
                    fontWeight: 800,
                  }}>
                    {joinStaffRole
                      ? "Selected ✓"
                      : "Required"}
                  </small>
                </span>

                <select
                  required
                  value={joinStaffRole}
                  onChange={(event) =>
                    setJoinStaffRole(event.target.value)
                  }
                  disabled={busy}
                  style={{
                    marginTop: "0.35rem",
                    borderColor: joinStaffRole
                      ? "rgba(56,189,248,0.7)"
                      : "rgba(250,204,21,0.65)",
                  }}
                >
                  <option value="">
                    Select your role…
                  </option>

                  <option value="field_manager">
                    Field Manager
                  </option>

                  <option value="assistant_manager">
                    Assistant Manager
                  </option>

                  <option value="field_assistant">
                    Field Assistant
                  </option>

                  <option value="other_staff">
                    Other field staff
                  </option>

                  <option value="referee">
                    Referee
                  </option>
                </select>

                {!joinStaffRole && (
                  <span style={{
                    color: "#fde68a",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    marginTop: "0.2rem",
                  }}>
                    Select one role before continuing.
                  </span>
                )}
              </label>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "0.75rem",
                }}
              >
                <label className="field-column">
                  <span>Name</span>
                  <input
                    type="text"
                    className="text-input"
                    placeholder="e.g. Nkululeko"
                    value={joinFirstName}
                    onChange={(event) =>
                      setJoinFirstName(event.target.value)
                    }
                    autoComplete="given-name"
                    disabled={busy}
                  />
                </label>

                <label className="field-column">
                  <span>Surname</span>
                  <input
                    type="text"
                    className="text-input"
                    placeholder="e.g. Memela"
                    value={joinSurname}
                    onChange={(event) =>
                      setJoinSurname(event.target.value)
                    }
                    autoComplete="family-name"
                    disabled={busy}
                  />
                </label>
              </div>

              <label className="field-column">
                <span>Email address</span>
                <input
                  type="email"
                  className="text-input"
                  placeholder="e.g. yourname@gmail.com"
                  value={joinEmail}
                  onChange={(event) =>
                    setJoinEmail(event.target.value)
                  }
                  autoComplete="email"
                  disabled={busy}
                />
              </label>

              <label className="field-column">
                <span>
                  Phone or WhatsApp number (optional)
                </span>
                <input
                  type="tel"
                  className="text-input"
                  placeholder="e.g. 0821234567 or +27821234567"
                  value={joinPhoneNumber}
                  onChange={(event) =>
                    setJoinPhoneNumber(event.target.value)
                  }
                  autoComplete="tel"
                  disabled={busy}
                />

                <span className="muted small">
                  Used only for Field Team communication and updates.
                </span>
              </label>



              <button
                type="button"
                className="primary-btn"
                style={{
                  ...brightPrimaryStyle,
                  marginTop: "0.25rem",
                }}
                disabled={busy}
                onClick={requestStaffAccess}
              >
                {busy
                  ? "Sending request…"
                  : !joinStaffRole
                  ? "Choose a role to continue"
                  : "Request to join the Field Team"}
              </button>
            </div>
          )}
        </section>
      )}

      {mode === "spectator" && (
        <section
          className="card"
          style={premiumPanelStyle}
        >
          <span style={{
            display: "inline-flex",
            borderRadius: "999px",
            padding: "0.3rem 0.65rem",
            border:
              "1px solid rgba(148,163,184,0.28)",
            background: "rgba(148,163,184,0.1)",
            color: "#e2e8f0",
            fontSize: "0.72rem",
            fontWeight: 800,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}>
            Spectator
          </span>

          <h2 style={{
            marginTop: "0.85rem",
            marginBottom: "0.35rem",
          }}>
            Spectator access
          </h2>

          <p className="muted" style={{ marginTop: 0 }}>
            Browse the league without signing in.
          </p>

          <button
            type="button"
            className="primary-btn"
            style={{
              ...brightPrimaryStyle,
              marginTop: "1rem",
            }}
            onClick={enterAsSpectator}
          >
            Continue as spectator
          </button>
        </section>
      )}

      {error && (
        <p className="error-text">{error}</p>
      )}

      {status && (
        <p className="success-text">{status}</p>
      )}
    </>
  );
}
