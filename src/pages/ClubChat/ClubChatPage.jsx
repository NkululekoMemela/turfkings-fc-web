// src/pages/ClubChat/ClubChatPage.jsx
import React from "react";
import { ClubChatWidget } from "../../components/ClubChat/ClubChatWidget.jsx";

export function ClubChatPage({
  onBack,
  activeClubId,
  activeClubName,
  currentUser,
  selectedMember,
  identity,
  isAdminViewer,
  premiumPanelStyle,
}) {
  return (
    <main className="page-shell">
      <section className="card" style={premiumPanelStyle}>
        <button type="button" className="secondary-btn" onClick={onBack}>
          ← Back
        </button>
      </section>

      <ClubChatWidget
        activeClubId={activeClubId}
        activeClubName={activeClubName}
        currentUser={currentUser}
        selectedMember={selectedMember}
        identity={identity}
        isAdminViewer={isAdminViewer}
        premiumPanelStyle={premiumPanelStyle}
        variant="page"
      />
    </main>
  );
}
