export const normalizeKitName = value => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g," ").toLowerCase();
export function jerseyNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  if (!/^\d{1,3}$/.test(String(value).trim())) throw new Error("Use a number from 0 to 999, or leave it unassigned.");
  return Number(value);
}
export const NO_NUMBER_REASONS = Object.freeze({inside_out:"Bib turned inside out",no_bib:"Playing without a bib",spare_unnumbered:"Spare unnumbered kit"});
const rawName = value => typeof value === "string" ? value : value?.fullName || value?.name || value?.displayName || value?.id || "";
export function profileForKit(raw, profiles, clubId = "") {
  const prefixed=typeof raw==="string" && raw.includes("::")?raw.split("::"):null;
  const referenceClub=clubId || prefixed?.[0] || "";
  const input = typeof raw === "object" ? [raw?.id,raw?.memberId,raw?.sourcePlayerId,rawName(raw)] : [raw,...(prefixed?[prefixed.at(-1)]:[])];
  const names = input.map(normalizeKitName).filter(Boolean);
  const candidates = profiles.filter(profile => (!referenceClub || !profile.clubId || profile.clubId === referenceClub) && [profile.id,profile.playerId,profile.sourcePlayerId,profile.sourceMemberId,profile.memberId,profile.fullName,profile.shortName,profile.name,...(profile.aliases || []),...(profile.profileNameAliases || [])].some(value => value && names.includes(normalizeKitName(value))));
  return candidates.length === 1 ? candidates[0] : null;
}
export function buildKitRoster(teams = [], profiles = [], snapshots = {}) {
  return teams.map(team => {
    const id = String(team.id), snapshot = snapshots?.[id] || {};
    const inputs = [...(team.players || []),...Object.values(snapshot.positions || {}),...(snapshot.benchSnapshot || []),...(snapshot.guestPlayers || [])].filter(Boolean);
    const rows = new Map();
    for (const raw of inputs) {
      const embedded = typeof raw === "object" ? raw : null;
      const resolved = profileForKit(raw,profiles,team.clubId || "");
      const profile = embedded ? {...(resolved || {}),...embedded} : resolved;
      const key = String(profile?.sourcePlayerId || profile?.playerId || profile?.id || profile?.memberId || normalizeKitName(rawName(raw))).trim();
      if (!key || key.length > 200 || Array.from(key).some(character=>character.charCodeAt(0)<32)) throw new Error("This lineup contains an invalid player identity.");
      if (rows.has(key)) continue;
      const name = String(profile?.fullName || profile?.name || rawName(raw)).trim();
      const aliases = [...new Set([key,name,rawName(raw),profile?.shortName,...(profile?.aliases || []),...(profile?.profileNameAliases || [])].filter(Boolean).map(normalizeKitName))];
      const saved = team.kitNumbers?.[key] ?? team.kitNumbers?.[normalizeKitName(rawName(raw))];
      const hasSaved = saved !== undefined;
      const value = hasSaved ? (typeof saved === "object" ? saved?.number : saved) : profile?.jerseyNumber;
      let number = null;
      try {number = jerseyNumber(value);} catch { number=hasSaved?value:null; }
      rows.set(key,{key,name,aliases,number,noNumberReason:"",source:hasSaved?"captain":number===null?"unassigned":"profile"});
    }
    const clubProfile=profiles.find(profile=>!team.clubId||profile.clubId===team.clubId)||{};
    return {id,label:team.label || team.name || id,clubId:team.clubId || "",homeColor:team.homeColor||clubProfile.clubHomeColor||"",awayColor:team.awayColor||clubProfile.clubAwayColor||"",kitChoice:team.kitChoice||"",kitColor:team.kitColor||"",players:[...rows.values()]};
  });
}
export function validateKitTeams(teams, {referee = false} = {}) {
  if (!Array.isArray(teams) || teams.length < 1 || teams.length > 4) throw new Error("Choose the participating teams.");
  const teamIds = new Set();
  return teams.map(team => {
    if (!team.id || teamIds.has(String(team.id)) || !Array.isArray(team.players) || !team.players.length || team.players.length > 50) throw new Error("The team roster is invalid.");
    teamIds.add(String(team.id));
    const seenKeys = new Set(), numbers = new Map();
    const players = team.players.map(row => {
      if (!row.key || seenKeys.has(row.key) || String(row.key).length > 200 || typeof row.name !== "string" || !row.name.trim() || row.name.length > 150) throw new Error("Each player must have a distinct lineup identity.");
      seenKeys.add(row.key);
      const number = jerseyNumber(row.number);
      const noNumberReason = number === null ? String(row.noNumberReason || "") : "";
      if (number !== null) {
        if (numbers.has(number)) throw new Error(`${team.label || team.id}: #${number} is assigned to ${numbers.get(number)} and ${row.name}. Use a spare number or let the referee approve an unnumbered kit.`);
        numbers.set(number,row.name);
      } else if (referee && !Object.hasOwn(NO_NUMBER_REASONS,noNumberReason)) {
        throw new Error(`Verify ${row.name}'s kit, or select why their number is hidden.`);
      }
      return {key:String(row.key),name:row.name.trim(),aliases:[...new Set([row.key,row.name,...(Array.isArray(row.aliases)?row.aliases:[])].map(normalizeKitName))].slice(0,25),number,noNumberReason,source:referee?"referee":row.source || "captain"};
    });
    const kitChoice=["home","away","other"].includes(team.kitChoice)?team.kitChoice:"";
    const color=value=>/^#[0-9a-f]{6}$/i.test(value||"")?value:"";
    return {id:String(team.id),label:String(team.label || team.id).slice(0,100),clubId:String(team.clubId || ""),kitChoice,kitColor:color(team.kitColor),homeColor:color(team.homeColor),awayColor:color(team.awayColor),players};
  });
}
export function kitRosterSignature(teams) {
  return JSON.stringify(teams.map(team=>[String(team.id),team.players.map(row=>row.key).sort()]).sort((a,b)=>a[0].localeCompare(b[0])));
}
export function numberForName(teams, name, teamId = "") {
  const key = normalizeKitName(name);
  const matches = teams.filter(team=>!teamId || String(team.id)===String(teamId)).flatMap(team=>team.players.filter(row=>row.key===name || (row.aliases || []).includes(key) || normalizeKitName(row.name)===key));
  if (matches.length !== 1) return "";
  return matches[0].number === null ? "No number" : `#${matches[0].number}`;
}
export function labelWithNumber(teams, raw, label, teamId = "") {
  const prefix = numberForName(teams,raw,teamId);
  return prefix ? `${prefix} · ${label}` : label;
}
