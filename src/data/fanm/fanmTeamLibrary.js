export const FANM_NATIONAL_TEAMS = [
  { type: "national", abbr: "RSA", name: "South Africa", flag: "🇿🇦", region: "Popular" },
  { type: "national", abbr: "ARG", name: "Argentina", flag: "🇦🇷", region: "Popular" },
  { type: "national", abbr: "BRA", name: "Brazil", flag: "🇧🇷", region: "Popular" },
  { type: "national", abbr: "FRA", name: "France", flag: "🇫🇷", region: "Popular" },
  { type: "national", abbr: "ESP", name: "Spain", flag: "🇪🇸", region: "Popular" },
  { type: "national", abbr: "ENG", name: "England", flag: "🇬🇧", region: "Popular" },
  { type: "national", abbr: "GER", name: "Germany", flag: "🇩🇪", region: "Europe" },
  { type: "national", abbr: "ITA", name: "Italy", flag: "🇮🇹", region: "Europe" },
  { type: "national", abbr: "POR", name: "Portugal", flag: "🇵🇹", region: "Europe" },
  { type: "national", abbr: "NED", name: "Netherlands", flag: "🇳🇱", region: "Europe" },
  { type: "national", abbr: "NGA", name: "Nigeria", flag: "🇳🇬", region: "Africa" },
  { type: "national", abbr: "GHA", name: "Ghana", flag: "🇬🇭", region: "Africa" },
  { type: "national", abbr: "MAR", name: "Morocco", flag: "🇲🇦", region: "Africa" },
  { type: "national", abbr: "EGY", name: "Egypt", flag: "🇪🇬", region: "Africa" },
  { type: "national", abbr: "SEN", name: "Senegal", flag: "🇸🇳", region: "Africa" },
  { type: "national", abbr: "CMR", name: "Cameroon", flag: "🇨🇲", region: "Africa" },
  { type: "national", abbr: "CIV", name: "Ivory Coast", flag: "🇨🇮", region: "Africa" },
  { type: "national", abbr: "USA", name: "United States", flag: "🇺🇸", region: "Americas" },
  { type: "national", abbr: "CUW", name: "Curaçao", flag: "🇨🇼", region: "Americas" },
  { type: "national", abbr: "URU", name: "Uruguay", flag: "🇺🇾", region: "Americas" },
  { type: "national", abbr: "COL", name: "Colombia", flag: "🇨🇴", region: "Americas" },
  { type: "national", abbr: "JPN", name: "Japan", flag: "🇯🇵", region: "Asia" },
  { type: "national", abbr: "KOR", name: "South Korea", flag: "🇰🇷", region: "Asia" },
];

export const FANM_PRO_CLUBS = [
  { type: "club", abbr: "MUN", name: "Manchester United", leagueGroup: "EPL", logo32: "/fanm-assets/pro-clubs/svg/MUN.svg" },
  { type: "club", abbr: "LIV", name: "Liverpool", leagueGroup: "EPL", logo32: "/fanm-assets/pro-clubs/svg/LIV.svg" },
  { type: "club", abbr: "ARS", name: "Arsenal", leagueGroup: "EPL", logo32: "/fanm-assets/pro-clubs/svg/ARS.svg" },
  { type: "club", abbr: "CHE", name: "Chelsea", leagueGroup: "EPL", logo32: "/fanm-assets/pro-clubs/svg/CHE.svg" },
  { type: "club", abbr: "MCI", name: "Manchester City", leagueGroup: "EPL", logo32: "/fanm-assets/pro-clubs/svg/MCI.svg" },
  { type: "club", abbr: "TOT", name: "Tottenham Hotspur", leagueGroup: "EPL", logo32: "/fanm-assets/pro-clubs/svg/TOT.svg" },
  { type: "club", abbr: "NEW", name: "Newcastle United", leagueGroup: "EPL", logo32: "/fanm-assets/pro-clubs/svg/NEW.svg" },
  { type: "club", abbr: "RMA", name: "Real Madrid", leagueGroup: "LaLiga", logo32: "/fanm-assets/pro-clubs/svg/RMA.svg" },
  { type: "club", abbr: "BAR", name: "Barcelona", leagueGroup: "LaLiga", logo32: "/fanm-assets/pro-clubs/svg/BAR.svg" },
  { type: "club", abbr: "BAY", name: "Bayern Munich", leagueGroup: "Bundesliga", logo32: "/fanm-assets/pro-clubs/svg/BAY.svg" },
  { type: "club", abbr: "DOR", name: "Borussia Dortmund", leagueGroup: "Bundesliga", logo32: "/fanm-assets/pro-clubs/svg/DOR.svg" },
  { type: "club", abbr: "MIL", name: "AC Milan", leagueGroup: "Serie A", logo32: "/fanm-assets/pro-clubs/svg/MIL.svg" },
  { type: "club", abbr: "INT", name: "Inter Milan", leagueGroup: "Serie A", logo32: "/fanm-assets/pro-clubs/svg/INT.svg" },
  { type: "club", abbr: "NAP", name: "Napoli", leagueGroup: "Serie A", logo32: "/fanm-assets/pro-clubs/svg/NAP.svg" },
  { type: "club", abbr: "PSG", name: "Paris Saint-Germain", leagueGroup: "Europe", logo32: "/fanm-assets/pro-clubs/svg/PSG.svg" },
  { type: "club", abbr: "BEN", name: "Benfica", leagueGroup: "Europe", logo32: "/fanm-assets/pro-clubs/svg/BEN.svg" },
  { type: "club", abbr: "POR", name: "Porto", leagueGroup: "Europe", logo32: "/fanm-assets/pro-clubs/svg/POR.svg" },
  { type: "club", abbr: "AJA", name: "Ajax", leagueGroup: "Europe", logo32: "/fanm-assets/pro-clubs/svg/AJA.svg" },
  { type: "club", abbr: "PSV", name: "PSV Eindhoven", leagueGroup: "Europe", logo32: "/fanm-assets/pro-clubs/svg/PSV.svg" },
  { type: "club", abbr: "MAR", name: "Marseille", leagueGroup: "Europe", logo32: "/fanm-assets/pro-clubs/svg/MAR.svg" },
];

export const groupBy = (items, key) =>
  items.reduce((acc, item) => {
    const group = item[key] || "Other";
    acc[group] = acc[group] || [];
    acc[group].push(item);
    return acc;
  }, {});
