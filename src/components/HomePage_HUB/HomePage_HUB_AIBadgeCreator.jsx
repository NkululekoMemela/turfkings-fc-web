import React, { useMemo, useState } from "react";

const STYLE_OPTIONS = ["Modern", "Classic", "Luxury", "Aggressive", "Vintage", "Minimal"];

export default function HomePage_HUB_AIBadgeCreator({ clubDraft, onClose }) {
  const [style, setStyle] = useState("Modern");
  const [description, setDescription] = useState("");

  const prompt = useMemo(() => {
    return `Create a premium football club logo.

Club name: ${clubDraft?.clubName || "My Football Club"}

Style: ${style}

Logo idea: ${description || "Professional 5-a-side football club logo"}

Use a clean football identity suitable for an amateur football club profile.
Use green, white and black unless the badge idea says otherwise.
Make it high-resolution.
Use a transparent background.
Use a flat vector-style badge.
Avoid copyrighted club logos, real team badges, complex tiny details, and unreadable text.`;
  }, [clubDraft?.clubName, style, description]);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      window.alert("Prompt copied. Paste it into ChatGPT to create your logo.");
    } catch {
      window.alert("Copy the prompt manually, then paste it into ChatGPT.");
    }
  }

  async function continueToChatGPT() {
    await copyPrompt();
    window.open("https://chatgpt.com/", "_blank", "noreferrer");
  }

  return (
    <div className="hub-ai-badge-backdrop" role="presentation">
      <div className="hub-ai-badge-modal" role="dialog" aria-modal="true">
        <button type="button" className="hub-ai-badge-close" onClick={onClose}>×</button>

        <span className="hub-ai-badge-kicker">5 Asides Near Me</span>
        <h3>✨ AI Logo Creator</h3>
        <p>Prepare a premium logo prompt, then generate it on ChatGPT.</p>

        <label className="hub-field hub-field--wide">
          <span>Club name</span>
          <input value={clubDraft?.clubName || ""} disabled />
        </label>

        <label className="hub-field hub-field--wide">
          <span>Describe your badge</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Example: green and white, lion, bold round badge"
            rows={3}
          />
        </label>

        <div className="hub-ai-style-row">
          {STYLE_OPTIONS.map((item) => (
            <button
              key={item}
              type="button"
              className={style === item ? "is-selected" : ""}
              onClick={() => setStyle(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="hub-ai-prompt-box">
          <strong>Prompt preview</strong>
          <pre>{prompt}</pre>
        </div>

        <div className="hub-ai-badge-actions">
          <button type="button" className="hub-secondary-button" onClick={copyPrompt}>
            Copy prompt
          </button>
          <button type="button" className="hub-primary-button" onClick={continueToChatGPT}>
            Continue to ChatGPT
          </button>
        </div>
      </div>
    </div>
  );
}
