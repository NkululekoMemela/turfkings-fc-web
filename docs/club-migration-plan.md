# Turf Kings Multi-Club Migration Plan

## Goal

Move from a single-club Turf Kings database structure toward a scalable 5 Asides Near Me platform structure.

Production must remain untouched until staging is fully tested.

---

## Current model

```txt
appState_v2/main
players
members
humanMembers
matchSignups
payments
peerRatings
peerRatingBaselines
playerPhotos
pendingSignups
newsStories
video_highlights
seasons
