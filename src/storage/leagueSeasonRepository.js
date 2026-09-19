import { auth, db } from "../firebaseConfig.js";
import {
  doc,
  FieldPath,
  arrayUnion,
  getDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  runTransaction,
} from "firebase/firestore";

export function watchVenueSeason(venueId, onSeason, onError) {
  return onSnapshot(
    doc(db, "leagueVenues", venueId),
    (snapshot) => onSeason(snapshot.exists()
      ? snapshot.data().league?.activeSeason || null
      : null),
    onError
  );
}

export async function createVenueSeason({
  venueId,
  name,
  startsOn,
  endsOn = "",
}) {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error("Sign in as the field manager.");
  const title = String(name || "").trim();
  if (!title || title.length > 80) throw new Error("Enter a season name.");
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(startsOn) ||
      (endsOn && !/^\\d{4}-\\d{2}-\\d{2}$/.test(endsOn)) ||
      (endsOn && endsOn < startsOn)) {
    throw new Error("Enter valid season dates in order.");
  }

  const ref = doc(db, "leagueVenues", venueId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) throw new Error("Venue no longer exists.");
  const venue = snapshot.data();
  if (venue.ownerUid !== user.uid) {
    throw new Error("Only this venue's field manager can create a season.");
  }
  if (venue.league?.activeSeason) {
    throw new Error("This venue already has an active season.");
  }

  await updateDoc(ref, {
    "league.activeSeason": {
      id: `season-${startsOn}`,
      name: title,
      startsOn,
      endsOn,
      status: "setup",
      clubIds: [],
      createdByUid: user.uid,
      createdAt: serverTimestamp(),
    },
    updatedAt: serverTimestamp(),
  });
}

export async function inviteClubToVenueSeason({ venueId, clubId }) {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error("Sign in as the field manager.");
  if (!venueId || !clubId) throw new Error("Select a club to invite.");

  const venueRef = doc(db, "leagueVenues", venueId);
  const clubRef = doc(db, "clubs", clubId);
  const [venueSnapshot, clubSnapshot] = await Promise.all([
    getDoc(venueRef),
    getDoc(clubRef),
  ]);
  if (!venueSnapshot.exists() || !clubSnapshot.exists()) {
    throw new Error("The venue or selected club no longer exists.");
  }

  const venue = venueSnapshot.data();
  const season = venue.league?.activeSeason;
  if (venue.ownerUid !== user.uid) {
    throw new Error("Only this venue's field manager can invite clubs.");
  }
  if (!season) throw new Error("Create a venue season before inviting clubs.");
  if (season.invitations?.[clubId]) {
    throw new Error("This club already has an invitation for this season.");
  }

  await updateDoc(
    venueRef,
    new FieldPath("league", "activeSeason", "invitations", clubId),
    {
      clubId,
      clubName: clubSnapshot.data().name || clubId,
      status: "pending",
      invitedByUid: user.uid,
      invitedAt: serverTimestamp(),
    },
    "updatedAt",
    serverTimestamp()
  );
}

export async function confirmVenueClubParticipation({ venueId, clubId }) {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error("Sign in as the field manager.");
  if (!venueId || !clubId) throw new Error("Select an invited club.");

  const venueRef = doc(db, "leagueVenues", venueId);
  const snapshot = await getDoc(venueRef);
  if (!snapshot.exists()) throw new Error("Venue no longer exists.");
  const venue = snapshot.data();
  if (venue.ownerUid !== user.uid) {
    throw new Error("Only this venue's field manager can confirm participation.");
  }
  const invitation = venue.league?.activeSeason?.invitations?.[clubId];
  if (invitation?.status !== "pending") {
    throw new Error("This club does not have a pending invitation.");
  }

  await updateDoc(
    venueRef,
    new FieldPath("league", "activeSeason", "invitations", clubId, "status"),
    "accepted",
    new FieldPath("league", "activeSeason", "invitations", clubId, "confirmedByUid"),
    user.uid,
    new FieldPath("league", "activeSeason", "invitations", clubId, "confirmedAt"),
    serverTimestamp(),
    new FieldPath("league", "activeSeason", "clubIds"),
    arrayUnion(clubId),
    "updatedAt",
    serverTimestamp()
  );
}

