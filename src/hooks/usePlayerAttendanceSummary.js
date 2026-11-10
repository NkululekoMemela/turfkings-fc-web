import {useEffect, useMemo, useState} from "react";
import {collection, getDocs} from "firebase/firestore";
import {db} from "../firebaseConfig.js";
import {buildPlayerAttendanceSummary, savedClubAttendanceDays} from "../core/playerAttendanceSummary.mjs";

export function usePlayerAttendanceSummary({clubId, report, member, teams}) {
  const days = useMemo(() => savedClubAttendanceDays(report.state), [report.state]);
  const fallbackClub = member?.id && clubId && !report.loading && !report.error && !days.length ? clubId : "";
  const [fallback, setFallback] = useState(null);
  useEffect(() => {
    if (!fallbackClub) return;
    let active = true;
    setFallback(null);
    async function load() {
      try {
        const seasons = await getDocs(collection(db, "clubs", fallbackClub, "seasons"));
        if (!active) return;
        const results = await Promise.allSettled(seasons.docs.map(async season => {
          const snapshot = await getDocs(collection(season.ref, "attendance"));
          return snapshot.docs.map(row => ({...row.data(), seasonId:season.id}));
        }));
        const rows = results.flatMap(result => result.status === "fulfilled" ? result.value : []);
        if (active) setFallback({clubId:fallbackClub,rows,error:results.some(result => result.status === "rejected")});
      } catch {
        if (active) setFallback({clubId:fallbackClub,rows:[],error:true});
      }
    }
    load();
    return () => {active = false;};
  }, [fallbackClub]);
  const loaded = fallbackClub && fallback?.clubId === fallbackClub ? fallback : null;
  const summary = useMemo(() => buildPlayerAttendanceSummary({
    days, fallbackRows:loaded?.rows, teams, member, members:report.members,
  }), [days, loaded, teams, member, report.members]);
  return {...summary, loading:report.loading || Boolean(fallbackClub && !loaded),
    error:Boolean(report.error || loaded?.error)};
}
