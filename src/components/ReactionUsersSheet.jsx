import React, { useEffect } from "react";
import { createPortal } from "react-dom";

export default function ReactionUsersSheet({
  open = false,
  title = "Reactions",
  groups = [],
  onClose,
}) {
  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const safeGroups = (Array.isArray(groups) ? groups : [])
    .map((group) => ({
      emoji: String(group?.emoji || "❤️"),
      users: (Array.isArray(group?.users) ? group.users : [])
        .filter(Boolean)
        .map((user, index) => ({
          key: String(
            user?.key ||
            user?.id ||
            user?.name ||
            `reaction-user-${index}`
          ),
          name: String(
            user?.name ||
            user?.displayName ||
            user?.label ||
            "Club member"
          ),
          photoUrl: String(
            user?.photoUrl ||
            user?.photoData ||
            user?.profilePhotoUrl ||
            ""
          ).trim(),
        })),
    }))
    .filter((group) => group.users.length > 0);

  const content = (
    <div
      className="fanm-reaction-users-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose?.();
        }
      }}
    >
      <section
        className="fanm-reaction-users-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="fanm-reaction-users-head">
          <div>
            <span className="fanm-reaction-users-kicker">
              FANM SOCIAL
            </span>
            <h3>{title}</h3>
          </div>

          <button
            type="button"
            className="fanm-reaction-users-close"
            onClick={() => onClose?.()}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {safeGroups.length ? (
          <div className="fanm-reaction-users-groups">
            {safeGroups.map((group, groupIndex) => (
              <div
                className="fanm-reaction-users-group"
                key={`${group.emoji}-${groupIndex}`}
              >
                <div className="fanm-reaction-users-emoji">
                  {group.emoji}
                </div>

                <div className="fanm-reaction-users-list">
                  {group.users.map((user) => (
                    <div
                      className="fanm-reaction-users-person"
                      key={user.key}
                    >
                      <span className="fanm-reaction-users-avatar">
                        {user.photoUrl ? (
                          <img
                            src={user.photoUrl}
                            alt=""
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          String(user.name || "?")
                            .trim()
                            .charAt(0)
                            .toUpperCase() || "?"
                        )}
                      </span>
                      <strong>{user.name}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="fanm-reaction-users-empty">
            No reactions yet.
          </div>
        )}
      </section>
    </div>
  );

  if (typeof document === "undefined") {
    return content;
  }

  return createPortal(content, document.body);
}
