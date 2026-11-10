import React from "react";
import "./ClubAdminNoticeHeader.css";

export default function ClubAdminNoticeHeader({icon, title, tag, count, titleId}) {
  return <div className="tk-admin-notification-topline">
    <div className="tk-admin-notification-icon" aria-hidden="true"><span>{icon}</span></div>
    <div className="tk-admin-notification-title-wrap">
      <div className="tk-admin-notification-title" id={titleId}>{title}</div>
      <div className="tk-admin-notification-tag">{tag}</div>
    </div>
    {count && <div className="tk-admin-notification-count-pill">{count}</div>}
  </div>;
}
