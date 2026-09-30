import test, {
  before,
  after,
  beforeEach,
} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";

let env;

const venueId = "wynberg-mm-test";

const venue = {
  id: venueId,
  name: "Wynberg MM",
  ownerUid: "owner",
  createdByUid: "owner",
  ownerEmail: "owner@example.com",
  createdByEmail: "owner@example.com",
  adminUids: ["owner"],
  adminEmails: ["owner@example.com"],
  visibility: { listed: true },
};

const ownerStaff = {
  uid: "owner",
  requestId: "owner",
  requestedByUid: "owner",
  name: "Field Owner",
  fullName: "Field Owner",
  email: "owner@example.com",
  role: "field_manager",
  status: "active",
  isAdministrator: true,
  isCreator: true,
};

function refereeRequest({
  uid = "ref-request",
  email = "referee@example.com",
} = {}) {
  return {
    uid,
    requestId: uid,
    requestedByUid: "referee-user",
    firstName: "New",
    surname: "Referee",
    fullName: "New Referee",
    name: "New Referee",
    email,
    phoneNumber: "",
    whatsappNumber: "",
    role: "referee",
    status: "pending",
    isAdministrator: false,
    isCreator: false,
  };
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-fanm-venue-staff",
    firestore: {
      rules: fs.readFileSync("firestore.rules", "utf8"),
    },
  });
});

after(async () => {
  if (env) await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();

  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    await setDoc(
      doc(db, "leagueVenues", venueId),
      venue
    );

    await setDoc(
      doc(db, "leagueVenues", venueId, "staff", "owner"),
      ownerStaff
    );
  });
});

test(
  "signed-in referee can request access with their own Gmail",
  async () => {
    const db = env.authenticatedContext(
      "referee-user",
      { email: "referee@example.com" }
    ).firestore();

    await assertSucceeds(
      setDoc(
        doc(
          db,
          "leagueVenues",
          venueId,
          "staff",
          "ref-request"
        ),
        refereeRequest()
      )
    );
  }
);

test(
  "referee cannot submit a request using another Gmail",
  async () => {
    const db = env.authenticatedContext(
      "referee-user",
      { email: "referee@example.com" }
    ).firestore();

    await assertFails(
      setDoc(
        doc(
          db,
          "leagueVenues",
          venueId,
          "staff",
          "impersonated-request"
        ),
        refereeRequest({
          uid: "impersonated-request",
          email: "someone-else@example.com",
        })
      )
    );
  }
);

test(
  "signed-out visitor cannot read Field staff details",
  async () => {
    const db = env.unauthenticatedContext().firestore();

    await assertFails(
      getDocs(
        collection(
          db,
          "leagueVenues",
          venueId,
          "staff"
        )
      )
    );
  }
);

test(
  "signed-in user can read the Field Team collection",
  async () => {
    const db = env.authenticatedContext(
      "referee-user",
      { email: "referee@example.com" }
    ).firestore();

    await assertSucceeds(
      getDocs(
        collection(
          db,
          "leagueVenues",
          venueId,
          "staff"
        )
      )
    );
  }
);

test(
  "unrelated user cannot approve a referee request",
  async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(
          context.firestore(),
          "leagueVenues",
          venueId,
          "staff",
          "ref-request"
        ),
        refereeRequest()
      );
    });

    const db = env.authenticatedContext(
      "unrelated-user",
      { email: "unrelated@example.com" }
    ).firestore();

    await assertFails(
      updateDoc(
        doc(
          db,
          "leagueVenues",
          venueId,
          "staff",
          "ref-request"
        ),
        {
          role: "referee",
          status: "active",
          isAdministrator: false,
        }
      )
    );
  }
);

test(
  "Field owner can approve referee without admin access",
  async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(
          context.firestore(),
          "leagueVenues",
          venueId,
          "staff",
          "ref-request"
        ),
        refereeRequest()
      );
    });

    const db = env.authenticatedContext(
      "owner",
      { email: "owner@example.com" }
    ).firestore();

    const requestRef = doc(
      db,
      "leagueVenues",
      venueId,
      "staff",
      "ref-request"
    );

    await assertSucceeds(
      updateDoc(requestRef, {
        role: "referee",
        status: "active",
        isAdministrator: false,
      })
    );

    const snapshot = await assertSucceeds(
      getDoc(requestRef)
    );

    assert.equal(snapshot.data().status, "active");
    assert.equal(snapshot.data().role, "referee");
    assert.equal(
      snapshot.data().isAdministrator,
      false
    );
  }
);
