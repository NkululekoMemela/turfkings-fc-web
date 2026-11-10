import {useCallback, useEffect, useState} from "react";
import {clubChallengeRequest} from "./clubChallengeGateway.js";

export function useExhibitionMatchday(clubId, fixtureId) {
  const scope = fixtureId ? `${clubId}:${fixtureId}` : "";
  const [loaded, setLoaded] = useState(null);
  const [failure, setFailure] = useState(null);
  const refresh = useCallback(async (signal) => {
    if (!scope) return;
    try {
      const match = await clubChallengeRequest("matchday", {clubId, fixtureId}, signal);
      if (!signal?.aborted) {
        setLoaded({scope, match});
        setFailure(null);
        return match;
      }
    } catch (error) {
      if (!signal?.aborted) setFailure({scope, error: error.message});
    }
  }, [clubId, fixtureId, scope]);
  useEffect(() => {
    if (!scope) return;
    const controller = new AbortController();
    const poll = () => refresh(controller.signal);
    void poll();
    const timer = window.setInterval(poll, 15000);
    return () => {controller.abort(); window.clearInterval(timer);};
  }, [refresh, scope]);
  return {match: loaded?.scope === scope ? loaded.match : null, error: failure?.scope === scope ? failure.error : "", refresh};
}
