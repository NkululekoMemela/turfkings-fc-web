const standardPlayers = ["Ari", "Bo", "Casey", "Drew", "Em", "Frankie", "Gray"];
export const practiceLeaguePlayers = standardPlayers;
export const initialLeagueDrill = () => ({stage:"invitation", selected:[], unavailable:"Gray"});
export const practiceLeagueEligible = (state, name) =>
  ["squad","submitted"].includes(state.stage) &&
  standardPlayers.slice(0, 6).includes(name) && state.unavailable !== name;

export function runLeagueDrill(state, action) {
  switch (action.type) {
  case "accept":
    return state.stage === "invitation" ? {...state, stage:"commitment"} : state;
  case "commit":
    return state.stage === "commitment" ? {...state, stage:"eligibility"} : state;
  case "confirmFunding":
    return state.stage === "eligibility" ? {...state, stage:"fieldEntry"} : state;
  case "confirmEntry":
    return state.stage === "fieldEntry" ? {...state, stage:"squad"} : state;
  case "availability":
    return ["eligibility","fieldEntry","squad"].includes(state.stage) &&
      ["", ...standardPlayers].includes(action.name)
      ? {...state, unavailable:action.name, selected:state.selected.filter(name => name !== action.name)} : state;
  case "toggle":
    return state.stage === "squad" && practiceLeagueEligible(state, action.name)
      ? {...state, selected:state.selected.includes(action.name)
        ? state.selected.filter(name => name !== action.name) : [...state.selected,action.name]} : state;
  case "submit":
    return state.stage === "squad" && state.selected.length >= 5 &&
      state.selected.every(name => practiceLeagueEligible(state,name))
      ? {...state,stage:"submitted"} : state;
  case "reset":
    return initialLeagueDrill();
  default:
    return state;
  }
}
