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

export default function VenueSquadsPage({venue, season, onBack}) {
  const days = (season?.matchDays || []).filter(day =>
    day.status === "scheduled" && day.dateLocal >= today()
  ).sort((a,b) => a.dateLocal.localeCompare(b.dateLocal));
  const [dayId,setDayId] = useState(days[0]?.id || "");
  const [data,setData] = useState(null);
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
    if (!dayId) return undefined;
    let disposed = false;
    let inFlight = false;
    async function load() {
      if (inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        const result = await getFieldMatchDaySquads({
          venueId:venue.id,seasonId:season.id,matchDayId:dayId,
        });
        if (!disposed) {setData(result);setError("");}
      } catch(failure) {if(!disposed)setError(failure.message);}
      finally {inFlight=false;}
    }
    setData(null); load();
    const timer = window.setInterval(load,30000);
    window.addEventListener("focus",load);
    document.addEventListener("visibilitychange",load);
    return () => {
      disposed=true; window.clearInterval(timer);
      window.removeEventListener("focus",load);
      document.removeEventListener("visibilitychange",load);
    };
  }, [venue.id,season.id,dayId]);
  const clubs = data?.clubs || [];
  const teams = clubs.filter(club => club.status !== "bye").map(club => ({
    ...club,id:club.clubId,
    players:(club.players || []).map(player => `${club.clubId}::${player.sourcePlayerId}`),
  }));
  const people = new Map(clubs.flatMap(club => (club.players || []).map(player => [
    `${club.clubId}::${player.sourcePlayerId}`,player,
  ])));


  return (
    <div className="page squads-page field-matchday-squads-page">

      {!season?.schedulePublishedAtMs || !days.length ? (
        <section className="card"><p>No upcoming published match day yet.</p></section>
      ) : (
        <>

          {error && <p role="alert" className="muted small">{error}</p>}
          {!data && !error && <p role="status" className="muted small">
            Preparing the upcoming teamsheet…
          </p>}

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
              dateLabel: data?.dateLocal
                ? new Intl.DateTimeFormat("en-ZA", {
                    day:"2-digit",month:"short",year:"numeric",
                  }).format(new Date(`${data.dateLocal}T12:00:00+02:00`))
                : "",
              scheduleLabel: "Five starters · one substitute",
            }}
            getTeamTheme={()=>({
              accent:"#e7b974",glow:"rgba(231,185,116,.18)",
            })}
            getChallengeTeamLogo={team=>team.logoUrl || ""}
            getPreviewTeamName={team=>team.name}
            getTeamIdentityVisual={()=>null}
            resolveSquadTeamIdentity={()=>null}
            displayNameOf={id=>{
              const player = people.get(id);
              const team = teams.find(item=>item.players.includes(id));
              return `${player?.fullName || ""}${
                team?.players.indexOf(id) === 5 ? " (Sub)" : ""
              }${player?.isFillIn ? " · Fill-in" : ""}`;
            }}
          />}
        </>
      )}
    </div>
  );
}
