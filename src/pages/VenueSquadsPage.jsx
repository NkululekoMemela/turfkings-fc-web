import {fieldMatchDays,fieldDateLabel} from "../core/fieldRouteSafety.mjs";
import {subscribeFieldManifest} from "../storage/fieldManifestSubscription.js";
import {fieldPageKey, readFieldPage, saveFieldPage} from "../storage/fieldPageMemory.js";
import "./VenueSquadsPage.css";
import React, {useEffect, useRef, useState} from "react";
import {toPng} from "html-to-image";
import SharedSquadTeamsheet from "../components/SharedSquadTeamsheet.jsx";
import {getFieldMatchDaySquads} from "../storage/fieldSeasonSquadRepository.js";
const noop = () => {};
const slots = [
  {label:"GK",x:50,y:88}, {label:"DEF",x:34,y:65},
  {label:"DEF",x:66,y:65}, {label:"MID",x:50,y:42},
  {label:"ST",x:50,y:20},
];
const today = () => new Intl.DateTimeFormat("en-CA", {
  timeZone:"Africa/Johannesburg",year:"numeric",month:"2-digit",day:"2-digit",
}).format(new Date());

export default function VenueSquadsPage({
  venue = {}, season = null, onBack, scope = null,
}) {
  const days = fieldMatchDays(season).filter(day =>
    day.status === "scheduled" && day.dateLocal >= today()
  ).sort((a,b) => a.dateLocal.localeCompare(b.dateLocal));
  const [dayId,setDayId] = useState(days[0]?.id || "");
  const memoryKey = fieldPageKey("squads", venue?.id, season?.id, dayId,scope?.environment||"official",scope?.practiceSessionId||"");
  const [data,setData] = useState(() => readFieldPage(memoryKey));
  const [error,setError] = useState("");
  const teamsheetRef = useRef(null);
  async function downloadTeamsheet() {
    if (!teamsheetRef.current) return;
    try {
      const url = await toPng(teamsheetRef.current, {
        pixelRatio: 2, backgroundColor: "#071326",
      });
      const link = document.createElement("a");
      link.download = `field-squads-${dayId}.png`;
      link.href = url;
      link.click();
    } catch (failure) {
      setError(failure.message || "Could not download the teamsheet.");
    }
  }
  useEffect(() => {
    setDayId(current => days.some(day => day.id === current) ? current : days[0]?.id || "");
  }, [season?.id, days.map(day => day.id).join("|")]);
  useEffect(() => {
    setError("");
    setData(readFieldPage(memoryKey));
    if (!dayId || !season?.id || !venue?.id || !season.schedulePublishedAtMs) return undefined;
    try{
    return subscribeFieldManifest({
      venueId: venue?.id, season, matchDayId: dayId, scope,
      onData: result => {saveFieldPage(memoryKey,result);setData(result); setError("");},
      onError: failure => setError(failure.message),
    });
    }catch(failure){setError(failure.message||"Could not load squads.");return undefined;}
  }, [
    venue?.id, season, dayId,
    scope?.environment, scope?.practiceSessionId,
  ]);

  const clubs = (Array.isArray(data?.clubs)?data.clubs:[]).filter(Boolean);
  const teams = clubs.filter(club => club.status !== "bye").map(club => ({
    ...club,id:club.clubId,
    players:(Array.isArray(club.players)?club.players:[]).filter(Boolean).map(player => `${club.clubId}::${player.sourcePlayerId}`),
  }));
  const people = new Map(clubs.flatMap(club => (Array.isArray(club.players)?club.players:[]).filter(Boolean).map(player => [
    `${club.clubId}::${player.sourcePlayerId}`,player,
  ])));


  return (
    <div className="page squads-page field-matchday-squads-page">

      {!season?.schedulePublishedAtMs || !days.length ? (
        <section className="card"><p>No upcoming published match day yet. Squads will appear once the Field publishes its fixtures.</p></section>
      ) : (
        <>

          {error && <p role="alert" className="muted small">{error}</p>}
          {!data && !error && <p role="status" className="muted small">
            Preparing the upcoming teamsheet…
          </p>}

          {data&&<p className="muted small">Fixture colours and numbers assigned automatically. Check the bibs on the pitch.</p>}
          {data && <SharedSquadTeamsheet
            fieldTeamsheet
            matchTeams={teams}
            isClubChallengeTeamsheet={false}
            teamsheetCardRef={teamsheetRef}
            handleSaveTeamsheetCardAsImage={downloadTeamsheet}
            activeClubLogo={venue.branding?.logoUrl || venue.logoUrl || "/pwa/icon-192.png"}
            TURF_KINGS_LOGO_URL="/pwa/icon-192.png"
            activeClubName={venue.name}
            teamsheetDisplayDateParts={{
              dateLabel: fieldDateLabel(data?.dateLocal),
              scheduleLabel: "Five starters · one substitute",
            }}
            getTeamTheme={team=>({accent:team.matchColour||"#e7b974",glow:"rgba(231,185,116,.18)"})}
            getChallengeTeamLogo={team=>team.logoUrl || ""}
            getPreviewTeamName={team=>team.name}
            getTeamIdentityVisual={()=>null}
            resolveSquadTeamIdentity={()=>null}
            displayNameOf={(id,teamId)=>{
              const player = people.get(id);
              const team = teams.find(item=>item.players.includes(id));
              return `${player?.jerseyNumber==null?"(-) ":`(${player.jerseyNumber}) `}${player?.fullName || ""}${
                team?.players.indexOf(id) === 5 ? " (Sub)" : ""
              }${player?.isFillIn ? " · Fill-in" : ""}`;
            }}
          />}
        </>
      )}
    </div>
  );
}
