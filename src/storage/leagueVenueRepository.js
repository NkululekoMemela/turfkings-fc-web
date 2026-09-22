import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
} from "firebase/storage";
import { auth, db } from "../firebaseConfig.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
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

export function watchVenueStaffRequests(
  venueId,
  onRequests,
  onError
) {
  if (!venueId) {
    onRequests([]);
    return () => {};
  }

  return onSnapshot(
    collection(db, "leagueVenues", venueId, "staff"),
    (snapshot) => {
      const requests = snapshot.docs
        .map((item) => ({
          id: item.id,
          ...item.data(),
        }))
        .filter((staff) => staff.status === "pending")
        .sort((a, b) =>
          String(a.name || "").localeCompare(
            String(b.name || "")
          )
        );

      onRequests(requests);
    },
    onError
  );
}

export async function reviewVenueStaffRequest({
  venueId,
  staffUid,
  decision,
  role,
}) {
  const user = auth.currentUser;

  if (!user?.uid) {
    throw new Error(
      "Sign in as a permanent Field official."
    );
  }

  const cleanVenueId = clean(venueId);
  const cleanStaffUid = clean(staffUid);
  const selectedRole = clean(role);

  const allowedRoles = [
    "field_manager",
    "assistant_manager",
    "field_assistant",
    "other_staff",
    "referee",
  ];

  if (!cleanVenueId || !cleanStaffUid) {
    throw new Error("The Field Team request is incomplete.");
  }

  if (!["approve", "reject"].includes(decision)) {
    throw new Error("Select a valid review decision.");
  }

  if (!allowedRoles.includes(selectedRole)) {
    throw new Error(
      "Confirm the applicant's Field role."
    );
  }

  const staffRef = doc(
    db,
    "leagueVenues",
    cleanVenueId,
    "staff",
    cleanStaffUid
  );

  const snapshot = await getDoc(staffRef);

  if (!snapshot.exists()) {
    throw new Error(
      "This Field Team request no longer exists."
    );
  }

  if (snapshot.data()?.status !== "pending") {
    throw new Error(
      "This Field Team request has already been reviewed."
    );
  }

  const approved = decision === "approve";
  const permanentRole =
    selectedRole !== "referee";

  await updateDoc(staffRef, {
    role: selectedRole,
    status: approved ? "active" : "rejected",
    isAdministrator:
      approved && permanentRole,
    approvedAt:
      approved ? serverTimestamp() : null,
    approvedByUid:
      approved ? user.uid : "",
    rejectedAt:
      approved ? null : serverTimestamp(),
    rejectedByUid:
      approved ? "" : user.uid,
    updatedAt: serverTimestamp(),
  });
}

