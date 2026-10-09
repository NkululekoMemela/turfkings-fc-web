import React, {useEffect, useState} from "react";
import {onAuthStateChanged} from "firebase/auth";
import {auth} from "../firebaseConfig.js";
import HomePage_HUB_ClubCard from "./HomePage_HUB/HomePage_HUB_ClubCard.jsx";
import "./VenueCarouselCard.css";
import {fieldLogoStudioRequest} from "../storage/fieldLogoStudioGateway.js";

export default function VenueCarouselCard({venue, onEnter}) {
  const [user, setUser] = useState(auth.currentUser);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  const canDelete = Boolean(user && (venue.ownerUid === user.uid || venue.createdByUid === user.uid ||
    user.emailVerified && String(user.email || "").toLowerCase() === "nkululekolerato@gmail.com"));
  async function deleteField() {
    if (!canDelete || deleting) return;
    if (window.prompt(`Type DELETE to remove ${venue.name} from the public hub. A record will be kept for audit purposes.`) !== "DELETE") return;
    setDeleting(true);
    try {await fieldLogoStudioRequest({action: "delete", venueId: venue.id});}
    catch (error) {window.alert(error.message || "Could not delete this Field. Please try again.");}
    finally {setDeleting(false);}
  }
  const location = [venue.location?.suburb, venue.location?.city].filter(Boolean).join(", ");
  const clubCount = venue.league?.activeSeason?.clubIds?.length;
  const profile = {
    ...venue,
    image: venue.branding?.logoUrl || venue.logoUrl || venue.image || "",
    accent: venue.branding?.accent || "#16a34a",
    locationDetails: {suburb: location},
    weeklyPlayTime: venue.operatingHoursSummary || venue.schedule?.operatingHoursSummary || "Contact Field for opening hours",
    displayLeaderName: venue.managerContact?.firstName || venue.createdByName || "",
    playerCount: venue.clubCount ?? clubCount ?? 0,
    featuredVideoUrl: venue.featuredVideoUrl || venue.media?.featuredVideoUrl || venue.highlightVideoUrl || "",
  };
  return <div className="homepage-hub-shell field-carousel-shared"><HomePage_HUB_ClubCard club={profile} onViewClub={() => onEnter?.(venue)}
    canJoin={false} canChallenge={false} canDelete={canDelete} onDeleteClub={deleteField}
    entityLabel="Field" participantLabel="Clubs" activityLabel="Get involved" websiteUrl={venue.websiteUrl || venue.website || ""} busy={deleting} freezeFace={deleting}/></div>;
}
