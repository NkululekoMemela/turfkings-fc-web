import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const paths = fs.readFileSync(
  "src/core/clubFirestorePaths.js",
  "utf8"
);

const peer = fs.readFileSync(
  "src/pages/PeerReviewPage.jsx",
  "utf8"
);

test("Peer Review imports scoped rating helpers", () => {
  assert.match(peer, /getScopedPeerRatingsCollection/);
  assert.match(peer, /getScopedPeerRatingDoc/);
  assert.match(peer, /getScopedPeerRatingBaselinesCollection/);
  assert.match(peer, /getScopedPeerRatingBaselineDoc/);
});

test("Practice peer ratings collection uses DataScope", () => {
  assert.match(
    peer,
    /isPracticeMode[\s\S]*?getScopedPeerRatingsCollection\(db,\s*dataScope\)/
  );
});

test("Practice peer baselines collection uses DataScope", () => {
  assert.match(
    peer,
    /isPracticeMode[\s\S]*?getScopedPeerRatingBaselinesCollection\(db,\s*dataScope\)/
  );
});

test("Practice peer rating documents use DataScope", () => {
  assert.match(
    peer,
    /getScopedPeerRatingDoc\(db,\s*docId,\s*dataScope\)/
  );
});

test("Practice peer baseline documents use DataScope", () => {
  assert.match(
    peer,
    /getScopedPeerRatingBaselineDoc\(db,\s*docId,\s*dataScope\)/
  );
});

test("Official peer rating reads remain club scoped", () => {
  assert.match(
    peer,
    /:\s*getPeerRatingsCollection\(db,\s*safeActiveClubId\)/
  );
});

test("Official baseline reads remain club scoped", () => {
  assert.match(
    peer,
    /:\s*getPeerRatingBaselinesCollection\(db,\s*safeActiveClubId\)/
  );
});

test("scoped peer helpers use canonical DataScope path resolver", () => {
  assert.match(
    paths,
    /dataScopeCollectionPath\(\s*CLUB_COLLECTIONS\.peerRatings/
  );

  assert.match(
    paths,
    /dataScopeDocPath\(\s*CLUB_COLLECTIONS\.peerRatings/
  );

  assert.match(
    paths,
    /dataScopeCollectionPath\(\s*CLUB_COLLECTIONS\.peerRatingBaselines/
  );

  assert.match(
    paths,
    /dataScopeDocPath\(\s*CLUB_COLLECTIONS\.peerRatingBaselines/
  );
});

test("Practice peer review does not manufacture fake club IDs", () => {
  assert.doesNotMatch(
    peer,
    /clubId.*-practice|-practice.*clubId/
  );
});
