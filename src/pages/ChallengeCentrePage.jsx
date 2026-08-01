import React, { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "../firebaseConfig.js";
import "../styles/ChallengeCentrePage.css";

const SUPER_ADMIN_EMAILS = ["nkululekolerato@gmail.com"];

function cleanText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeEmail(value) {
  return cleanText(value).toLowerCase();
}

function getClubAdminEmails(club = {}) {
  return [
    club?.createdBy,
    club?.createdByEmail,
    club?.ownerEmail,
    club?.adminEmail,
    club?.captainEmail,
    club?.captain?.email,
    ...(Array.isArray(club?.adminEmails) ? club.adminEmails : []),
    ...(Array.isArray(club?.captainEmails) ? club.captainEmails : []),
  ]
    .map(normalizeEmail)
    .filter(Boolean);
}

function fixtureStatus(fixture = {}) {
  return cleanText(
    fixture?.matchStatus ||
      fixture?.status ||
      fixture?.fixtureStatus
  ).toLowerCase();
}

function isCompletedFixture(fixture = {}) {
  return [
    "completed",
    "complete",
    "finished",
    "full_time",
    "full-time",
    "final",
    "result_recorded",
  ].includes(fixtureStatus(fixture));
}

function isRequestFixture(fixture = {}) {
  return [
    "pending",
    "change_requested",
    "change-requested",
    "awaiting_confirmation",
    "awaiting-confirmation",
  ].includes(fixtureStatus(fixture));
}

function isLiveFixture(fixture = {}) {
  return [
    "live",
    "started",
    "in_progress",
    "in-progress",
  ].includes(fixtureStatus(fixture));
}

function fixtureTimestamp(fixture = {}) {
  const date = cleanText(
    fixture?.confirmedDate ||
      fixture?.proposedDate ||
      fixture?.matchDate
  );

  const kickoff = cleanText(
    fixture?.confirmedKickoff ||
      fixture?.proposedKickoff ||
      fixture?.kickoff,
    "00:00"
  );

  if (!date) {
    return Number(fixture?.createdAtMs || fixture?.updatedAtMs || 0);
  }

  const parsed = new Date(`${date}T${kickoff}`);

  return Number.isNaN(parsed.getTime())
    ? Number(fixture?.createdAtMs || fixture?.updatedAtMs || 0)
    : parsed.getTime();
}

function formatFixtureDate(fixture = {}) {
  const date = cleanText(
    fixture?.confirmedDate ||
      fixture?.proposedDate ||
      fixture?.matchDate
  );

  if (!date) return "Date to be confirmed";

  const parsed = new Date(`${date}T12:00:00`);

  if (Number.isNaN(parsed.getTime())) return date;

  return parsed.toLocaleDateString("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatFixtureTime(fixture = {}) {
  return cleanText(
    fixture?.confirmedKickoff ||
      fixture?.proposedKickoff ||
      fixture?.kickoff,
    "Time to be confirmed"
  );
}

function clubInitials(name = "") {
  return cleanText(name, "Football Club")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function challengePlayersPerSide(format = "") {
  const value = String(format || "").trim().toUpperCase();

  if (["11V11", "11_V_11", "11_ASIDE"].includes(value)) return 11;
  if (["7V7", "7_V_7", "7_ASIDE"].includes(value)) return 7;
  if (["6V6", "6_V_6", "6_ASIDE"].includes(value)) return 6;
  return 5;
}

function challengeFormatLabel(format = "") {
  const players = challengePlayersPerSide(format);
  return `${players} v ${players}`;
}

function fixtureClubAccepted(fixture = {}, side = "home") {
  const prefix = side === "away" ? "away" : "home";
  const clubId = fixture?.[`${prefix}ClubId`];

  return Boolean(
    fixture?.[`${prefix}Accepted`] ||
      fixture?.[`${prefix}ClubAccepted`] ||
      fixture?.responses?.[clubId] === "accepted" ||
      fixture?.acceptedClubIds?.includes?.(clubId) ||
      ["accepted", "confirmed", "live"].includes(fixtureStatus(fixture)) ||
      isCompletedFixture(fixture)
  );
}

function fixtureSquadCount(fixture = {}, side = "home") {
  const prefix = side === "away" ? "away" : "home";
  const clubId = fixture?.[`${prefix}ClubId`];

  const possibleLists = [
    fixture?.[`${prefix}SignedUpPlayers`],
    fixture?.[`${prefix}Squad`],
    fixture?.[`${prefix}Players`],
    fixture?.teamsheets?.[clubId]?.players,
    fixture?.squads?.[clubId]?.players,
  ];

  const list = possibleLists.find(Array.isArray);

  if (list) return list.length;

  return Number(
    fixture?.[`${prefix}SquadCount`] ||
      fixture?.[`${prefix}SignupCount`] ||
      fixture?.signupCounts?.[clubId] ||
      0
  );
}

function fixtureRefereeName(fixture = {}) {
  return cleanText(
    fixture?.appointedRefereeName ||
      fixture?.refereeName ||
      fixture?.referee?.name ||
      fixture?.officials?.referee?.name
  );
}

function fixtureRefereeEmail(fixture = {}) {
  return cleanText(
    fixture?.appointedRefereeEmail ||
      fixture?.refereeEmail ||
      fixture?.referee?.email ||
      fixture?.officials?.referee?.email
  );
}


/* FANM PLATFORM PAIRING HELPERS */

function challengeClubName(club = {}) {
  return cleanText(
    club?.clubName ||
      club?.name ||
      club?.displayName ||
      club?.shortName,
    "Unnamed club"
  );
}

function challengeClubLogo(club = {}) {
  return cleanText(
    club?.logoUrl ||
      club?.clubLogoUrl ||
      club?.image ||
      club?.badgeUrl
  );
}

function tomorrowDateValue() {
  const value = new Date();
  value.setDate(value.getDate() + 1);
  return value.toISOString().slice(0, 10);
}

function freshPairingDraft() {
  return {
    homeClubId: "",
    awayClubId: "",
    format: "5v5",
    proposedDate: tomorrowDateValue(),
    proposedKickoff: "18:30",
    venue: "",
    message: "",
  };
}

function ClubBadge({ name, logo }) {
  return (
    <span className="challenge-workspace-fixture__badge">
      {logo ? (
        <img src={logo} alt="" />
      ) : (
        <strong>{clubInitials(name)}</strong>
      )}
    </span>
  );
}

export default function ChallengeCentrePage({
  identity = null,
  onBack,
  onOpenFixture,
  onOpenMatchControl,
  onOpenMatchReport,
}) {
  const [currentUser, setCurrentUser] = useState(null);
  const [clubs, setClubs] = useState([]);
  const [fixtures, setFixtures] = useState([]);
  const [activeView, setActiveView] = useState("upcoming");
  const [selectedFixtureId, setSelectedFixtureId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showPairClubsModal, setShowPairClubsModal] = useState(false);
  const [pairingDraft, setPairingDraft] = useState(
    freshPairingDraft
  );
  const [pairingSaving, setPairingSaving] = useState(false);
  const [pairingError, setPairingError] = useState("");
  const [pairingSuccess, setPairingSuccess] = useState("");


  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setCurrentUser(user || null);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadCentreData() {
      try {
        setLoading(true);
        setError("");

        const [clubsSnap, fixturesSnap] = await Promise.all([
          getDocs(collection(db, "clubs")),
          getDocs(collection(db, "clubChallengeFixtures")),
        ]);

        if (cancelled) return;

        const loadedClubs = clubsSnap.docs.map(
          (clubDoc) => ({
            id: clubDoc.id,
            ...clubDoc.data(),
          })
        );

        const loadedFixtures = fixturesSnap.docs.map(
          (fixtureDoc) => ({
            id: fixtureDoc.id,
            ...fixtureDoc.data(),
          })
        );

        const currentEmail = normalizeEmail(
          auth.currentUser?.email
        );

        const canRepairPlatformPairings =
          SUPER_ADMIN_EMAILS.includes(currentEmail);

        const prematurePlatformFixtures =
          canRepairPlatformPairings
            ? loadedFixtures.filter((fixture) => {
                const source = cleanText(fixture?.source);
                const status = fixtureStatus(fixture);

                const homeAccepted = Boolean(
                  fixture?.homeAccepted ||
                  fixture?.responses?.[fixture?.homeClubId] ===
                    "accepted"
                );

                const awayAccepted = Boolean(
                  fixture?.awayAccepted ||
                  fixture?.responses?.[fixture?.awayClubId] ===
                    "accepted"
                );

                return (
                  source === "platform_pairing" &&
                  ["awaiting_responses", "pending"].includes(status) &&
                  !(homeAccepted && awayAccepted)
                );
              })
            : [];

        if (prematurePlatformFixtures.length) {
          const repairBatch = writeBatch(db);

          prematurePlatformFixtures.forEach((fixture) => {
            const fixtureId = cleanText(
              fixture?.fixtureId || fixture?.id
            );

            const pairingId = cleanText(
              fixture?.platformPairingId ||
              fixture?.challengeId ||
              fixtureId.replace(/^challenge_/, ""),
              `platform_pairing_${Date.now()}`
            );

            const homeClubId = cleanText(fixture?.homeClubId);
            const awayClubId = cleanText(fixture?.awayClubId);

            if (!fixtureId || !homeClubId || !awayClubId) {
              return;
            }

            const pendingPayload = {
              ...fixture,

              challengeId: pairingId,
              platformPairingId: pairingId,

              source: "platform_pairing",
              platformInstigated: true,

              status: "pending",
              fixtureStatus: "awaiting_both_clubs",

              challengerClubId: homeClubId,
              challengerClubName:
                fixture?.homeClubName || "Home Club",
              challengerClubLogo:
                fixture?.homeClubLogo || "",

              targetClubId: awayClubId,
              targetClubName:
                fixture?.awayClubName || "Away Club",
              targetClubLogo:
                fixture?.awayClubLogo || "",

              homeAccepted: false,
              awayAccepted: false,
              acceptedClubIds: [],

              responses: {
                [homeClubId]: "pending",
                [awayClubId]: "pending",
              },

              repairedFromPrematureFixture: true,
              repairedAt: serverTimestamp(),
              repairedAtMs: Date.now(),

              updatedAt: serverTimestamp(),
              updatedAtMs: Date.now(),
            };

            repairBatch.set(
              doc(db, "clubChallenges", pairingId),
              pendingPayload,
              { merge: true }
            );

            repairBatch.set(
              doc(
                db,
                "clubs",
                homeClubId,
                "incomingChallenges",
                pairingId
              ),
              {
                ...pendingPayload,
                receivingClubId: homeClubId,
                opponentClubId: awayClubId,
                opponentClubName:
                  fixture?.awayClubName || "Away Club",
                opponentClubLogo:
                  fixture?.awayClubLogo || "",
              },
              { merge: true }
            );

            repairBatch.set(
              doc(
                db,
                "clubs",
                awayClubId,
                "incomingChallenges",
                pairingId
              ),
              {
                ...pendingPayload,
                receivingClubId: awayClubId,
                opponentClubId: homeClubId,
                opponentClubName:
                  fixture?.homeClubName || "Home Club",
                opponentClubLogo:
                  fixture?.homeClubLogo || "",
              },
              { merge: true }
            );

            repairBatch.delete(
              doc(db, "clubChallengeFixtures", fixtureId)
            );

            repairBatch.delete(
              doc(
                db,
                "clubs",
                homeClubId,
                "fixtures",
                fixtureId
              )
            );

            repairBatch.delete(
              doc(
                db,
                "clubs",
                awayClubId,
                "fixtures",
                fixtureId
              )
            );
          });

          await repairBatch.commit();
        }

        const prematureIds = new Set(
          prematurePlatformFixtures.map((fixture) =>
            String(fixture?.fixtureId || fixture?.id)
          )
        );

        setClubs(loadedClubs);

        setFixtures(
          loadedFixtures.filter(
            (fixture) =>
              !prematureIds.has(
                String(fixture?.fixtureId || fixture?.id)
              )
          )
        );
      } catch (loadError) {
        console.error(
          "[ChallengeCentrePage] Could not load challenge centre:",
          loadError
        );

        if (!cancelled) {
          setError("Challenge fixtures could not be loaded right now.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadCentreData();

    return () => {
      cancelled = true;
    };
  }, []);


  /* FANM PLATFORM PAIRING ACTIONS */

  const openPairClubsModal = () => {
    setPairingDraft(freshPairingDraft());
    setPairingError("");
    setPairingSuccess("");
    setShowPairClubsModal(true);
  };

  const closePairClubsModal = () => {
    if (pairingSaving) return;
    setShowPairClubsModal(false);
    setPairingError("");
    setPairingSuccess("");
  };

  const updatePairingDraft = (field, value) => {
    setPairingDraft((current) => ({
      ...current,
      [field]: value,
    }));

    setPairingError("");
    setPairingSuccess("");
  };

  const createPlatformPairedFixture = async () => {
    if (!isPlatformAdmin || pairingSaving) return;

    const homeClubId = cleanText(pairingDraft.homeClubId);
    const awayClubId = cleanText(pairingDraft.awayClubId);
    const proposedDate = cleanText(pairingDraft.proposedDate);
    const proposedKickoff = cleanText(
      pairingDraft.proposedKickoff
    );
    const venue = cleanText(pairingDraft.venue);
    const format = cleanText(pairingDraft.format, "5v5");

    if (!homeClubId || !awayClubId) {
      setPairingError("Select both participating clubs.");
      return;
    }

    if (homeClubId === awayClubId) {
      setPairingError(
        "The home and away club must be different."
      );
      return;
    }

    if (!proposedDate || !proposedKickoff || !venue) {
      setPairingError(
        "Complete the date, kickoff time and venue."
      );
      return;
    }

    const homeClub = clubs.find(
      (club) =>
        String(club?.id || club?.clubId) ===
        String(homeClubId)
    );

    const awayClub = clubs.find(
      (club) =>
        String(club?.id || club?.clubId) ===
        String(awayClubId)
    );

    if (!homeClub || !awayClub) {
      setPairingError(
        "One of the selected clubs could not be found."
      );
      return;
    }

    const nowMs = Date.now();
    const pairingId = `platform_pairing_${nowMs}`;

    const homeClubName = challengeClubName(homeClub);
    const awayClubName = challengeClubName(awayClub);

    const homeClubLogo = challengeClubLogo(homeClub);
    const awayClubLogo = challengeClubLogo(awayClub);

    const basePayload = {
      challengeId: pairingId,
      platformPairingId: pairingId,

      source: "platform_pairing",
      platformInstigated: true,

      status: "pending",
      fixtureStatus: "awaiting_both_clubs",

      challengerClubId: homeClubId,
      challengerClubName: homeClubName,
      challengerClubLogo: homeClubLogo,

      targetClubId: awayClubId,
      targetClubName: awayClubName,
      targetClubLogo: awayClubLogo,

      homeClubId,
      homeClubName,
      homeClubLogo,

      awayClubId,
      awayClubName,
      awayClubLogo,

      participatingClubIds: [
        homeClubId,
        awayClubId,
      ],

      format,
      proposedDate,
      proposedKickoff,
      venue,

      message: cleanText(pairingDraft.message),

      homeAccepted: false,
      awayAccepted: false,
      acceptedClubIds: [],

      responses: {
        [homeClubId]: "pending",
        [awayClubId]: "pending",
      },

      createdByRole: "platform_admin",
      createdByEmail: normalizeEmail(currentUser?.email),
      createdByName: cleanText(
        currentUser?.displayName,
        "5 Asides Near Me Admin"
      ),

      createdAt: serverTimestamp(),
      createdAtMs: nowMs,

      updatedAt: serverTimestamp(),
      updatedAtMs: nowMs,
    };

    const homeIncomingPayload = {
      ...basePayload,

      receivingClubId: homeClubId,
      receivingClubName: homeClubName,

      opponentClubId: awayClubId,
      opponentClubName: awayClubName,
      opponentClubLogo: awayClubLogo,

      popupTitle: "5 Asides Near Me Club Challenge",
      popupMessage:
        `5 Asides Near Me has paired ${homeClubName} ` +
        `with ${awayClubName}.`,
    };

    const awayIncomingPayload = {
      ...basePayload,

      receivingClubId: awayClubId,
      receivingClubName: awayClubName,

      opponentClubId: homeClubId,
      opponentClubName: homeClubName,
      opponentClubLogo: homeClubLogo,

      popupTitle: "5 Asides Near Me Club Challenge",
      popupMessage:
        `5 Asides Near Me has paired ${awayClubName} ` +
        `with ${homeClubName}.`,
    };

    try {
      setPairingSaving(true);
      setPairingError("");
      setPairingSuccess("");

      const batch = writeBatch(db);

      // One central pending challenge record.
      batch.set(
        doc(db, "clubChallenges", pairingId),
        basePayload,
        { merge: true }
      );

      // Premium popup request for the home club.
      batch.set(
        doc(
          db,
          "clubs",
          homeClubId,
          "incomingChallenges",
          pairingId
        ),
        homeIncomingPayload,
        { merge: true }
      );

      // Premium popup request for the away club.
      batch.set(
        doc(
          db,
          "clubs",
          awayClubId,
          "incomingChallenges",
          pairingId
        ),
        awayIncomingPayload,
        { merge: true }
      );

      await batch.commit();

      setActiveView("requests");

      setPairingSuccess(
        `Premium challenge invitations were sent to ` +
        `${homeClubName} and ${awayClubName}.`
      );

      window.setTimeout(() => {
        setShowPairClubsModal(false);
        setPairingSuccess("");
      }, 1200);
    } catch (createError) {
      console.error(
        "[ChallengeCentrePage] Could not send pairing:",
        createError
      );

      setPairingError(
        "The challenge invitations could not be sent."
      );
    } finally {
      setPairingSaving(false);
    }
  };

  const isPlatformAdmin = SUPER_ADMIN_EMAILS.includes(
    normalizeEmail(currentUser?.email)
  );

  const managedClubIds = useMemo(() => {
    const ids = new Set();
    const email = normalizeEmail(currentUser?.email);

    [identity?.clubId, identity?.homeClubId, identity?.activeClubId]
      .map(cleanText)
      .filter(Boolean)
      .forEach((clubId) => ids.add(clubId));

    clubs.forEach((club) => {
      if (
        isPlatformAdmin ||
        (email && getClubAdminEmails(club).includes(email))
      ) {
        const clubId = cleanText(club?.id || club?.clubId);
        if (clubId) ids.add(clubId);
      }
    });

    return Array.from(ids);
  }, [
    clubs,
    currentUser?.email,
    identity?.clubId,
    identity?.homeClubId,
    identity?.activeClubId,
    isPlatformAdmin,
  ]);

  const relevantFixtures = useMemo(() => {
    if (isPlatformAdmin) return fixtures;

    const managedIds = new Set(managedClubIds.map(String));

    return fixtures.filter((fixture) => {
      const participantIds = [
        fixture?.homeClubId,
        fixture?.awayClubId,
        ...(Array.isArray(fixture?.participatingClubIds)
          ? fixture.participatingClubIds
          : []),
      ]
        .map(cleanText)
        .filter(Boolean);

      return participantIds.some((clubId) => managedIds.has(clubId));
    });
  }, [fixtures, managedClubIds, isPlatformAdmin]);

  const counts = useMemo(() => {
    return relevantFixtures.reduce(
      (result, fixture) => {
        if (isCompletedFixture(fixture)) {
          result.results += 1;
        } else if (isRequestFixture(fixture)) {
          result.requests += 1;
        } else {
          result.upcoming += 1;
        }

        if (isLiveFixture(fixture)) result.live += 1;

        return result;
      },
      { upcoming: 0, requests: 0, results: 0, live: 0 }
    );
  }, [relevantFixtures]);

  const visibleFixtures = useMemo(() => {
    return relevantFixtures
      .filter((fixture) => {
        if (activeView === "results") return isCompletedFixture(fixture);
        if (activeView === "requests") return isRequestFixture(fixture);

        return (
          !isCompletedFixture(fixture) &&
          !isRequestFixture(fixture)
        );
      })
      .sort((a, b) => {
        const timeA = fixtureTimestamp(a);
        const timeB = fixtureTimestamp(b);

        return activeView === "results"
          ? timeB - timeA
          : timeA - timeB;
      });
  }, [relevantFixtures, activeView]);

  const selectedFixture = useMemo(() => {
    return (
      visibleFixtures.find(
        (fixture) =>
          String(fixture?.fixtureId || fixture?.id) ===
          String(selectedFixtureId)
      ) ||
      visibleFixtures[0] ||
      null
    );
  }, [visibleFixtures, selectedFixtureId]);

  useEffect(() => {
    if (!visibleFixtures.length) {
      setSelectedFixtureId("");
      return;
    }

    const currentExists = visibleFixtures.some(
      (fixture) =>
        String(fixture?.fixtureId || fixture?.id) ===
        String(selectedFixtureId)
    );

    if (!currentExists) {
      setSelectedFixtureId(
        String(
          visibleFixtures[0]?.fixtureId ||
            visibleFixtures[0]?.id ||
            ""
        )
      );
    }
  }, [visibleFixtures, selectedFixtureId]);

  const requiredPlayers = challengePlayersPerSide(
    selectedFixture?.format || selectedFixture?.gameFormat
  );

  const homeAccepted = fixtureClubAccepted(selectedFixture, "home");
  const awayAccepted = fixtureClubAccepted(selectedFixture, "away");

  const homeSquadCount = fixtureSquadCount(selectedFixture, "home");
  const awaySquadCount = fixtureSquadCount(selectedFixture, "away");

  const homeSquadReady = homeSquadCount >= requiredPlayers;
  const awaySquadReady = awaySquadCount >= requiredPlayers;

  const refereeName = fixtureRefereeName(selectedFixture);
  const refereeEmail = fixtureRefereeEmail(selectedFixture);
  const refereeReady = Boolean(refereeEmail);

  const fixtureReady =
    Boolean(selectedFixture) &&
    homeAccepted &&
    awayAccepted &&
    homeSquadReady &&
    awaySquadReady;

  const fixtureLive = isLiveFixture(selectedFixture);
  const fixtureComplete = isCompletedFixture(selectedFixture);

  const homeName = cleanText(
    selectedFixture?.homeClubName ||
      selectedFixture?.challengerClubName,
    "Home Club"
  );

  const awayName = cleanText(
    selectedFixture?.awayClubName ||
      selectedFixture?.targetClubName,
    "Away Club"
  );

  const homeScore = Number.isFinite(Number(selectedFixture?.homeScore))
    ? Number(selectedFixture.homeScore)
    : 0;

  const awayScore = Number.isFinite(Number(selectedFixture?.awayScore))
    ? Number(selectedFixture.awayScore)
    : 0;

  return (
    <main className="challenge-ops-page">
      <div className="challenge-ops-layout">
        <aside className="challenge-ops-sidebar">
          <div className="challenge-ops-brand">
            <span>⚔</span>
            <div>
              <strong>Challenge Centre</strong>
              <small>Interclub football</small>
            </div>
          </div>

          <nav className="challenge-ops-nav">
            {[
              ["upcoming", "📅", "Upcoming", counts.upcoming],
              ["requests", "📨", "Requests", counts.requests],
              ["results", "🏆", "Results", counts.results],
            ].map(([value, icon, label, count]) => (
              <button
                key={value}
                type="button"
                className={activeView === value ? "is-active" : ""}
                onClick={() => setActiveView(value)}
              >
                <span>{icon}</span>
                <strong>{label}</strong>
                <em>{count}</em>
              </button>
            ))}
          </nav>

          <div className="challenge-ops-sidebar__line" />

          <button
            type="button"
            className="challenge-ops-sidebar__utility"
            disabled
          >
            <span>💬</span>
            <strong>Fixture chats</strong>
          </button>

          <button
            type="button"
            className="challenge-ops-sidebar__utility"
            disabled
          >
            <span>🧑‍⚖️</span>
            <strong>Referee directory</strong>
          </button>

          <div className="challenge-ops-sidebar__summary">
            <span>
              <small>Managed clubs</small>
              <strong>{managedClubIds.length}</strong>
            </span>
            <span>
              <small>Live now</small>
              <strong>{counts.live}</strong>
            </span>
          </div>
        </aside>

        <section className="challenge-ops-main">
          <header className="challenge-ops-topbar">
            <button type="button" onClick={onBack}>
              ← Home
            </button>
            <span>5 Asides Near Me</span>
          </header>

          <section className="challenge-ops-heading">
            <div>
              <span className="challenge-ops-kicker">
                Interclub operations
              </span>
              <h1>
                {activeView === "requests"
                  ? "Challenge requests"
                  : activeView === "results"
                    ? "Match results"
                    : "Fixture control"}
              </h1>
              <p>
                Pair clubs, monitor readiness and launch official
                interclub matches.
              </p>
            </div>

            {isPlatformAdmin ? (
              <button
                type="button"
                className="challenge-ops-pair"
                onClick={openPairClubsModal}
              >
                <span>＋</span>
                Pair Two Clubs
              </button>
            ) : null}
          </section>

          {loading ? (
            <section className="challenge-ops-panel challenge-ops-state">
              <span className="challenge-ops-spinner" />
              <strong>Loading interclub operations...</strong>
            </section>
          ) : error ? (
            <section className="challenge-ops-panel challenge-ops-state">
              <span>⚠</span>
              <strong>{error}</strong>
            </section>
          ) : !currentUser ? (
            <section className="challenge-ops-panel challenge-ops-state">
              <span>🔐</span>
              <strong>Sign in to access the Challenge Centre.</strong>
            </section>
          ) : !selectedFixture ? (
            <section className="challenge-ops-panel challenge-ops-empty">
              <div className="challenge-ops-empty__icon">⚽</div>
              <h2>
                {activeView === "results"
                  ? "No completed interclub matches yet"
                  : activeView === "requests"
                    ? "No challenge requests need attention"
                    : "No interclub fixture selected"}
              </h2>
              <p>
                {activeView === "upcoming"
                  ? "Pair two clubs to begin. Both clubs will receive the existing challenge notification and can accept or reject."
                  : "Relevant records will appear here automatically."}
              </p>

              {activeView === "upcoming" && isPlatformAdmin ? (
                <button
                  type="button"
                  onClick={openPairClubsModal}
                >
                  Pair Two Clubs <span>→</span>
                </button>
              ) : null}
            </section>
          ) : (
            <>
              <section className="challenge-ops-fixture-header">
                <div className="challenge-ops-fixture-header__club">
                  <ClubBadge
                    name={homeName}
                    logo={
                      selectedFixture?.homeClubLogo ||
                      selectedFixture?.challengerClubLogo
                    }
                  />
                  <span>
                    <small>Home club</small>
                    <strong>{homeName}</strong>
                  </span>
                </div>

                <div className="challenge-ops-fixture-header__centre">
                  <span>
                    {challengeFormatLabel(
                      selectedFixture?.format ||
                        selectedFixture?.gameFormat
                    )}
                  </span>
                  <strong>
                    {fixtureLive || fixtureComplete
                      ? `${homeScore} – ${awayScore}`
                      : "VS"}
                  </strong>
                  <small>
                    {formatFixtureDate(selectedFixture)} •{" "}
                    {formatFixtureTime(selectedFixture)}
                  </small>
                </div>

                <div className="challenge-ops-fixture-header__club">
                  <ClubBadge
                    name={awayName}
                    logo={
                      selectedFixture?.awayClubLogo ||
                      selectedFixture?.targetClubLogo
                    }
                  />
                  <span>
                    <small>Away club</small>
                    <strong>{awayName}</strong>
                  </span>
                </div>
              </section>

              <section className="challenge-readiness-strip">
                <div className="challenge-readiness-strip__header">
                  <div>
                    <small>Fixture readiness</small>
                    <h2>Kickoff preparation</h2>
                  </div>

                  <span
                    className={`challenge-ready-pill${
                      fixtureReady ? " is-ready" : " is-waiting"
                    }`}
                  >
                    {fixtureReady
                      ? "✓ Ready for kickoff"
                      : "Preparation in progress"}
                  </span>
                </div>

                <div className="challenge-readiness-grid">
                  {[
                    {
                      key: "home-accepted",
                      label: `${homeName} accepted`,
                      text: homeAccepted ? "Accepted" : "Awaiting response",
                      current: homeAccepted ? 1 : 0,
                      required: 1,
                    },
                    {
                      key: "away-accepted",
                      label: `${awayName} accepted`,
                      text: awayAccepted ? "Accepted" : "Awaiting response",
                      current: awayAccepted ? 1 : 0,
                      required: 1,
                    },
                    {
                      key: "home-squad",
                      label: `${homeName} squad`,
                      text: `${homeSquadCount}/${requiredPlayers} players`,
                      current: homeSquadCount,
                      required: requiredPlayers,
                    },
                    {
                      key: "away-squad",
                      label: `${awayName} squad`,
                      text: `${awaySquadCount}/${requiredPlayers} players`,
                      current: awaySquadCount,
                      required: requiredPlayers,
                    },
                  ].map((item) => {
                    const complete = item.current >= item.required;

                    const percentage = Math.min(
                      100,
                      Math.round(
                        (item.current / Math.max(item.required, 1)) * 100
                      )
                    );

                    return (
                      <article
                        key={item.key}
                        className={`challenge-progress-item${
                          complete ? " is-complete" : ""
                        }`}
                      >
                        <div className="challenge-progress-item__heading">
                          <span
                            className="challenge-progress-item__icon"
                            aria-hidden="true"
                          >
                            {item.key.includes("accepted") ? "✓" : "♟"}
                          </span>

                          <div>
                            <small>{item.label}</small>
                            <strong>{item.text}</strong>
                          </div>
                        </div>

                        <div className="challenge-progress-item__bar-row">
                          <span className="challenge-progress">
                            <i
                              className="challenge-progress__fill"
                              style={{
                                width: `${Math.max(percentage, 5)}%`,
                              }}
                            />
                          </span>

                          <em>
                            {item.current}/{item.required}
                          </em>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>

              <section className="challenge-ops-lower-grid">
                <article className="challenge-ops-official">
                  <header>
                    <span>🧑‍⚖️</span>
                    <div>
                      <small>Match official</small>
                      <h2>Referee appointment</h2>
                    </div>
                  </header>

                  {refereeReady ? (
                    <div className="challenge-ops-official__person">
                      <span>
                        {(refereeName || "R").charAt(0).toUpperCase()}
                      </span>
                      <div>
                        <strong>
                          {refereeName || "Appointed referee"}
                        </strong>
                        <small>{refereeEmail}</small>
                      </div>
                      <em>Verified</em>
                    </div>
                  ) : (
                    <div className="challenge-ops-official__empty">
                      <strong>No referee appointed</strong>
                      <small>
                        A platform admin or either captain may appoint
                        an email-verified referee.
                      </small>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      console.log(
                        "[ChallengeCentrePage] Appoint referee",
                        selectedFixture
                      )
                    }
                  >
                    {refereeReady ? "Change referee" : "Appoint referee"}
                  </button>
                </article>

                <article className="challenge-ops-communications">
                  <header>
                    <span>💬</span>
                    <div>
                      <small>Clubs organise together</small>
                      <h2>Fixture communication</h2>
                    </div>
                  </header>
                  <p>
                    Captains use the existing club-to-club fixture chat.
                    Platform administration can join when assistance is
                    required.
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      console.log(
                        "[ChallengeCentrePage] Open fixture chat",
                        selectedFixture
                      )
                    }
                  >
                    Open fixture chat <span>→</span>
                  </button>
                </article>
              </section>

              <section className="challenge-ops-actions">
                <article className="challenge-ops-action challenge-ops-action--start">
                  <span className="challenge-ops-action__icon">▶</span>
                  <div>
                    <small>Official controls</small>
                    <h2>
                      {fixtureLive
                        ? "Match in progress"
                        : fixtureComplete
                          ? "Match completed"
                          : "Start Match"}
                    </h2>
                    <p>
                      Launch the club-versus-club referee tool based on
                      the Friendly Live Match Page.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!fixtureReady || fixtureComplete}
                    onClick={() =>
                      onOpenMatchControl?.(selectedFixture)
                    }
                  >
                    {fixtureLive
                      ? "Resume Match"
                      : fixtureComplete
                        ? "Full Time"
                        : "Start Match"}
                    <span>→</span>
                  </button>
                </article>

                <article className="challenge-ops-action challenge-ops-action--report">
                  <span className="challenge-ops-action__icon">◉</span>
                  <div>
                    <small>Live spectator feed</small>
                    <h2>Match Report</h2>
                    <p>
                      View the live score, goals, cards, injuries and
                      final match report.
                    </p>
                  </div>

                  <div className="challenge-ops-action__score">
                    <strong>{homeScore}</strong>
                    <span>–</span>
                    <strong>{awayScore}</strong>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      onOpenMatchReport?.(selectedFixture)
                    }
                  >
                    {fixtureComplete
                      ? "View Final Report"
                      : fixtureLive
                        ? "View Live Report"
                        : "Open Match Report"}
                    <span>→</span>
                  </button>
                </article>
              </section>
            </>
          )}
        </section>
      </div>

      {/* FANM PAIR TWO CLUBS MODAL */}
      {showPairClubsModal ? (
        <div
          className="challenge-pair-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closePairClubsModal();
            }
          }}
        >
          <section
            className="challenge-pair-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="challenge-pair-modal-title"
          >
            <header className="challenge-pair-modal__header">
              <div>
                <span>Platform fixture</span>
                <h2 id="challenge-pair-modal-title">
                  Pair Two Clubs
                </h2>
                <p>
                  Create one shared interclub fixture using the
                  existing challenge fixture structure.
                </p>
              </div>

              <button
                type="button"
                aria-label="Close pairing dialog"
                onClick={closePairClubsModal}
              >
                ×
              </button>
            </header>

            <div className="challenge-pair-modal__clubs">
              <label>
                <span>Home club</span>

                <select
                  value={pairingDraft.homeClubId}
                  onChange={(event) =>
                    updatePairingDraft(
                      "homeClubId",
                      event.target.value
                    )
                  }
                >
                  <option value="">Select home club</option>

                  {clubs
                    .slice()
                    .sort((clubA, clubB) =>
                      challengeClubName(clubA).localeCompare(
                        challengeClubName(clubB)
                      )
                    )
                    .map((club) => {
                      const clubId = cleanText(
                        club?.id || club?.clubId
                      );

                      return (
                        <option
                          key={`home-${clubId}`}
                          value={clubId}
                          disabled={
                            clubId === pairingDraft.awayClubId
                          }
                        >
                          {challengeClubName(club)}
                        </option>
                      );
                    })}
                </select>
              </label>

              <div className="challenge-pair-modal__versus">
                VS
              </div>

              <label>
                <span>Away club</span>

                <select
                  value={pairingDraft.awayClubId}
                  onChange={(event) =>
                    updatePairingDraft(
                      "awayClubId",
                      event.target.value
                    )
                  }
                >
                  <option value="">Select away club</option>

                  {clubs
                    .slice()
                    .sort((clubA, clubB) =>
                      challengeClubName(clubA).localeCompare(
                        challengeClubName(clubB)
                      )
                    )
                    .map((club) => {
                      const clubId = cleanText(
                        club?.id || club?.clubId
                      );

                      return (
                        <option
                          key={`away-${clubId}`}
                          value={clubId}
                          disabled={
                            clubId === pairingDraft.homeClubId
                          }
                        >
                          {challengeClubName(club)}
                        </option>
                      );
                    })}
                </select>
              </label>
            </div>

            <div className="challenge-pair-modal__fields">
              <label>
                <span>Game format</span>

                <select
                  value={pairingDraft.format}
                  onChange={(event) =>
                    updatePairingDraft(
                      "format",
                      event.target.value
                    )
                  }
                >
                  <option value="5v5">5 v 5</option>
                  <option value="6v6">6 v 6</option>
                  <option value="7v7">7 v 7</option>
                  <option value="11v11">11 v 11</option>
                </select>
              </label>

              <label>
                <span>Match date</span>

                <input
                  type="date"
                  value={pairingDraft.proposedDate}
                  onChange={(event) =>
                    updatePairingDraft(
                      "proposedDate",
                      event.target.value
                    )
                  }
                />
              </label>

              <label>
                <span>Kickoff</span>

                <input
                  type="time"
                  value={pairingDraft.proposedKickoff}
                  onChange={(event) =>
                    updatePairingDraft(
                      "proposedKickoff",
                      event.target.value
                    )
                  }
                />
              </label>

              <label className="challenge-pair-modal__venue">
                <span>Venue</span>

                <input
                  type="text"
                  value={pairingDraft.venue}
                  placeholder="Enter the proposed venue"
                  onChange={(event) =>
                    updatePairingDraft(
                      "venue",
                      event.target.value
                    )
                  }
                />
              </label>
            </div>

            <label className="challenge-pair-modal__message">
              <span>Message to both clubs</span>

              <textarea
                rows="3"
                value={pairingDraft.message}
                placeholder="Add context for the proposed fixture..."
                onChange={(event) =>
                  updatePairingDraft(
                    "message",
                    event.target.value
                  )
                }
              />
            </label>

            {pairingError ? (
              <div className="challenge-pair-modal__notice is-error">
                {pairingError}
              </div>
            ) : null}

            {pairingSuccess ? (
              <div className="challenge-pair-modal__notice is-success">
                {pairingSuccess}
              </div>
            ) : null}

            <footer className="challenge-pair-modal__footer">
              <button
                type="button"
                className="challenge-pair-modal__cancel"
                onClick={closePairClubsModal}
                disabled={pairingSaving}
              >
                Cancel
              </button>

              <button
                type="button"
                className="challenge-pair-modal__submit"
                onClick={createPlatformPairedFixture}
                disabled={pairingSaving}
              >
                {pairingSaving
                  ? "Creating fixture..."
                  : "Pair Clubs and Create Fixture"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

    </main>
  );
}
