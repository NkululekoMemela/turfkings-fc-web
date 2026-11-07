import {useEffect, useMemo, useState} from "react";
import {createPortal} from "react-dom";
import {collection, onSnapshot} from "firebase/firestore";
import {db} from "../firebaseConfig.js";
import {getPublicMembersCollection,getPeerRatingBaselinesCollection} from "../core/clubFirestorePaths.js";
import {clubDebutNames,missingBaselinePlayers} from "../../functions/playerDebutPolicy.mjs";

const keyFor = name => String(name || "").trim().toLowerCase().replace(/\s+/g, " ");

export function useClubBaselineDue({clubId, enabled, matchDayHistory, friendlyMatchDayHistory, teams}) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!enabled || !clubId) return undefined;
    const snapshots = {};
    const sources = {
      members: getPublicMembersCollection(db, clubId),
      debuts: collection(db, "clubs", clubId, "playerDebuts"),
      ratings: getPeerRatingBaselinesCollection(db, clubId),
    };
    const stops = Object.entries(sources).map(([key, ref]) => onSnapshot(ref, snapshot => {
      snapshots[key] = snapshot.docs.map(item => item.data());
      if (Object.keys(snapshots).length === 3) setData({clubId, ...snapshots});
    }, () => {
      delete snapshots[key];
      setData(null);
    }));
    return () => { stops.forEach(stop => stop()); setData(null); };
  }, [clubId, enabled]);

  return useMemo(() => {
    if (!enabled || data?.clubId !== clubId) return 0;
    const members = new Map(), aliases = new Map();
    for (const member of data.members) {
      const name = member.fullName || member.name;
      if (!keyFor(name)) continue;
      members.set(keyFor(name), {name});
      for (const alias of [member.shortName, member.displayName, ...(member.aliases || []), keyFor(name).split(" ")[0]]) {
        const key = keyFor(alias);
        if (key) {
          const matches = aliases.get(key) || new Set();
          matches.add(name);
          aliases.set(key, matches);
        }
      }
    }
    const resolveName = value => {
      const key = keyFor(value);
      const matches = aliases.get(key);
      return members.get(key)?.name || (matches?.size === 1 ? [...matches][0] : value);
    };
    const players = new Map(members);
    if (clubId === "turf-kings") for (const team of teams || []) for (const player of team.players || []) {
      const name = resolveName(typeof player === "string" ? player : player?.name || player?.displayName);
      if (keyFor(name)) players.set(keyFor(name), {name});
    }
    const baselines = Object.fromEntries(data.ratings.map(rating => [keyFor(resolveName(rating.targetName)), rating]));
    return missingBaselinePlayers({
      players: [...players.values()],
      debutNames: [...data.debuts.map(item => item.name),
        ...clubDebutNames({history: [matchDayHistory, friendlyMatchDayHistory]})],
      baselines, resolveName,
    }).length;
  }, [clubId, enabled, data, matchDayHistory, friendlyMatchDayHistory, teams]);
}

export default function ClubBaselinePeek({buttonRef, count, enabled}) {
  const [position, setPosition] = useState(null);
  useEffect(() => {
    const button = buttonRef.current;
    const scroller = button?.closest(".tk-bottom-nav-scroll");
    if (!enabled || !count || !button || !scroller) { setPosition(null); return undefined; }
    let shown = false, timer;
    const measure = () => {
      const b = button.getBoundingClientRect(), s = scroller.getBoundingClientRect();
      if (document.hidden || b.width === 0 || b.left < s.left - 1 || b.right > s.right + 1 || b.bottom > innerHeight + 1) {
        shown = false;
        clearTimeout(timer);
        setPosition(null);
        return;
      }
      if (shown) return;
      shown = true;
      setPosition({left: Math.max(65, Math.min(innerWidth - 65, b.left + b.width / 2)), top: b.top - 4});
      timer = setTimeout(() => setPosition(null), 3800);
    };
    measure();
    scroller.addEventListener("scroll", measure, {passive: true});
    window.addEventListener("resize", measure);
    document.addEventListener("visibilitychange", measure);
    return () => {
      clearTimeout(timer);
      scroller.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      document.removeEventListener("visibilitychange", measure);
    };
  }, [buttonRef, count, enabled]);

  return enabled && count > 0 && position ? createPortal(
    <span role="status" className="club-baseline-peek" style={position}>
      Rate {count} {count === 1 ? "player" : "players"}
    </span>, document.body
  ) : null;
}
