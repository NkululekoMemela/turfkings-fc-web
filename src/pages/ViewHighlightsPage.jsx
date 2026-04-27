import React, { useEffect, useMemo, useRef, useState } from "react";

function safeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function toTitleCaseLoose(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeHighlightType(type) {
  const key = safeLower(type);
  if (key.includes("goal")) return "goal";
  if (key.includes("save")) return "save";
  if (key.includes("skill")) return "skill";
  return "other";
}

function getIdentityKey(identity) {
  if (!identity || typeof identity !== "object") return "";
  return (
    identity.memberId ||
    identity.playerId ||
    identity.email ||
    identity.shortName ||
    identity.fullName ||
    identity.displayName ||
    ""
  )
    .toString()
    .trim()
    .toLowerCase();
}

function getIdentityDisplayName(identity) {
  if (!identity || typeof identity !== "object") return "Guest";
  return (
    identity.shortName ||
    identity.fullName ||
    identity.displayName ||
    identity.name ||
    identity.email ||
    "Guest"
  );
}

function getHighlightMediaUrl(highlight) {
  return (
    highlight?.videoUrl ||
    highlight?.downloadUrl ||
    highlight?.mediaUrl ||
    highlight?.fileUrl ||
    highlight?.uri ||
    ""
  );
}

function getHighlightId(highlight, index) {
  return (
    highlight?.clipId ||
    highlight?.id ||
    highlight?.highlightId ||
    `highlight-${index}`
  );
}

function getHighlightPlayerName(highlight) {
  return toTitleCaseLoose(
    highlight?.goalScorer ||
      highlight?.scorer ||
      highlight?.playerName ||
      highlight?.keeperName ||
      highlight?.skillPlayer ||
      "Unknown"
  );
}

function getHighlightTitle(highlight) {
  const type = normalizeHighlightType(highlight?.tag || highlight?.type || "");
  const player = getHighlightPlayerName(highlight);
  if (type === "goal") return `Goal by ${player}`;
  if (type === "save") return `Save by ${player}`;
  if (type === "skill") return `Skill by ${player}`;
  return highlight?.title || `Highlight by ${player}`;
}

function getVoteBuckets(votesByHighlight, highlights) {
  const buckets = {};
  (highlights || []).forEach((highlight, index) => {
    buckets[getHighlightId(highlight, index)] = 0;
  });

  Object.values(votesByHighlight || {}).forEach((userVote) => {
    Object.values(userVote || {}).forEach((highlightId) => {
      if (highlightId && buckets[highlightId] != null) {
        buckets[highlightId] += 1;
      }
    });
  });

  return buckets;
}

function buildArchiveSelection(highlights, votesByHighlight) {
  const safeHighlights = Array.isArray(highlights) ? highlights : [];
  const voteCounts = getVoteBuckets(votesByHighlight, safeHighlights);

  const enriched = safeHighlights.map((highlight, index) => {
    const id = getHighlightId(highlight, index);
    const type = normalizeHighlightType(highlight?.tag || highlight?.type || "");
    return {
      ...highlight,
      id,
      normalizedType: type,
      votes: voteCounts[id] || 0,
      playerName: getHighlightPlayerName(highlight),
      mediaUrl: getHighlightMediaUrl(highlight),
    };
  });

  const ranker = (a, b) => {
    if (b.votes !== a.votes) return b.votes - a.votes;
    const aTime = new Date(a.createdAt || a.timestamp || 0).getTime();
    const bTime = new Date(b.createdAt || b.timestamp || 0).getTime();
    return bTime - aTime;
  };

  const goals = enriched.filter((item) => item.normalizedType === "goal").sort(ranker);
  const skills = enriched.filter((item) => item.normalizedType === "skill").sort(ranker);
  const saves = enriched.filter((item) => item.normalizedType === "save").sort(ranker);

  const topGoals = goals.slice(0, 3);
  const bestSkill = skills[0] || null;
  const bestSave = saves[0] || null;

  const goalsByScorer = topGoals.reduce((acc, item) => {
    const key = item.playerName || "Unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  return {
    topGoals,
    bestSkill,
    bestSave,
    goalsByScorer,
  };
}

function buildLocalClipId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `clip-${crypto.randomUUID()}`;
  }
  return `clip-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getFileExtension(file) {
  const name = String(file?.name || "");
  const ext = name.includes(".") ? name.split(".").pop() : "mp4";
  return String(ext || "mp4").toLowerCase();
}

function formatFileSize(bytes) {
  const value = Number(bytes || 0);
  if (!value) return "0 MB";
  const mb = value / (1024 * 1024);
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
}

function getLikelyPlayersFromHighlights(highlights) {
  const names = new Set();

  (highlights || []).forEach((highlight) => {
    const name = getHighlightPlayerName(highlight);
    if (name && safeLower(name) !== "unknown") names.add(name);
  });

  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

const buttonBase = {
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "12px",
  padding: "0.7rem 0.95rem",
  cursor: "pointer",
  fontWeight: 700,
};

const inputBase = {
  width: "100%",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: "12px",
  padding: "0.75rem 0.85rem",
  background: "rgba(255,255,255,0.06)",
  color: "#e5e7eb",
  boxSizing: "border-box",
  outline: "none",
};

export function ViewHighlightsPage({
  identity,
  activeRole = "spectator",
  currentMatchDayHighlights = [],
  votesByUser = {},
  onVotesChange,
  onHighlightsSelectionChange,
  onBack,

  /*
    LOW-HANGING FRUIT VIDEO UPLOAD CONTRACT

    Preferred parent integration:
      onUploadHighlight({
        file,
        clipId,
        storageFileName,
        source,
        type,
        tag,
        playerName,
        goalScorer,
        keeperName,
        skillPlayer,
        assist,
        teamName,
        title,
        notes,
        durationSeconds,
        createdBy,
        createdByName,
        createdAt,
      })

    The parent can upload the file to Firebase Storage and save the Firestore
    raw_highlights document, then return either:
      { videoUrl, downloadUrl, storagePath, clipId, ...extraFields }

    This component also supports local preview mode if onUploadHighlight is not
    supplied, so the UI can be tested immediately before Firebase wiring.
  */
  onUploadHighlight,
  canUploadHighlights,
  availablePlayers = [],
  availableTeams = [],
}) {
  const [localVotesByUser, setLocalVotesByUser] = useState(votesByUser || {});
  const [localUploadedHighlights, setLocalUploadedHighlights] = useState([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [uploadStatus, setUploadStatus] = useState({ state: "idle", message: "" });
  const [uploadForm, setUploadForm] = useState({
    type: "goal",
    playerName: "",
    assist: "",
    teamName: "",
    title: "",
    notes: "",
  });
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFilePreviewUrl, setSelectedFilePreviewUrl] = useState("");
  const [viewportWidth, setViewportWidth] = useState(
    typeof window === "undefined" ? 1280 : window.innerWidth
  );

  const fileInputRef = useRef(null);

  useEffect(() => {
    setLocalVotesByUser(votesByUser || {});
  }, [votesByUser]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onResize = () => setViewportWidth(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    return () => {
      if (selectedFilePreviewUrl) URL.revokeObjectURL(selectedFilePreviewUrl);
      localUploadedHighlights.forEach((item) => {
        if (item?.isLocalPreview && item?.mediaUrl) URL.revokeObjectURL(item.mediaUrl);
      });
    };
  }, [selectedFilePreviewUrl, localUploadedHighlights]);

  const isMobile = viewportWidth <= 680;
  const isTablet = viewportWidth > 680 && viewportWidth <= 1100;

  const pageStyle = {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top, rgba(34,197,94,0.12), transparent 28%), linear-gradient(135deg, #0b2ea8 0%, #091347 36%, #6e3ec8 70%, #1f9f59 100%)",
    color: "#e5e7eb",
    padding: isMobile ? "12px" : "20px",
    boxSizing: "border-box",
  };

  const containerStyle = {
    maxWidth: "1480px",
    margin: "0 auto",
    display: "grid",
    gap: isMobile ? "12px" : "20px",
  };

  const cardStyle = {
    background: "rgba(6, 18, 42, 0.76)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: isMobile ? "16px" : "20px",
    padding: isMobile ? "14px" : "18px",
    boxShadow: "0 16px 40px rgba(0,0,0,0.22)",
    backdropFilter: "blur(10px)",
    minWidth: 0,
    overflow: "hidden",
    boxSizing: "border-box",
  };

  const identityKey = useMemo(() => getIdentityKey(identity), [identity]);
  const identityName = useMemo(() => getIdentityDisplayName(identity), [identity]);
  const isLoggedIn = Boolean(identityKey);
  const uploadEnabled = canUploadHighlights == null ? isLoggedIn : Boolean(canUploadHighlights);

  const baseHighlights = useMemo(() => {
    return Array.isArray(currentMatchDayHighlights) ? currentMatchDayHighlights : [];
  }, [currentMatchDayHighlights]);

  const combinedRawHighlights = useMemo(() => {
    return [...baseHighlights, ...localUploadedHighlights];
  }, [baseHighlights, localUploadedHighlights]);

  const highlights = useMemo(() => {
    return combinedRawHighlights.map((highlight, index) => ({
      ...highlight,
      id: getHighlightId(highlight, index),
      normalizedType: normalizeHighlightType(highlight?.tag || highlight?.type || ""),
      mediaUrl: getHighlightMediaUrl(highlight),
      playerName: getHighlightPlayerName(highlight),
      title: getHighlightTitle(highlight),
    }));
  }, [combinedRawHighlights]);

  const playerOptions = useMemo(() => {
    const names = new Set();

    (Array.isArray(availablePlayers) ? availablePlayers : []).forEach((player) => {
      if (typeof player === "string") {
        if (player.trim()) names.add(toTitleCaseLoose(player));
        return;
      }

      const name =
        player?.shortName ||
        player?.fullName ||
        player?.displayName ||
        player?.name ||
        player?.playerName ||
        "";

      if (String(name).trim()) names.add(toTitleCaseLoose(name));
    });

    getLikelyPlayersFromHighlights(highlights).forEach((name) => names.add(name));

    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [availablePlayers, highlights]);

  const teamOptions = useMemo(() => {
    const names = new Set();

    (Array.isArray(availableTeams) ? availableTeams : []).forEach((team) => {
      if (typeof team === "string") {
        if (team.trim()) names.add(toTitleCaseLoose(team));
        return;
      }

      const name = team?.name || team?.teamName || team?.label || team?.id || "";
      if (String(name).trim()) names.add(toTitleCaseLoose(name));
    });

    highlights.forEach((highlight) => {
      if (highlight?.teamName) names.add(toTitleCaseLoose(highlight.teamName));
    });

    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [availableTeams, highlights]);

  const voteCounts = useMemo(
    () => getVoteBuckets(localVotesByUser, highlights),
    [localVotesByUser, highlights]
  );

  const archiveSelection = useMemo(
    () => buildArchiveSelection(highlights, localVotesByUser),
    [highlights, localVotesByUser]
  );

  useEffect(() => {
    onHighlightsSelectionChange?.(archiveSelection);
  }, [archiveSelection, onHighlightsSelectionChange]);

  const visibleHighlights = useMemo(() => {
    if (activeFilter === "all") return highlights;
    return highlights.filter((item) => item.normalizedType === activeFilter);
  }, [highlights, activeFilter]);

  const userVotes = localVotesByUser[identityKey] || {};

  const resetUploadForm = () => {
    setUploadForm({
      type: "goal",
      playerName: "",
      assist: "",
      teamName: "",
      title: "",
      notes: "",
    });
    setSelectedFile(null);
    setUploadStatus({ state: "idle", message: "" });
    if (selectedFilePreviewUrl) URL.revokeObjectURL(selectedFilePreviewUrl);
    setSelectedFilePreviewUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const updateUploadField = (field, value) => {
    setUploadForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileChange = (event) => {
    const file = event?.target?.files?.[0] || null;

    if (selectedFilePreviewUrl) {
      URL.revokeObjectURL(selectedFilePreviewUrl);
      setSelectedFilePreviewUrl("");
    }

    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (!String(file.type || "").startsWith("video/")) {
      setSelectedFile(null);
      setUploadStatus({
        state: "error",
        message: "Please select a video file.",
      });
      return;
    }

    setSelectedFile(file);
    setSelectedFilePreviewUrl(URL.createObjectURL(file));
    setUploadStatus({ state: "idle", message: "" });
  };

  const castVote = (category, highlightId) => {
    if (!isLoggedIn) return;
    const next = {
      ...localVotesByUser,
      [identityKey]: {
        ...(localVotesByUser[identityKey] || {}),
        [category]: highlightId,
      },
    };
    setLocalVotesByUser(next);
    onVotesChange?.(next);
  };

  const downloadHighlight = (highlight) => {
    const url = highlight?.mediaUrl;
    if (!url) return;

    const a = document.createElement("a");
    a.href = url;
    a.download =
      highlight?.downloadName ||
      `${highlight.normalizedType || "highlight"}-${highlight.playerName || "clip"}.mp4`;
    a.target = "_blank";
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const submitUpload = async () => {
    if (!uploadEnabled) {
      setUploadStatus({
        state: "error",
        message: "You need permission to upload highlights.",
      });
      return;
    }

    if (!selectedFile) {
      setUploadStatus({
        state: "error",
        message: "Please choose a 15-second video clip first.",
      });
      return;
    }

    const cleanType = normalizeHighlightType(uploadForm.type);
    const cleanPlayer = toTitleCaseLoose(uploadForm.playerName);

    if (!cleanPlayer) {
      setUploadStatus({
        state: "error",
        message: "Please enter or select the player linked to this highlight.",
      });
      return;
    }

    const clipId = buildLocalClipId();
    const ext = getFileExtension(selectedFile);
    const createdAt = new Date().toISOString();
    const title =
      uploadForm.title.trim() ||
      (cleanType === "goal"
        ? `Goal by ${cleanPlayer}`
        : cleanType === "save"
        ? `Save by ${cleanPlayer}`
        : cleanType === "skill"
        ? `Skill by ${cleanPlayer}`
        : `Highlight by ${cleanPlayer}`);

    const payload = {
      file: selectedFile,
      clipId,
      id: clipId,
      highlightId: clipId,
      source: "manual_upload",
      storageFileName: `${clipId}.${ext}`,
      type: cleanType,
      tag: cleanType,
      playerName: cleanPlayer,
      goalScorer: cleanType === "goal" ? cleanPlayer : "",
      keeperName: cleanType === "save" ? cleanPlayer : "",
      skillPlayer: cleanType === "skill" ? cleanPlayer : "",
      assist: toTitleCaseLoose(uploadForm.assist),
      teamName: toTitleCaseLoose(uploadForm.teamName),
      title,
      notes: uploadForm.notes.trim(),
      durationSeconds: 15,
      createdBy: identityKey,
      createdByName: identityName,
      createdAt,
      timestamp: createdAt,
    };

    setUploadStatus({
      state: "uploading",
      message: "Uploading highlight...",
    });

    try {
      let savedHighlight = null;

      if (typeof onUploadHighlight === "function") {
        const result = await onUploadHighlight(payload);
        savedHighlight = {
          ...payload,
          ...(result || {}),
          file: undefined,
          mediaUrl:
            result?.mediaUrl ||
            result?.videoUrl ||
            result?.downloadUrl ||
            result?.fileUrl ||
            "",
          videoUrl:
            result?.videoUrl ||
            result?.downloadUrl ||
            result?.mediaUrl ||
            result?.fileUrl ||
            "",
        };
      } else {
        const localUrl = URL.createObjectURL(selectedFile);
        savedHighlight = {
          ...payload,
          file: undefined,
          mediaUrl: localUrl,
          videoUrl: localUrl,
          isLocalPreview: true,
          uploadWarning:
            "Local preview only. Wire onUploadHighlight in the parent to save to Firebase.",
        };
      }

      setLocalUploadedHighlights((prev) => [...prev, savedHighlight]);
      setUploadStatus({
        state: "success",
        message:
          typeof onUploadHighlight === "function"
            ? "Highlight uploaded."
            : "Local preview added. Firebase upload is not wired yet.",
      });

      setUploadForm({
        type: "goal",
        playerName: "",
        assist: "",
        teamName: "",
        title: "",
        notes: "",
      });
      setSelectedFile(null);
      if (selectedFilePreviewUrl) URL.revokeObjectURL(selectedFilePreviewUrl);
      setSelectedFilePreviewUrl("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setActiveFilter("all");
    } catch (error) {
      console.error("Failed to upload highlight:", error);
      setUploadStatus({
        state: "error",
        message: error?.message || "Failed to upload highlight. Please try again.",
      });
    }
  };

  const renderUploadPanel = () => {
    if (!showUploadPanel) return null;

    const disabled = uploadStatus.state === "uploading";

    return (
      <div style={cardStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "0.75rem",
            alignItems: "flex-start",
            flexWrap: "wrap",
            marginBottom: "1rem",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: isMobile ? "1.35rem" : "1.6rem" }}>
              Upload 15-second Highlight
            </h2>
            <div style={{ marginTop: "0.35rem", opacity: 0.78, fontSize: "0.94rem" }}>
              Use this for clips already saved on the phone. Pushit and 5 Asides Camera can later feed the same highlight format.
            </div>
          </div>

          <button
            type="button"
            onClick={resetUploadForm}
            disabled={disabled}
            style={{
              ...buttonBase,
              background: "rgba(255,255,255,0.04)",
              color: "#e5e7eb",
              opacity: disabled ? 0.6 : 1,
            }}
          >
            Reset
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) minmax(0, 1fr)",
            gap: "0.85rem",
          }}
        >
          <label style={{ display: "grid", gap: "0.35rem", minWidth: 0 }}>
            <span style={{ fontWeight: 800 }}>Clip file</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              capture="environment"
              onChange={handleFileChange}
              disabled={disabled || !uploadEnabled}
              style={inputBase}
            />
            {selectedFile && (
              <span style={{ opacity: 0.74, fontSize: "0.88rem" }}>
                {selectedFile.name} • {formatFileSize(selectedFile.size)}
              </span>
            )}
          </label>

          <label style={{ display: "grid", gap: "0.35rem", minWidth: 0 }}>
            <span style={{ fontWeight: 800 }}>Highlight type</span>
            <select
              value={uploadForm.type}
              onChange={(event) => updateUploadField("type", event.target.value)}
              disabled={disabled || !uploadEnabled}
              style={inputBase}
            >
              <option value="goal">Goal</option>
              <option value="save">Save</option>
              <option value="skill">Skill</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: "0.35rem", minWidth: 0 }}>
            <span style={{ fontWeight: 800 }}>
              {uploadForm.type === "save"
                ? "Keeper / player"
                : uploadForm.type === "skill"
                ? "Skill player"
                : "Goal scorer / player"}
            </span>
            <input
              list="highlight-player-options"
              value={uploadForm.playerName}
              onChange={(event) => updateUploadField("playerName", event.target.value)}
              disabled={disabled || !uploadEnabled}
              placeholder="e.g. Theo"
              style={inputBase}
            />
            <datalist id="highlight-player-options">
              {playerOptions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </label>

          <label style={{ display: "grid", gap: "0.35rem", minWidth: 0 }}>
            <span style={{ fontWeight: 800 }}>Team</span>
            <input
              list="highlight-team-options"
              value={uploadForm.teamName}
              onChange={(event) => updateUploadField("teamName", event.target.value)}
              disabled={disabled || !uploadEnabled}
              placeholder="Optional"
              style={inputBase}
            />
            <datalist id="highlight-team-options">
              {teamOptions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </label>

          {uploadForm.type === "goal" && (
            <label style={{ display: "grid", gap: "0.35rem", minWidth: 0 }}>
              <span style={{ fontWeight: 800 }}>Assist</span>
              <input
                list="highlight-player-options"
                value={uploadForm.assist}
                onChange={(event) => updateUploadField("assist", event.target.value)}
                disabled={disabled || !uploadEnabled}
                placeholder="Optional"
                style={inputBase}
              />
            </label>
          )}

          <label style={{ display: "grid", gap: "0.35rem", minWidth: 0 }}>
            <span style={{ fontWeight: 800 }}>Title override</span>
            <input
              value={uploadForm.title}
              onChange={(event) => updateUploadField("title", event.target.value)}
              disabled={disabled || !uploadEnabled}
              placeholder="Optional"
              style={inputBase}
            />
          </label>

          <label
            style={{
              display: "grid",
              gap: "0.35rem",
              minWidth: 0,
              gridColumn: isMobile ? "auto" : "1 / -1",
            }}
          >
            <span style={{ fontWeight: 800 }}>Notes</span>
            <textarea
              value={uploadForm.notes}
              onChange={(event) => updateUploadField("notes", event.target.value)}
              disabled={disabled || !uploadEnabled}
              placeholder="Optional: match number, moment, context..."
              rows={3}
              style={{ ...inputBase, resize: "vertical" }}
            />
          </label>
        </div>

        {selectedFilePreviewUrl && (
          <div style={{ marginTop: "1rem", display: "grid", gap: "0.55rem" }}>
            <strong>Preview</strong>
            <video
              controls
              preload="metadata"
              playsInline
              src={selectedFilePreviewUrl}
              style={{
                width: "100%",
                borderRadius: "16px",
                background: "#000000",
                maxHeight: isMobile ? "360px" : "520px",
                objectFit: "contain",
              }}
            />
          </div>
        )}

        {uploadStatus.message && (
          <div
            style={{
              marginTop: "1rem",
              padding: "0.8rem 0.9rem",
              borderRadius: "14px",
              border: "1px solid rgba(255,255,255,0.1)",
              background:
                uploadStatus.state === "error"
                  ? "rgba(239,68,68,0.16)"
                  : uploadStatus.state === "success"
                  ? "rgba(34,197,94,0.16)"
                  : "rgba(255,255,255,0.06)",
              color: "#e5e7eb",
              fontWeight: 700,
            }}
          >
            {uploadStatus.message}
          </div>
        )}

        <div
          style={{
            marginTop: "1rem",
            display: "flex",
            gap: "0.75rem",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <button
            type="button"
            onClick={submitUpload}
            disabled={disabled || !uploadEnabled}
            style={{
              ...buttonBase,
              background: "rgba(34,197,94,0.22)",
              color: "#e5e7eb",
              opacity: disabled || !uploadEnabled ? 0.6 : 1,
              width: isMobile ? "100%" : "auto",
              boxSizing: "border-box",
            }}
          >
            {uploadStatus.state === "uploading" ? "Uploading..." : "Save highlight"}
          </button>

          {!uploadEnabled && (
            <div style={{ opacity: 0.78, fontSize: "0.92rem" }}>
              Upload access is disabled for this user.
            </div>
          )}

          {typeof onUploadHighlight !== "function" && (
            <div style={{ opacity: 0.78, fontSize: "0.92rem", flex: "1 1 320px" }}>
              Developer note: wire <strong>onUploadHighlight</strong> from the parent to upload to Firebase Storage.
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderVotePanel = (category, titleText) => {
    const candidates = highlights.filter((item) => item.normalizedType === category);

    return (
      <div style={cardStyle}>
        <h3 style={{ marginTop: 0, marginBottom: "0.85rem", fontSize: isMobile ? "1.02rem" : "1.15rem" }}>
          {titleText}
        </h3>

        {!candidates.length && (
          <div style={{ opacity: 0.74 }}>No {category} highlights yet for this match day.</div>
        )}

        <div style={{ display: "grid", gap: "0.55rem" }}>
          {candidates.map((item) => {
            const selected = userVotes[category] === item.id;
            return (
              <button
                key={`${category}-${item.id}`}
                type="button"
                onClick={() => castVote(category, item.id)}
                disabled={!isLoggedIn}
                style={{
                  ...buttonBase,
                  textAlign: "left",
                  background: selected ? "rgba(34,197,94,0.22)" : "rgba(255,255,255,0.04)",
                  color: "#e5e7eb",
                  opacity: !isLoggedIn ? 0.65 : 1,
                  width: "100%",
                  fontSize: isMobile ? "0.92rem" : "1rem",
                  minWidth: 0,
                  boxSizing: "border-box",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{item.title}</span>
                  <span style={{ whiteSpace: "nowrap" }}>{voteCounts[item.id] || 0} vote(s)</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isTablet || isMobile ? "1fr" : "minmax(0, 2.2fr) minmax(320px, 1fr)",
            gap: isMobile ? "12px" : "20px",
            alignItems: "start",
          }}
        >
          <div style={{ display: "grid", gap: isMobile ? "12px" : "20px", minWidth: 0 }}>
            <div
              style={{
                ...cardStyle,
                display: "flex",
                justifyContent: "space-between",
                alignItems: isMobile ? "flex-start" : "center",
                gap: "1rem",
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: 0, flex: "1 1 320px" }}>
                <h1
                  style={{
                    margin: 0,
                    fontSize: isMobile ? "2rem" : "clamp(2.3rem, 4vw, 3.2rem)",
                    lineHeight: 1.05,
                    overflowWrap: "anywhere",
                  }}
                >
                  View Highlights
                </h1>
                <div style={{ marginTop: "0.45rem", opacity: 0.8, fontSize: isMobile ? "0.95rem" : "1rem" }}>
                  Upload, watch, vote, and prepare the best clips for archiving
                </div>
                <div style={{ marginTop: "0.3rem", fontSize: isMobile ? "0.9rem" : "0.96rem", opacity: 0.8 }}>
                  Viewing as <strong>{identityName}</strong> • Role: <strong>{activeRole}</strong>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "0.75rem",
                  flexWrap: "wrap",
                  width: isMobile ? "100%" : "auto",
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowUploadPanel((prev) => !prev)}
                  style={{
                    ...buttonBase,
                    background: showUploadPanel ? "rgba(34,197,94,0.22)" : "rgba(255,255,255,0.04)",
                    color: "#e5e7eb",
                    minWidth: isMobile ? "100%" : "150px",
                    width: isMobile ? "100%" : "auto",
                    boxSizing: "border-box",
                  }}
                >
                  {showUploadPanel ? "Close upload" : "Upload clip"}
                </button>

                <button
                  type="button"
                  onClick={onBack}
                  style={{
                    ...buttonBase,
                    background: "rgba(255,255,255,0.04)",
                    color: "#e5e7eb",
                    minWidth: isMobile ? "100%" : "112px",
                    width: isMobile ? "100%" : "auto",
                    boxSizing: "border-box",
                  }}
                >
                  ← Back
                </button>
              </div>
            </div>

            {renderUploadPanel()}

            <div
              style={{
                ...cardStyle,
                display: "flex",
                gap: "0.55rem",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              {["all", "goal", "skill", "save", "other"].map((filterKey) => {
                const active = activeFilter === filterKey;
                return (
                  <button
                    key={filterKey}
                    type="button"
                    onClick={() => setActiveFilter(filterKey)}
                    style={{
                      ...buttonBase,
                      background: active ? "rgba(34,197,94,0.18)" : "rgba(255,255,255,0.04)",
                      color: "#e5e7eb",
                      flex: isMobile ? "1 1 calc(50% - 6px)" : "0 0 auto",
                      minWidth: isMobile ? "0" : "auto",
                      boxSizing: "border-box",
                    }}
                  >
                    {filterKey === "all" ? "All" : toTitleCaseLoose(filterKey)}
                  </button>
                );
              })}
              {!isLoggedIn && (
                <div
                  style={{
                    marginLeft: isMobile ? 0 : "auto",
                    fontSize: "0.92rem",
                    opacity: 0.8,
                    width: isMobile ? "100%" : "auto",
                  }}
                >
                  Log in to vote for goal, skill, and save of the night.
                </div>
              )}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile
                  ? "1fr"
                  : isTablet
                  ? "repeat(2, minmax(0, 1fr))"
                  : "repeat(3, minmax(0, 1fr))",
                gap: isMobile ? "12px" : "20px",
                alignItems: "stretch",
              }}
            >
              {renderVotePanel("goal", "Vote: Goal of the Night")}
              {renderVotePanel("skill", "Vote: Skill of the Night")}
              {renderVotePanel("save", "Vote: Save of the Night")}
            </div>

            <div style={{ display: "grid", gap: isMobile ? "12px" : "20px" }}>
              {!visibleHighlights.length && (
                <div style={cardStyle}>No highlights are available for this match day yet.</div>
              )}

              {visibleHighlights.map((highlight) => (
                <div
                  key={highlight.id}
                  style={{
                    ...cardStyle,
                    display: "grid",
                    gap: "14px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "0.75rem",
                      flexWrap: "wrap",
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ minWidth: 0, flex: "1 1 300px" }}>
                      <h3
                        style={{
                          margin: 0,
                          fontSize: isMobile ? "1.15rem" : "1.35rem",
                          lineHeight: 1.15,
                          overflowWrap: "anywhere",
                        }}
                      >
                        {highlight.title}
                      </h3>
                      <div style={{ marginTop: "0.45rem", opacity: 0.8, fontSize: isMobile ? "0.92rem" : "0.98rem" }}>
                        {toTitleCaseLoose(highlight.normalizedType)} • {highlight.playerName}
                        {highlight.teamName ? ` • ${highlight.teamName}` : ""}
                        {highlight.source ? ` • ${toTitleCaseLoose(String(highlight.source).replace(/_/g, " "))}` : ""}
                      </div>
                      {highlight.assist && (
                        <div style={{ marginTop: "0.25rem", opacity: 0.74, fontSize: "0.9rem" }}>
                          Assist: <strong>{highlight.assist}</strong>
                        </div>
                      )}
                      {highlight.uploadWarning && (
                        <div style={{ marginTop: "0.45rem", opacity: 0.78, fontSize: "0.88rem" }}>
                          {highlight.uploadWarning}
                        </div>
                      )}
                    </div>

                    <div style={{ textAlign: isMobile ? "left" : "right", minWidth: isMobile ? "100%" : "90px" }}>
                      <div style={{ fontSize: "0.88rem", opacity: 0.75 }}>Votes</div>
                      <div style={{ fontWeight: 800, fontSize: "1.3rem" }}>
                        {voteCounts[highlight.id] || 0}
                      </div>
                    </div>
                  </div>

                  {highlight.mediaUrl ? (
                    <video
                      controls
                      preload="metadata"
                      playsInline
                      style={{
                        width: "100%",
                        borderRadius: "16px",
                        background: "#000000",
                        maxHeight: isMobile ? "420px" : "680px",
                        objectFit: "contain",
                      }}
                      src={highlight.mediaUrl}
                    />
                  ) : (
                    <div
                      style={{
                        borderRadius: "14px",
                        border: "1px dashed rgba(255,255,255,0.14)",
                        padding: "1rem",
                        opacity: 0.76,
                      }}
                    >
                      No media URL yet for this highlight.
                    </div>
                  )}

                  <div
                    style={{
                      display: "flex",
                      gap: "0.75rem",
                      flexWrap: "wrap",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => downloadHighlight(highlight)}
                      disabled={!highlight.mediaUrl}
                      style={{
                        ...buttonBase,
                        background: "rgba(34,197,94,0.16)",
                        color: "#e5e7eb",
                        opacity: highlight.mediaUrl ? 1 : 0.55,
                        width: isMobile ? "100%" : "auto",
                        boxSizing: "border-box",
                      }}
                    >
                      ⬇ Download highlight
                    </button>

                    <div
                      style={{
                        opacity: 0.8,
                        fontSize: isMobile ? "0.9rem" : "0.94rem",
                        flex: "1 1 320px",
                        minWidth: 0,
                      }}
                    >
                      {highlight.normalizedType === "goal" && (
                        <>If this goal finishes in the top 3 by End Match Day, it should be archived under <strong>{highlight.playerName}</strong>.</>
                      )}
                      {highlight.normalizedType === "skill" && (
                        <>Only the winning skill should survive when End Match Day is confirmed.</>
                      )}
                      {highlight.normalizedType === "save" && (
                        <>Only the winning save should survive when End Match Day is confirmed.</>
                      )}
                      {highlight.normalizedType === "other" && (
                        <>This clip is available to watch, but it is not part of the goal, skill, or save voting categories.</>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gap: isMobile ? "12px" : "20px", minWidth: 0 }}>
            <div
              style={{
                ...cardStyle,
                display: "grid",
                gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "1fr",
                gap: "16px",
              }}
            >
              <div>
                <div style={{ fontSize: "0.85rem", opacity: 0.75 }}>Total clips</div>
                <div style={{ fontWeight: 800, fontSize: isMobile ? "1.6rem" : "2rem", lineHeight: 1.1 }}>
                  {highlights.length}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "0.85rem", opacity: 0.75 }}>Top goals to archive</div>
                <div style={{ fontWeight: 800, fontSize: isMobile ? "1.6rem" : "2rem", lineHeight: 1.1 }}>
                  {archiveSelection.topGoals.length}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "0.85rem", opacity: 0.75 }}>Best skill chosen</div>
                <div style={{ fontWeight: 800, fontSize: isMobile ? "1rem" : "1.08rem", overflowWrap: "anywhere" }}>
                  {archiveSelection.bestSkill?.playerName || "Pending"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "0.85rem", opacity: 0.75 }}>Best save chosen</div>
                <div style={{ fontWeight: 800, fontSize: isMobile ? "1rem" : "1.08rem", overflowWrap: "anywhere" }}>
                  {archiveSelection.bestSave?.playerName || "Pending"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "0.85rem", opacity: 0.75 }}>Voting access</div>
                <div style={{ fontWeight: 800, fontSize: isMobile ? "1rem" : "1.08rem" }}>
                  {isLoggedIn ? "Enabled" : "Login required"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "0.85rem", opacity: 0.75 }}>Upload access</div>
                <div style={{ fontWeight: 800, fontSize: isMobile ? "1rem" : "1.08rem" }}>
                  {uploadEnabled ? "Enabled" : "Disabled"}
                </div>
              </div>
            </div>

            <div style={cardStyle}>
              <h3 style={{ marginTop: 0, fontSize: isMobile ? "1.1rem" : "1.3rem" }}>
                Archive snapshot for End Match Day
              </h3>

              <div style={{ display: "grid", gap: "1rem" }}>
                <div>
                  <strong>Top 3 goals</strong>
                  <div style={{ marginTop: "0.45rem", display: "grid", gap: "0.4rem" }}>
                    {archiveSelection.topGoals.length ? (
                      archiveSelection.topGoals.map((item, index) => (
                        <div key={`top-goal-${item.id}`} style={{ overflowWrap: "anywhere" }}>
                          {index + 1}. {item.playerName} • {item.votes} vote(s)
                        </div>
                      ))
                    ) : (
                      <div style={{ opacity: 0.74 }}>No goals selected yet.</div>
                    )}
                  </div>
                </div>

                <div>
                  <strong>Best skill</strong>
                  <div style={{ marginTop: "0.35rem", opacity: 0.86, overflowWrap: "anywhere" }}>
                    {archiveSelection.bestSkill
                      ? `${archiveSelection.bestSkill.playerName} • ${archiveSelection.bestSkill.votes} vote(s)`
                      : "No skill selected yet."}
                  </div>
                </div>

                <div>
                  <strong>Best save</strong>
                  <div style={{ marginTop: "0.35rem", opacity: 0.86, overflowWrap: "anywhere" }}>
                    {archiveSelection.bestSave
                      ? `${archiveSelection.bestSave.playerName} • ${archiveSelection.bestSave.votes} vote(s)`
                      : "No save selected yet."}
                  </div>
                </div>
              </div>
            </div>

            <div style={cardStyle}>
              <h3 style={{ marginTop: 0, fontSize: isMobile ? "1.1rem" : "1.3rem" }}>
                Provider-ready structure
              </h3>
              <div style={{ display: "grid", gap: "0.55rem", opacity: 0.86, fontSize: "0.94rem" }}>
                <div><strong>manual_upload</strong> — phone memory upload, ready now.</div>
                <div><strong>five_asides_camera</strong> — same metadata shape later from your own camera app.</div>
                <div><strong>pushit</strong> — same metadata shape later from imported Pushit clips.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ViewHighlightsPage;