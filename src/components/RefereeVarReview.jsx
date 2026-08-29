import React, { useEffect, useMemo, useRef, useState } from "react";
import VideoHighlightsRepository from "../storage/VideoHighlightsRepository.js";

const VAR_WHISTLE_URL = `${import.meta.env.BASE_URL}alarm.mp4`;

export default function RefereeVarReview({
  enabled = false,
  matchId = "",
  clubId = "turf-kings",
}) {
  const [highlights, setHighlights] = useState([]);
  const [dismissedIds, setDismissedIds] = useState(() => new Set());
  const [selectedId, setSelectedId] = useState(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const knownVarIdsRef = useRef(new Set());
  const initialSnapshotSeenRef = useRef(false);
  const whistleRef = useRef(null);

  useEffect(() => {
    setHighlights([]);
    setDismissedIds(new Set());
    setSelectedId(null);
    setViewerOpen(false);
    setConfirmDeleteOpen(false);
    setDeleting(false);
    knownVarIdsRef.current = new Set();
    initialSnapshotSeenRef.current = false;

    console.log("[FANM VAR DEBUG] RefereeVarReview state", {
      enabled,
      matchId,
      clubId,
    });

    if (!enabled || !matchId) {
      console.warn("[FANM VAR DEBUG] Listener NOT started", {
        enabled,
        matchId,
        clubId,
      });
      return undefined;
    }

    console.log("[FANM VAR DEBUG] Starting listener", {
      matchId,
      clubId,
      expectedPath: `clubs/${clubId}/video_highlights/${matchId}/raw`,
    });

    const unsubscribe =
      VideoHighlightsRepository.subscribeToVarHighlights({
        matchId,
        clubId,

        onChange: (items) => {
          const safeItems = Array.isArray(items) ? items : [];

          console.log("[FANM VAR DEBUG] Component received VAR items", {
            matchId,
            clubId,
            count: safeItems.length,
            items: safeItems,
          });

          const incomingIds = new Set(
            safeItems.map((item) => item?.id).filter(Boolean)
          );

          if (!initialSnapshotSeenRef.current) {
            knownVarIdsRef.current = incomingIds;
            initialSnapshotSeenRef.current = true;
          } else {
            const hasNewVar = [...incomingIds].some(
              (id) => !knownVarIdsRef.current.has(id)
            );

            knownVarIdsRef.current = incomingIds;

            if (hasNewVar && typeof Audio !== "undefined") {
              try {
                if (!whistleRef.current) {
                  whistleRef.current = new Audio(VAR_WHISTLE_URL);
                  whistleRef.current.preload = "auto";
                  whistleRef.current.loop = false;
                  whistleRef.current.volume = 1;
                }

                const whistle = whistleRef.current;
                whistle.pause();
                whistle.currentTime = 0;

                const playPromise = whistle.play();

                if (playPromise?.catch) {
                  playPromise.catch((error) => {
                    console.warn(
                      "[FANM VAR] Whistle could not play:",
                      error?.message || error
                    );
                  });
                }

                window.setTimeout(() => {
                  try {
                    whistle.pause();
                    whistle.currentTime = 0;
                  } catch (_) {
                    // ignore
                  }
                }, 1000);
              } catch (error) {
                console.warn(
                  "[FANM VAR] Whistle failed:",
                  error?.message || error
                );
              }
            }
          }

          setHighlights(safeItems);
        },

        onError: (error) => {
          console.warn(
            "[FANM VAR] Shared referee VAR subscription failed:",
            error
          );
        },
      });

    return () => unsubscribe?.();
  }, [enabled, matchId, clubId]);

  const pendingHighlights = useMemo(
    () =>
      highlights.filter(
        (item) => item?.id && !dismissedIds.has(item.id)
      ),
    [highlights, dismissedIds]
  );

  const activeVar =
    pendingHighlights.find((item) => item.id === selectedId) ||
    pendingHighlights[0] ||
    null;

  useEffect(() => {
    if (!activeVar) {
      setSelectedId(null);
      setViewerOpen(false);
    }
  }, [activeVar]);

  if (!enabled || !activeVar) {
    return null;
  }

  const videoUrl =
    activeVar.downloadUrl ||
    activeVar.videoUrl ||
    activeVar.url ||
    "";

  const openViewer = () => {
    setSelectedId(activeVar.id);
    setViewerOpen(true);
  };

  const minimizeViewer = () => {
    setViewerOpen(false);
  };

  const closeReview = () => {
    if (!activeVar?.id || deleting) return;
    setConfirmDeleteOpen(true);
  };

  const keepReplay = () => {
    if (deleting) return;
    setConfirmDeleteOpen(false);
  };

  const deleteReplay = async () => {
    if (!activeVar?.id || deleting) return;

    setDeleting(true);
    setDeleteError("");

    try {
      await VideoHighlightsRepository.deleteVarHighlight({
        matchId,
        clubId,
        highlight: activeVar,
      });

      setConfirmDeleteOpen(false);
      setSelectedId(null);
      setViewerOpen(false);
    } catch (error) {
      console.error("[FANM VAR] Could not delete VAR replay:", error);
      setDeleteError(
        `${error?.code || "unknown"}: ${error?.message || String(error)}`
      );
      setDeleting(false);
    }
  };

  return (
    <>
      {!viewerOpen && (
        <button
          type="button"
          onClick={openViewer}
          aria-label="Open referee VAR replay"
          style={{
            position: "fixed",
            right: "16px",
            bottom: "88px",
            zIndex: 9998,
            minWidth: "88px",
            padding: "10px 16px",
            borderRadius: "14px",
            border: "3px solid #ffe600",
            background: "rgba(10, 10, 10, 0.94)",
            color: "#fff",
            boxShadow:
              "0 0 8px #ffe600, 0 0 20px rgba(255,230,0,0.72)",
            fontWeight: 900,
            fontSize: "1rem",
            letterSpacing: "0.12em",
            cursor: "pointer",
          }}
        >
          VAR
          <span
            style={{
              display: "block",
              marginTop: "2px",
              fontSize: "0.58rem",
              fontWeight: 700,
              letterSpacing: "0.03em",
              opacity: 0.9,
            }}
          >
            REPLAY READY
          </span>
        </button>
      )}

      {viewerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Private referee VAR review"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "12px",
            background: "rgba(0,0,0,0.68)",
          }}
        >
          <div
            style={{
              width: "min(94vw, 760px)",
              maxHeight: "94vh",
              overflowY: "auto",
              background: "#111",
              color: "#fff",
              border: "3px solid #ffe600",
              borderRadius: "16px",
              boxShadow:
                "0 0 12px #ffe600, 0 0 28px rgba(255,230,0,0.48)",
              padding: "14px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "12px",
                marginBottom: "10px",
              }}
            >
              <div>
                <strong
                  style={{
                    fontSize: "1.2rem",
                    letterSpacing: "0.12em",
                  }}
                >
                  VAR
                </strong>

                <div
                  style={{
                    marginTop: "2px",
                    fontSize: "0.72rem",
                    opacity: 0.75,
                  }}
                >
                  PRIVATE REFEREE REVIEW
                </div>
              </div>

              <button
                type="button"
                onClick={minimizeViewer}
                disabled={confirmDeleteOpen || deleting}
                style={{
                  border: "1px solid rgba(255,255,255,0.55)",
                  borderRadius: "10px",
                  background: "transparent",
                  color: "#fff",
                  padding: "8px 12px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Minimize
              </button>
            </div>

            {videoUrl ? (
              <video
                key={activeVar.id}
                src={videoUrl}
                controls
                autoPlay
                playsInline
                preload="auto"
                style={{
                  display: "block",
                  width: "100%",
                  maxHeight: "66vh",
                  background: "#000",
                  borderRadius: "12px",
                }}
              />
            ) : (
              <div
                style={{
                  padding: "28px 12px",
                  textAlign: "center",
                }}
              >
                <strong>VAR video is preparing…</strong>
                <div
                  style={{
                    marginTop: "6px",
                    fontSize: "0.8rem",
                    opacity: 0.7,
                  }}
                >
                  The replay will appear when the camera upload finishes.
                </div>
              </div>
            )}

            {confirmDeleteOpen ? (
              <div
                style={{
                  marginTop: "12px",
                  padding: "16px",
                  border: "2px solid #ffe600",
                  borderRadius: "14px",
                  background:
                    "linear-gradient(180deg, rgba(255,230,0,0.10), rgba(255,230,0,0.03))",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    color: "#ffe600",
                    fontWeight: 950,
                    fontSize: "1.05rem",
                    letterSpacing: "0.08em",
                  }}
                >
                  DISCARD VAR REPLAY?
                </div>

                <div
                  style={{
                    marginTop: "6px",
                    color: "rgba(255,255,255,0.78)",
                    fontSize: "0.82rem",
                  }}
                >
                  This replay will be permanently deleted.
                </div>

                {deleteError && (
                  <div
                    style={{
                      marginTop: "10px",
                      padding: "8px",
                      borderRadius: "8px",
                      background: "rgba(255,70,70,0.12)",
                      color: "#ff9a9a",
                      fontSize: "0.72rem",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {deleteError}
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    marginTop: "14px",
                  }}
                >
                  <button
                    type="button"
                    onClick={keepReplay}
                    disabled={deleting}
                    style={{
                      flex: 1,
                      borderRadius: "10px",
                      border: "1px solid rgba(255,255,255,0.45)",
                      background: "transparent",
                      color: "#fff",
                      padding: "11px",
                      fontWeight: 800,
                      cursor: deleting ? "default" : "pointer",
                    }}
                  >
                    KEEP REPLAY
                  </button>

                  <button
                    type="button"
                    onClick={deleteReplay}
                    disabled={deleting}
                    style={{
                      flex: 1,
                      borderRadius: "10px",
                      border: "2px solid #ffe600",
                      background: "#ffe600",
                      color: "#111",
                      padding: "11px",
                      fontWeight: 950,
                      cursor: deleting ? "wait" : "pointer",
                      opacity: deleting ? 0.72 : 1,
                    }}
                  >
                    {deleting ? "DELETING REPLAY…" : "DELETE REPLAY"}
                  </button>
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "10px",
                  marginTop: "12px",
                }}
              >
                <button
                  type="button"
                  onClick={minimizeViewer}
                  style={{
                    flex: 1,
                    borderRadius: "10px",
                    border: "1px solid rgba(255,255,255,0.45)",
                    background: "transparent",
                    color: "#fff",
                    padding: "10px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Minimize
                </button>

                <button
                  type="button"
                  onClick={closeReview}
                  style={{
                    flex: 1,
                    borderRadius: "10px",
                    border: "2px solid #ffe600",
                    background: "#ffe600",
                    color: "#111",
                    padding: "10px",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  Close review
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
