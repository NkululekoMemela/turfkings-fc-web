import {useCallback, useEffect, useState} from "react";
import {clubChallengeRequest} from "./clubChallengeGateway.js";

const empty = {fixtures: [], canManage: false, hasChallenge: false};
export function useClubExhibition({enabled, clubId, userId}) {
  const scope = enabled && clubId && userId ? `${clubId}:${userId}` : "";
  const [loaded, setLoaded] = useState(null);
  const refresh = useCallback(async (signal) => {
    if (!scope) return;
    try {
      const result = await clubChallengeRequest("exhibitionOverview", {clubId}, signal);
      if (!signal?.aborted) setLoaded({scope, result});
    } catch (error) {
      if (!signal?.aborted) setLoaded(current => current?.scope === scope ? current : {scope, result: empty});
      throw error;
    }
  }, [scope, clubId]);
  useEffect(() => {
    if (!scope) return;
    const controller = new AbortController();
    const update = () => refresh(controller.signal).catch(() => {});
    update();
    const timer = window.setInterval(() => {if (!document.hidden) update();}, 15000);
    window.addEventListener("focus", update);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, [scope, refresh]);
  return {...(loaded?.scope === scope ? loaded.result : empty), loading: Boolean(scope && loaded?.scope !== scope), refresh};
}
