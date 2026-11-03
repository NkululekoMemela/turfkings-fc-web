import React from 'react';
export default function EntryManagementButton(props){return <button type="button" {...props} style={{
                  width: "2.35rem",
                  height: "2.35rem",
                  marginLeft: "auto",
                  display: "inline-grid",
                  placeItems: "center",
                  borderRadius: "999px",
                  border: "1px solid rgba(56,189,248,0.28)",
                  background:
                    "linear-gradient(180deg, rgba(56,189,248,0.13), rgba(15,23,42,0.18))",
                  color: "#bae6fd",
                  cursor: "pointer",
                  boxShadow: "0 8px 22px rgba(2,6,23,0.18)",
                }}>
                <svg
                  width="19"
                  height="19"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.14.36.36.68.64.94.29.26.67.4 1.06.4H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51.66Z" />
                </svg>
              </button>;}
