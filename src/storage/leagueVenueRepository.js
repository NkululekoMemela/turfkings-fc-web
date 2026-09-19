import { auth, db } from "../firebaseConfig.js";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";

function clean(value) {
  return String(value || "").trim();
}

function slug(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export function watchLeagueVenues(onVenues, onError) {
  return onSnapshot(
    collection(db, "leagueVenues"),
    (snapshot) => {
      const venues = snapshot.docs
        .map((item) => ({ ...item.data(), id: item.id }))
        .filter((venue) => venue.visibility?.listed === true)
        .sort((a, b) => a.name.localeCompare(b.name));

      onVenues(venues);
    },
    onError
  );
}

export function watchVenueStaff(
  venueId,
  onStaff,
  onError
) {
  if (!venueId) {
    onStaff([]);
    return () => {};
  }

  return onSnapshot(
    collection(db, "leagueVenues", venueId, "staff"),
    (snapshot) => {
      const staff = snapshot.docs
        .map((item) => ({
          id: item.id,
          ...item.data(),
        }))
        .filter((item) => item.status === "active")
        .sort((a, b) =>
          clean(a.name).localeCompare(clean(b.name))
        );

      onStaff(staff);
    },
    onError
  );
}

export async function requestVenueStaffAccess({
  venueId,
  role,
  firstName,
  surname,
  email,
  phoneNumber = "",
}) {
  const user = auth.currentUser;

  if (!user?.uid) {
    throw new Error(
      "Sign in before requesting Field staff access."
    );
  }

  const selectedRole = clean(role);
  const cleanFirstName = clean(firstName);
  const cleanSurname = clean(surname);
  const cleanEmail = clean(email).toLowerCase();
  const cleanPhoneNumber = clean(phoneNumber);

  const allowedRoles = [
    "field_manager",
    "assistant_manager",
    "field_assistant",
    "other_staff",
    "referee",
  ];

  if (!venueId) {
    throw new Error("This Field could not be identified.");
  }

  if (!cleanFirstName) {
    throw new Error("Enter your name.");
  }

  if (!cleanSurname) {
    throw new Error("Enter your surname.");
  }

  if (
    !cleanEmail ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
  ) {
    throw new Error("Enter a valid email address.");
  }

  if (
    cleanEmail !== clean(user.email).toLowerCase()
  ) {
    throw new Error(
      "The email entered must match the signed-in Google account."
    );
  }

  if (
    cleanPhoneNumber &&
    cleanPhoneNumber.replace(/\D/g, "").length < 7
  ) {
    throw new Error(
      "Enter a valid phone or WhatsApp number."
    );
  }

  if (!allowedRoles.includes(selectedRole)) {
    throw new Error("Select your role at this Field.");
  }

  const staffRef = doc(
    db,
    "leagueVenues",
    venueId,
    "staff",
    user.uid
  );

  const existing = await getDoc(staffRef);

  if (existing.exists()) {
    const status = clean(existing.data()?.status);

    if (status === "active") {
      throw new Error(
        "You are already registered as active Field staff."
      );
    }

    if (status === "pending") {
      throw new Error(
        "Your Field Team request is already awaiting approval."
      );
    }

    throw new Error(
      "A Field staff record already exists for this account."
    );
  }

  const fullName =
    `${cleanFirstName} ${cleanSurname}`.trim();

  await setDoc(staffRef, {
    uid: user.uid,
    firstName: cleanFirstName,
    surname: cleanSurname,
    fullName,
    name: fullName,
    email: cleanEmail,
    phoneNumber: cleanPhoneNumber,
    whatsappNumber: cleanPhoneNumber,
    role: selectedRole,
    status: "pending",
    isAdministrator: false,
    isCreator: false,
    requestedAt: serverTimestamp(),
    approvedAt: null,
    approvedByUid: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return {
    uid: user.uid,
    firstName: cleanFirstName,
    surname: cleanSurname,
    fullName,
    email: cleanEmail,
    phoneNumber: cleanPhoneNumber,
    role: selectedRole,
    status: "pending",
  };
}

export async function createLeagueVenue({
  name,
  city,
  suburb = "",
  address = "",
  websiteUrl = "",
  creatorRole,
}) {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error("Sign in before registering a league venue.");

  const venueName = clean(name);
  const venueCity = clean(city);
  const selectedRole = clean(creatorRole);

  const allowedRoles = [
    "field_manager",
    "assistant_manager",
    "field_assistant",
    "other_staff",
  ];

  if (!venueName) throw new Error("Venue name is required.");
  if (!venueCity) throw new Error("City is required.");

  if (!allowedRoles.includes(selectedRole)) {
    throw new Error("Select your role at this Field.");
  }

  const website = clean(websiteUrl);
  if (website && !/^https?:\/\/[^ ]+\.[^ ]+/i.test(website)) {
    throw new Error("Enter a complete website address beginning with https://");
  }

  const venueId = `${slug(venueName) || "venue"}-${user.uid.slice(0, 8)}`;
  const venueRef = doc(db, "leagueVenues", venueId);
  if ((await getDoc(venueRef)).exists()) {
    throw new Error("You already registered a venue with this name.");
  }

  const venue = {
    id: venueId,
    name: venueName,
    location: {
      city: venueCity,
      suburb: clean(suburb),
      address: clean(address),
      country: "South Africa",
    },
    websiteUrl: website,
    ownerUid: user.uid,
    createdByUid: user.uid,
    createdByEmail: clean(user.email),
    adminUids: [user.uid],
    adminEmails: clean(user.email)
      ? [clean(user.email).toLowerCase()]
      : [],
    branding: { logoUrl: "", accent: "#16a34a" },
    visibility: { listed: true },
    status: "setup_pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const staffRef = doc(
    db,
    "leagueVenues",
    venueId,
    "staff",
    user.uid
  );

  const creatorStaff = {
    uid: user.uid,
    email: clean(user.email).toLowerCase(),
    name: clean(user.displayName) || "Field staff",
    role: selectedRole,
    status: "active",
    isAdministrator: true,
    isCreator: true,
    requestedAt: serverTimestamp(),
    approvedAt: serverTimestamp(),
    approvedByUid: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const batch = writeBatch(db);
  batch.set(venueRef, venue);
  batch.set(staffRef, creatorStaff);
  await batch.commit();

  return {
    ...venue,
    id: venueId,
    creatorStaff,
  };
}