export async function ensureVenueCreatorStaffProfile({
  venue,
  role = "",
  name = "",
}) {
  const user = auth.currentUser;

  if (!user?.uid || !user?.email) {
    throw new Error(
      "Sign in with the Google account that created this Field."
    );
  }

  const venueId = clean(venue?.id);
  const signedInEmail =
    clean(user.email).toLowerCase();

  const creatorUids = [
    venue?.ownerUid,
    venue?.createdByUid,
    ...(Array.isArray(venue?.adminUids)
      ? venue.adminUids
      : []),
  ]
    .map(clean)
    .filter(Boolean);

  const creatorEmails = [
    venue?.createdByEmail,
    venue?.ownerEmail,
    ...(Array.isArray(venue?.adminEmails)
      ? venue.adminEmails
      : []),
  ]
    .map((value) => clean(value).toLowerCase())
    .filter(Boolean);

  const identityMatches =
    creatorUids.includes(user.uid) ||
    creatorEmails.includes(signedInEmail);

  if (!venueId || !identityMatches) {
    throw new Error(
      "This Google account does not match the registered Field creator."
    );
  }

  const permanentRoles = [
    "field_manager",
    "assistant_manager",
    "field_assistant",
    "other_staff",
  ];

  const requestedRole = clean(
    venue?.creatorRole || role
  );

  const creatorRole = permanentRoles.includes(
    requestedRole
  )
    ? requestedRole
    : "field_manager";

  const staffRef = doc(
    db,
    "leagueVenues",
    venueId,
    "staff",
    user.uid
  );

  const existing = await getDoc(staffRef);

  const creatorName =
    clean(name) ||
    clean(venue?.createdByName) ||
    clean(venue?.ownerName) ||
    clean(user.displayName) ||
    "Field Manager";

  if (
    existing.exists() &&
    existing.data()?.status === "active" &&
    existing.data()?.isAdministrator === true
  ) {
    const existingData = existing.data();

    if (clean(existingData.name) !== creatorName) {
      await updateDoc(staffRef, {
        name: creatorName,
        fullName: creatorName,
        updatedAt: serverTimestamp(),
      });
    }

    return {
      id: existing.id,
      ...existingData,
      name: creatorName,
      fullName: creatorName,
      uid: user.uid,
    };
  }

  const creatorStaff = {
    uid: user.uid,
    email: signedInEmail,
    name: creatorName,
    fullName: creatorName,
    role: creatorRole,
    status: "active",
    isAdministrator: true,
    isCreator: true,
    recoveredLegacyCreator: true,
    requestedAt: serverTimestamp(),
    approvedAt: serverTimestamp(),
    approvedByUid: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(staffRef, creatorStaff);

  return {
    id: user.uid,
    ...creatorStaff,
  };
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
        .filter((item) =>
          ["active", "pending"].includes(item.status)
        )
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
      "Please sign in to 5 Asides Near Me before sending your request."
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

  if (!cleanFirstName || !cleanSurname) {
    throw new Error(
      "Please enter your first name and surname."
    );
  }

  if (
    !cleanEmail ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
  ) {
    throw new Error("Please enter a valid Gmail address.");
  }

  if (
    cleanPhoneNumber &&
    cleanPhoneNumber.replace(/\D/g, "").length < 7
  ) {
    throw new Error(
      "Please enter a valid WhatsApp number."
    );
  }

  if (!allowedRoles.includes(selectedRole)) {
    throw new Error("Select your role at this Field.");
  }

  const existingSnapshot = await getDocs(
    collection(db, "leagueVenues", venueId, "staff")
  );

  const duplicate = existingSnapshot.docs.find((item) => {
    const staff = item.data();

    return (
      clean(staff.email).toLowerCase() === cleanEmail &&
      ["pending", "active"].includes(clean(staff.status))
    );
  });

  if (duplicate) {
    throw new Error(
      duplicate.data()?.status === "pending"
        ? "This Gmail already has a request awaiting approval."
        : "This Gmail is already registered with the Field Team."
    );
  }

  const fullName =
    `${cleanFirstName} ${cleanSurname}`.trim();

  const staffRef = doc(
    collection(db, "leagueVenues", venueId, "staff")
  );

  await setDoc(staffRef, {
    uid: staffRef.id,
    requestId: staffRef.id,
    requestedByUid: user.uid,
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
    id: staffRef.id,
    uid: staffRef.id,
    name: fullName,
    email: cleanEmail,
    role: selectedRole,
    status: "pending",
  };
}

export async function claimApprovedVenueStaffProfile({
  venueId,
  requestId,
}) {
  const user = auth.currentUser;

  if (!user?.uid || !user?.email) {
    throw new Error(
      "Sign in with the Gmail address on the approved profile."
    );
  }

  const sourceRef = doc(
    db,
    "leagueVenues",
    venueId,
    "staff",
    requestId
  );

  const sourceSnapshot = await getDoc(sourceRef);

  if (!sourceSnapshot.exists()) {
    throw new Error(
      "The selected Field staff profile no longer exists."
    );
  }

  const source = sourceSnapshot.data();
  const signedInEmail = clean(user.email).toLowerCase();

  if (source.status !== "active") {
    throw new Error(
      source.status === "pending"
        ? "This Field Team request is still awaiting approval."
        : "This Field Team profile is not active."
    );
  }

  if (clean(source.email).toLowerCase() !== signedInEmail) {
    throw new Error(
      "This Google account does not match the Gmail on the selected Field staff profile."
    );
  }

  if (requestId === user.uid) {
    return {
      id: sourceSnapshot.id,
      ...source,
      uid: user.uid,
    };
  }

  const claimedRef = doc(
    db,
    "leagueVenues",
    venueId,
    "staff",
    user.uid
  );

  const claimedStaff = {
    ...source,
    uid: user.uid,
    requestId,
    claimedFromRequestId: requestId,
    claimedAt: serverTimestamp(),
    status: "active",
    updatedAt: serverTimestamp(),
  };

  const batch = writeBatch(db);
  batch.set(claimedRef, claimedStaff);
  batch.update(sourceRef, {
    status: "claimed",
    claimedByUid: user.uid,
    claimedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();

  return {
    ...claimedStaff,
    id: user.uid,
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
    createdByName:
      clean(user.displayName) || "Field creator",
    creatorRole: selectedRole,
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


function safeVenueFileName(name = "field-logo") {
  return String(name || "field-logo")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "");
}

async function dataUrlToVenueBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}

async function uploadVenueLogoAsset({
  venueId,
  file = null,
  generatedLogoDataUrl = "",
}) {
  let blob = file;

  if (!blob && generatedLogoDataUrl.startsWith("data:")) {
    blob = await dataUrlToVenueBlob(generatedLogoDataUrl);
  }

  if (!blob) {
    return clean(generatedLogoDataUrl);
  }

  const storage = getStorage();
  const originalName =
    file?.name ||
    "generated-field-logo.svg";

  const logoRef = ref(
    storage,
    `leagueVenues/${venueId}/branding/${Date.now()}_${safeVenueFileName(originalName)}`
  );

  await uploadBytes(logoRef, blob, {
    contentType:
      blob.type ||
      file?.type ||
      "application/octet-stream",
  });

  return getDownloadURL(logoRef);
}

export async function completeLeagueVenueRegistration({
  venueId,
  draft = {},
  logoDraft = {},
}) {
  const user = auth.currentUser;
  const cleanVenueId = clean(venueId);

  if (!user?.uid) {
    throw new Error(
      "Sign in before completing Field setup."
    );
  }

  if (!cleanVenueId) {
    throw new Error(
      "The Field reference is missing."
    );
  }

  const venueRef = doc(
    db,
    "leagueVenues",
    cleanVenueId
  );

  const snapshot = await getDoc(venueRef);

  if (!snapshot.exists()) {
    throw new Error(
      "The newly registered Field could not be found."
    );
  }

  const existingVenue = snapshot.data() || {};
  const administrators = Array.isArray(
    existingVenue.adminUids
  )
    ? existingVenue.adminUids
    : [];

  const canCompleteSetup =
    existingVenue.ownerUid === user.uid ||
    existingVenue.createdByUid === user.uid ||
    administrators.includes(user.uid);

  if (!canCompleteSetup) {
    throw new Error(
      "Only an authorised Field administrator can complete this setup."
    );
  }

  const logoUrl = await uploadVenueLogoAsset({
    venueId: cleanVenueId,
    file: logoDraft.logoFile || null,
    generatedLogoDataUrl:
      clean(logoDraft.generatedLogoDataUrl) ||
      clean(logoDraft.uploadedLogoUrl),
  });

  const firstName = clean(draft.staffFirstName);
  const surname = clean(draft.staffSurname);
  const staffName = `${firstName} ${surname}`
    .replace(/\s+/g, " ")
    .trim();

  const accent =
    clean(draft.accent) ||
    "#16a34a";

  await updateDoc(venueRef, {
    "location.province": clean(draft.province),
    "location.country":
      clean(draft.country) ||
      "South Africa",
    "location.latitude":
      Number.isFinite(Number(draft.latitude))
        ? Number(draft.latitude)
        : null,
    "location.longitude":
      Number.isFinite(Number(draft.longitude))
        ? Number(draft.longitude)
        : null,
    "location.googlePlaceId":
      clean(draft.googlePlaceId),
    managerContact: {
      firstName,
      surname,
      name:
        staffName ||
        clean(user.displayName) ||
        "Field Manager",
      email:
        clean(draft.staffEmail) ||
        clean(user.email),
      whatsappNumber:
        clean(draft.staffWhatsApp),
    },
    branding: {
      logoUrl,
      accent,
      logoText:
        clean(draft.logoText) ||
        clean(draft.name)
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((word) => word[0]?.toUpperCase())
          .join(""),
      logoSource: logoDraft.logoFile
        ? "uploaded_file"
        : logoDraft.selectedGeneratedLogoId
          ? "starter_logo"
          : logoUrl
            ? "external_url"
            : "initials",
      selectedGeneratedLogo:
        clean(
          logoDraft.selectedGeneratedLogoId
        ),
    },
    logoUrl,
    image: logoUrl,
    status: "active",
    setupCompletedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return {
    ...existingVenue,
    id: cleanVenueId,
    location: {
      ...(existingVenue.location || {}),
      province: clean(draft.province),
      country:
        clean(draft.country) ||
        "South Africa",
      latitude:
        Number.isFinite(Number(draft.latitude))
          ? Number(draft.latitude)
          : null,
      longitude:
        Number.isFinite(Number(draft.longitude))
          ? Number(draft.longitude)
          : null,
      googlePlaceId:
        clean(draft.googlePlaceId),
    },
    managerContact: {
      firstName,
      surname,
      name:
        staffName ||
        clean(user.displayName) ||
        "Field Manager",
      email:
        clean(draft.staffEmail) ||
        clean(user.email),
      whatsappNumber:
        clean(draft.staffWhatsApp),
    },
    branding: {
      logoUrl,
      accent,
    },
    logoUrl,
    image: logoUrl,
    status: "active",
  };
}