export async function scheduleVenueFixture({
  venueId,
  clubAId,
  clubBId,
  scheduledLocal,
}) {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error("Sign in as the field manager.");
  if (!venueId || !clubAId || !clubBId || clubAId === clubBId) {
    throw new Error("Choose two different participating clubs.");
  }
  if (!/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$/.test(scheduledLocal)) {
    throw new Error("Enter a fixture date and time.");
  }

  const ref = doc(db, "leagueVenues", venueId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) throw new Error("Venue no longer exists.");
  const venue = snapshot.data();
  if (venue.ownerUid !== user.uid) {
    throw new Error("Only this venue's field manager can schedule fixtures.");
  }
  const season = venue.league?.activeSeason;
  if (!season) throw new Error("Create a season first.");
  const confirmed = new Set(season.clubIds || []);
  if (!confirmed.has(clubAId) || !confirmed.has(clubBId)) {
    throw new Error("Both clubs must be confirmed for this season.");
  }
  const clubA = season.invitations?.[clubAId];
  const clubB = season.invitations?.[clubBId];
  if (clubA?.status !== "accepted" || clubB?.status !== "accepted") {
    throw new Error("Both invitations must be accepted.");
  }
  if ((season.fixtures || []).some((fixture) =>
    fixture.scheduledLocal === scheduledLocal &&
    [clubAId, clubBId].includes(fixture.clubAId) &&
    [clubAId, clubBId].includes(fixture.clubBId))) {
    throw new Error("These clubs already have a fixture at this time.");
  }

  const fixture = {
    id: crypto.randomUUID(),
    clubAId,
    clubBId,
    clubAName: clubA.clubName,
    clubBName: clubB.clubName,
    scheduledLocal,
    timezone: "Africa/Johannesburg",
    status: "scheduled",
    createdByUid: user.uid,
    createdAtMs: Date.now(),
  };
  await updateDoc(
    ref,
    new FieldPath("league", "activeSeason", "fixtures"),
    arrayUnion(fixture),
    "updatedAt",
    serverTimestamp()
  );
  return fixture;
}

export async function startVenueFixture({ venueId, fixtureId }) {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error("Sign in as the field manager.");
  if (!venueId || !fixtureId) throw new Error("Select a scheduled fixture.");
  const ref = doc(db, "leagueVenues", venueId);

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error("Venue no longer exists.");
    const venue = snapshot.data();

    const staffRef = doc(
      db,
      "leagueVenues",
      venueId,
      "staff",
      user.uid
    );
    const staffSnapshot = await transaction.get(staffRef);
    const staff = staffSnapshot.exists()
      ? staffSnapshot.data()
      : null;

    const isActiveFieldOperator =
      venue.ownerUid === user.uid ||
      (
        staff?.status === "active" &&
        (
          staff?.isAdministrator === true ||
          staff?.role === "referee"
        )
      );

    if (!isActiveFieldOperator) {
      throw new Error(
        "Only an approved Field official or referee can start this match."
      );
    }

    const season = venue.league?.activeSeason;
    const fixture = (season?.fixtures || []).find((item) =>
      item.id === fixtureId && item.status === "scheduled");
    if (!fixture || season.liveMatches?.[fixtureId]) {
      throw new Error("This fixture is unavailable or already started.");
    }
    if (Object.values(season.liveMatches || {})
      .some((match) => match.status === "live")) {
      throw new Error("Finish the current live match first.");
    }

    const match = {
      fixtureId,
      clubAId: fixture.clubAId,
      clubBId: fixture.clubBId,
      clubAName: fixture.clubAName,
      clubBName: fixture.clubBName,
      scoreA: 0,
      scoreB: 0,
      status: "live",
      startedByUid: user.uid,
      startedAt: serverTimestamp(),
    };
    transaction.update(
      ref,
      new FieldPath("league", "activeSeason", "liveMatches", fixtureId),
      match,
      "updatedAt",
      serverTimestamp()
    );
    return match;
  });
}
