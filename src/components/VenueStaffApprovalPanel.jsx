import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

const ROLE_OPTIONS = [
  ["field_manager", "Field Manager"],
  ["assistant_manager", "Assistant Manager"],
  ["field_assistant", "Field Assistant"],
  ["other_staff", "Other field staff"],
  ["referee", "Referee"],
];

const ROLE_LABELS = Object.fromEntries(ROLE_OPTIONS);

export default function VenueStaffApprovalPanel({
  requests,
  venueName = "this Field",
  onClose,
  onReview,
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [roles, setRoles] = useState({});
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const pendingRequests = useMemo(
    () => Array.isArray(requests) ? requests : [],
    [requests]
  );

  const notificationCount = pendingRequests.length;

  useEffect(() => {
    if (notificationCount > 0) {
      setIsOpen(true);
    }
  }, [notificationCount]);

  useEffect(() => {
    setActiveIndex((current) =>
      Math.max(
        0,
        Math.min(
          current,
          Math.max(notificationCount - 1, 0)
        )
      )
    );
  }, [notificationCount]);

  const activeRequest =
    pendingRequests[
      Math.min(
        activeIndex,
        Math.max(notificationCount - 1, 0)
      )
    ] || null;

  const requestId =
    activeRequest?.id ||
    activeRequest?.uid ||
    "";

  const selectedRole =
    roles[requestId] ||
    activeRequest?.role ||
    "";

  async function review(decision) {
    if (!activeRequest || !requestId) return;

    if (!selectedRole) {
      setError(
        "Confirm this applicant’s Field role first."
      );
      return;
    }

    setBusyId(requestId);
    setError("");
    setMessage("");

    try {
      await onReview({
        staffUid:
          activeRequest.uid ||
          activeRequest.id,
        decision,
        role: selectedRole,
      });

      setMessage(
        decision === "approve"
          ? `${activeRequest.name || "Applicant"} approved.`
          : `${activeRequest.name || "Applicant"} rejected.`
      );
    } catch (reviewError) {
      setError(
        reviewError?.message ||
        "The Field Team request could not be reviewed."
      );
    } finally {
      setBusyId("");
    }
  }

  if (!notificationCount || !activeRequest) {
    return null;
  }

  return (
    <>
      <style>{`
        @keyframes fieldNoticePulse {
          0% {
            box-shadow:
              0 0 0 0 rgba(34,211,238,0.48),
              0 18px 48px rgba(2,6,23,0.46);
          }
          70% {
            box-shadow:
              0 0 0 17px rgba(34,211,238,0),
              0 18px 48px rgba(2,6,23,0.46);
          }
          100% {
            box-shadow:
              0 0 0 0 rgba(34,211,238,0),
              0 18px 48px rgba(2,6,23,0.46);
          }
        }

        @keyframes fieldNoticeRing {
          0%, 100% { transform: rotate(0deg); }
          15% { transform: rotate(13deg); }
          30% { transform: rotate(-11deg); }
          45% { transform: rotate(8deg); }
          60% { transform: rotate(-5deg); }
          75% { transform: rotate(2deg); }
        }

        @keyframes fieldNoticeFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }

        .field-admin-notification-dock {
          position: fixed;
          right: max(0.85rem, env(safe-area-inset-right));
          top: calc(5.15rem + env(safe-area-inset-top));
          z-index: 12500;
          width: min(420px, calc(100vw - 2rem));
          pointer-events: none;
        }

        .field-admin-notification-bell {
          pointer-events: auto;
          position: relative;
          margin-left: auto;
          width: 3.25rem;
          height: 3.25rem;
          border: 0;
          border-radius: 999px;
          cursor: pointer;
          display: grid;
          place-items: center;
          color: #020617;
          background:
            radial-gradient(
              circle at 28% 20%,
              rgba(255,255,255,0.35),
              transparent 25%
            ),
            linear-gradient(
              135deg,
              rgba(34,211,238,0.98),
              rgba(99,102,241,0.96)
            );
          animation:
            fieldNoticePulse 1.85s ease-out infinite,
            fieldNoticeFloat 2.6s ease-in-out infinite;
        }

        .field-admin-notification-bell-icon {
          display: inline-block;
          transform-origin: 50% 10%;
          font-size: 1.25rem;
          animation:
            fieldNoticeRing 1.35s ease-in-out infinite;
        }

        .field-admin-notification-count {
          position: absolute;
          top: -0.35rem;
          right: -0.25rem;
          min-width: 1.4rem;
          height: 1.4rem;
          padding: 0 0.3rem;
          display: grid;
          place-items: center;
          border-radius: 999px;
          color: white;
          background: #ef4444;
          border: 2px solid #071326;
          font-size: 0.72rem;
          font-weight: 900;
        }

        .field-admin-notification-card {
          pointer-events: auto;
          overflow: hidden;
          border-radius: 1.35rem;
          color: #e2e8f0;
          background:
            linear-gradient(
              145deg,
              rgba(10,30,55,0.99),
              rgba(7,19,38,0.99)
            );
          border:
            1px solid rgba(56,189,248,0.48);
          box-shadow:
            0 30px 90px rgba(0,0,0,0.62),
            0 0 42px rgba(34,211,238,0.15);
          backdrop-filter: blur(18px);
        }

        .field-admin-notification-topline {
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 0.8rem;
          padding: 1rem;
          background:
            linear-gradient(
              135deg,
              rgba(14,165,233,0.16),
              rgba(79,70,229,0.12)
            );
          border-bottom:
            1px solid rgba(56,189,248,0.2);
        }

        .field-admin-notification-icon {
          width: 2.65rem;
          height: 2.65rem;
          display: grid;
          place-items: center;
          border-radius: 0.9rem;
          font-size: 1.25rem;
          background: rgba(56,189,248,0.14);
          border:
            1px solid rgba(56,189,248,0.3);
        }

        .field-admin-notification-title {
          font-weight: 900;
          font-size: 1rem;
        }

        .field-admin-notification-tag {
          margin-top: 0.15rem;
          color: #7dd3fc;
          font-size: 0.68rem;
          font-weight: 850;
          letter-spacing: 0.07em;
          text-transform: uppercase;
        }

        .field-admin-notification-count-pill {
          padding: 0.25rem 0.5rem;
          border-radius: 999px;
          color: #bae6fd;
          background: rgba(14,165,233,0.12);
          border:
            1px solid rgba(56,189,248,0.28);
          font-size: 0.72rem;
          font-weight: 850;
          white-space: nowrap;
        }

        .field-admin-notification-body {
          padding: 1rem;
        }

        .field-admin-notification-message {
          margin: 0;
          line-height: 1.55;
        }

        .field-admin-notification-helper {
          margin: 0.55rem 0 0;
          color: #94a3b8;
          font-size: 0.8rem;
          line-height: 1.5;
        }

        .field-admin-notification-role {
          display: grid;
          gap: 0.4rem;
          margin-top: 0.9rem;
          font-size: 0.82rem;
          font-weight: 800;
        }

        .field-admin-notification-role select {
          width: 100%;
        }

        .field-admin-notification-actions {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          gap: 0.6rem;
          margin-top: 0.9rem;
        }

        .field-admin-notification-primary,
        .field-admin-notification-secondary,
        .field-admin-notification-nav-btn,
        .field-admin-notification-minimize {
          min-height: 2.35rem;
          border-radius: 999px;
          cursor: pointer;
          font-weight: 850;
        }

        .field-admin-notification-primary {
          border: 0;
          color: #020617;
          background:
            linear-gradient(
              135deg,
              #22d3ee,
              #5b6df8
            );
        }

        .field-admin-notification-secondary,
        .field-admin-notification-nav-btn,
        .field-admin-notification-minimize {
          color: #e2e8f0;
          background: rgba(15,23,42,0.72);
          border:
            1px solid rgba(148,163,184,0.3);
        }

        .field-admin-notification-secondary {
          color: #fecaca;
          border-color: rgba(248,113,113,0.42);
        }

        .field-admin-notification-nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.65rem;
          margin-top: 0.85rem;
        }

        .field-admin-notification-nav-buttons {
          display: flex;
          gap: 0.5rem;
        }

        .field-admin-notification-nav-btn,
        .field-admin-notification-minimize {
          min-height: 2rem;
          padding: 0.35rem 0.7rem;
          font-size: 0.76rem;
        }

        .field-admin-notification-card button:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }

        @media (max-width: 540px) {
          .field-admin-notification-dock {
            right: 0.7rem;
            top: calc(4.8rem + env(safe-area-inset-top));
            width: calc(100vw - 1.4rem);
          }
        }
      `}</style>

      <div
        className="field-admin-notification-dock"
        aria-live="polite"
      >
        {!isOpen ? (
          <button
            type="button"
            className="field-admin-notification-bell"
            onClick={() => setIsOpen(true)}
            aria-label={
              `Open ${notificationCount} ${venueName} ` +
              `notification${notificationCount === 1 ? "" : "s"}`
            }
          >
            <span
              className="field-admin-notification-bell-icon"
              aria-hidden="true"
            >
              🔔
            </span>

            <span className="field-admin-notification-count">
              {notificationCount}
            </span>
          </button>
        ) : (
          <article
            className="field-admin-notification-card"
            role="status"
          >
            <header className="field-admin-notification-topline">
              <div
                className="field-admin-notification-icon"
                aria-hidden="true"
              >
                ✨
              </div>

              <div>
                <div className="field-admin-notification-title">
                  New Field Team request
                </div>

                <div className="field-admin-notification-tag">
                  Pending signup
                </div>
              </div>

              <div className="field-admin-notification-count-pill">
                {activeIndex + 1} of {notificationCount}
              </div>
            </header>

            <div className="field-admin-notification-body">
              <p className="field-admin-notification-message">
                <strong>
                  {activeRequest.name ||
                    activeRequest.fullName ||
                    "A new applicant"}
                </strong>{" "}
                wants to join {venueName} as{" "}
                <strong>
                  {ROLE_LABELS[activeRequest.role] ||
                    "Field staff"}
                </strong>.
              </p>

              <p className="field-admin-notification-helper">
                Approve or reject this request directly here.
                Confirm the applicant’s real role before granting
                access.
              </p>

              <label className="field-admin-notification-role">
                Confirm Field role

                <select
                  required
                  value={selectedRole}
                  disabled={Boolean(busyId)}
                  onChange={(event) => {
                    setRoles((current) => ({
                      ...current,
                      [requestId]: event.target.value,
                    }));
                    setError("");
                    setMessage("");
                  }}
                >
                  <option value="">
                    Select the approved role…
                  </option>

                  {ROLE_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              {error && (
                <p
                  role="alert"
                  style={{
                    color: "#fca5a5",
                    fontWeight: 800,
                  }}
                >
                  {error}
                </p>
              )}

              {message && (
                <p
                  role="status"
                  style={{
                    color: "#86efac",
                    fontWeight: 800,
                  }}
                >
                  {message}
                </p>
              )}

              <div className="field-admin-notification-actions">
                <button
                  type="button"
                  className="field-admin-notification-primary"
                  disabled={
                    Boolean(busyId) || !selectedRole
                  }
                  onClick={() => review("approve")}
                >
                  {busyId ? "Reviewing…" : "Approve"}
                </button>

                <button
                  type="button"
                  className="field-admin-notification-secondary"
                  disabled={Boolean(busyId)}
                  onClick={() => review("reject")}
                >
                  Reject
                </button>
              </div>

              <div className="field-admin-notification-nav">
                <div className="field-admin-notification-nav-buttons">
                  <button
                    type="button"
                    className="field-admin-notification-nav-btn"
                    disabled={notificationCount <= 1}
                    onClick={() => {
                      setActiveIndex((index) =>
                        index <= 0
                          ? notificationCount - 1
                          : index - 1
                      );
                      setError("");
                      setMessage("");
                    }}
                  >
                    Back
                  </button>

                  <button
                    type="button"
                    className="field-admin-notification-nav-btn"
                    disabled={notificationCount <= 1}
                    onClick={() => {
                      setActiveIndex((index) =>
                        index >= notificationCount - 1
                          ? 0
                          : index + 1
                      );
                      setError("");
                      setMessage("");
                    }}
                  >
                    Next
                  </button>
                </div>

                <button
                  type="button"
                  className="field-admin-notification-minimize"
                  onClick={() => setIsOpen(false)}
                >
                  Minimize
                </button>
              </div>
            </div>
          </article>
        )}
      </div>
    </>
  );
}
