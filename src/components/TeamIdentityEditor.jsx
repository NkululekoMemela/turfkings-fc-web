import React from "react";

export const TEAM_COLOUR_OPTIONS = [
  {
    name: "Black",
    hex: "#0F172A",
    emoji: "⚫",
    label: "Wear black",
  },
  {
    name: "White",
    hex: "#F8FAFC",
    emoji: "⚪",
    label: "Wear white",
  },
  {
    name: "Red",
    hex: "#DC2626",
    emoji: "🔴",
    label: "Wear red",
  },
  {
    name: "Blue",
    hex: "#38BDF8",
    emoji: "🔵",
    label: "Wear blue",
  },
  {
    name: "Green",
    hex: "#22C55E",
    emoji: "🟢",
    label: "Wear green",
  },
  {
    name: "Yellow",
    hex: "#D97706",
    emoji: "🟡",
    label: "Wear yellow",
  },
  {
    name: "Purple",
    hex: "#7C3AED",
    emoji: "🟣",
    label: "Wear purple",
  },
];

export function getTeamColourOption(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  return (
    TEAM_COLOUR_OPTIONS.find(
      (option) =>
        option.name.toLowerCase() === normalized
    ) || null
  );
}

export default function TeamIdentityEditor({
  team = null,
  name = "",
  abbreviation = "",
  colourName = "",
  showName = true,
  showAbbreviation = true,
  showColour = true,
  disabled = false,
  compact = false,
  nameLabel = "Team name",
  abbreviationLabel = "Abbreviation",
  colourLabel = "Wear colour",
  onNameChange = null,
  onAbbreviationChange = null,
  onColourChange = null,
  className = "",
}) {
  const resolvedColourName =
    String(
      colourName ||
      team?.teamColorName ||
      team?.colorName ||
      "Black"
    ).trim() || "Black";

  const selectedColour =
    getTeamColourOption(resolvedColourName) ||
    TEAM_COLOUR_OPTIONS[0];

  const handleColourChange = (event) => {
    const nextOption =
      getTeamColourOption(event.target.value) ||
      TEAM_COLOUR_OPTIONS[0];

    onColourChange?.({
      teamColorName: nextOption.name,
      colorName: nextOption.name,
      teamColorHex: nextOption.hex,
      colorHex: nextOption.hex,
      option: nextOption,
    });
  };

  return (
    <div
      className={[
        "team-identity-editor",
        compact ? "is-compact" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {showName ? (
        <label className="team-identity-editor-field">
          <span>{nameLabel}</span>

          <input
            type="text"
            className="text-input"
            value={name}
            onChange={(event) =>
              onNameChange?.(event.target.value)
            }
            disabled={disabled}
          />
        </label>
      ) : null}

      {showAbbreviation ? (
        <label className="team-identity-editor-field">
          <span>{abbreviationLabel}</span>

          <input
            type="text"
            className="text-input team-abbrev-input"
            value={abbreviation}
            onChange={(event) =>
              onAbbreviationChange?.(
                event.target.value
              )
            }
            disabled={disabled}
            maxLength={5}
          />
        </label>
      ) : null}

      {showColour ? (
        <label className="team-identity-editor-field team-identity-editor-colour">
          {!compact ? <span>{colourLabel}</span> : null}

          <span className="team-identity-editor-colour-control">
            <span
              className="team-identity-editor-swatch"
              style={{
                "--team-identity-colour":
                  selectedColour.hex,
              }}
              aria-hidden="true"
            />

            <select
              className={
                compact
                  ? "squad-preview-colour-select"
                  : "text-input"
              }
              value={selectedColour.name}
              onChange={handleColourChange}
              disabled={disabled}
              title={colourLabel}
            >
              {TEAM_COLOUR_OPTIONS.map(
                (option) => (
                  <option
                    key={option.name}
                    value={option.name}
                  >
                    {option.label} {option.emoji}
                  </option>
                )
              )}
            </select>
          </span>
        </label>
      ) : null}
    </div>
  );
}
