import React from "react";
import HOME_STARTUP_ART from "../../assets/branding/logo-main-day.jpeg";
import LoadingSplash from "../LoadingSplash/LoadingSplash.jsx";

export default function HomePage_HUB_StartupSplash({
  progress = 0,
  message = "Preparing your football world...",
  authReady = false,
  clubsReady = false,
  exiting = false,
}) {
  const safeProgress = Math.max(
    0,
    Math.min(100, Math.round(Number(progress) || 0))
  );

  const homepageReady =
    authReady &&
    clubsReady &&
    safeProgress >= 100;

  return (
    <LoadingSplash
      progress={safeProgress}
      message={message}
      title="Preparing your football world..."
      kicker="Club-first football"
      image={HOME_STARTUP_ART}
      imageAlt="5 Asides Near Me"
      exiting={exiting}
      ariaLabel="5 Asides Near Me is loading"
      steps={[
        {
          icon: "👤",
          label: "Connecting to your account",
          state: authReady ? "done" : "active",
        },
        {
          icon: "⚽",
          label: "Loading clubs and venues",
          state: clubsReady
            ? "done"
            : authReady
              ? "active"
              : "",
        },
        {
          icon: "📍",
          label: "Preparing nearby football",
          state: homepageReady
            ? "done"
            : clubsReady
              ? "active"
              : "",
        },
      ]}
      footerLead="Club-first football. Built for players."
      footerStrong=" Powered by community."
    />
  );
}
