import {fieldAlert} from './FieldDialog.jsx';
import React, {useEffect, useState} from "react";
import {onAuthStateChanged} from "firebase/auth";
import {auth} from "../firebaseConfig.js";
import HomePage_HUB_ClubCard from "./HomePage_HUB/HomePage_HUB_ClubCard.jsx";
import "./VenueCarouselCard.css";
import {renderFieldLogo, svgDataUrl, validSpec} from "../../functions/fieldLogoDesigns.mjs";
import {canManageOrganizationArchive, confirmOrganizationArchive} from "./OrganizationArchiveControls.jsx";

export default function VenueCarouselCard({venue, onEnter}) {
  const [user, setUser] = useState(auth.currentUser);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  const canDelete = canManageOrganizationArchive(user);
  async function deleteField() {
    if (!canDelete || deleting) return;
    setDeleting(true);
    try { await confirmOrganizationArchive({kind: "field", id: venue.id, name: venue.name}); }
    catch (error) {(await fieldAlert(error.message || "Could not archive this Field. Please try again."));}
    finally {setDeleting(false);}
  }
  const location = [venue.location?.suburb, venue.location?.city].filter(Boolean).join(", ");
  const clubCount = venue.league?.activeSeason?.clubIds?.length;
  const stockLogo = ["exclusive_stock", "local_designer"].includes(venue.branding?.logoSource) &&
    validSpec(venue.branding?.spec) ? svgDataUrl(renderFieldLogo(venue.branding.spec, venue.name)) : "";
  const profile = {
    ...venue,
    image: stockLogo || venue.branding?.carouselLogo || venue.branding?.logoUrl || venue.logoUrl || venue.image || "",
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
