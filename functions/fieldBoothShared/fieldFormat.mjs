import {
  GAME_TYPE_5, GAME_TYPE_6, GAME_TYPE_7, GAME_TYPE_11,
  FORMATIONS_5, FORMATIONS_6, FORMATIONS_7, FORMATIONS_11,
  DEFAULT_FORMATION_ID_5, DEFAULT_FORMATION_ID_6, DEFAULT_FORMATION_ID_7, DEFAULT_FORMATION_ID_11,
} from "./lineups.mjs";

const formats = {
  "5_V_5": [5, GAME_TYPE_5, FORMATIONS_5, DEFAULT_FORMATION_ID_5],
  "6_V_6": [6, GAME_TYPE_6, FORMATIONS_6, DEFAULT_FORMATION_ID_6],
  "7_V_7": [7, GAME_TYPE_7, FORMATIONS_7, DEFAULT_FORMATION_ID_7],
  "11_V_11": [11, GAME_TYPE_11, FORMATIONS_11, DEFAULT_FORMATION_ID_11],
};

export function fieldFormat(value = "5_V_5") {
  if (!Object.hasOwn(formats, value)) throw new Error("Unsupported game format.");
  const [minimum, lineupKey, formations, defaultFormationId] = formats[value];
  return {minimum, maximum: minimum + 1, lineupKey, formations, defaultFormationId};
}
