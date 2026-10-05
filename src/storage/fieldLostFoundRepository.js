import {useEffect, useState} from "react";
import {onAuthStateChanged} from "firebase/auth";
import {auth, getActiveFirebaseFunctionsBaseUrl} from "../firebaseConfig.js";

const summaries = new Map();
const active = new Map();

export async function lostFoundRequest(venueId, action, details = {}, signal) {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in to use Lost & Found.");
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, {once: true});
  const timeout = window.setTimeout(abort, 15000);
  try {
    const token = await user.getIdToken();
    const base = getActiveFirebaseFunctionsBaseUrl().replace(/\/$/, "");
    const response = await fetch(`${base}/fieldLostFound`, {
      method: "POST", signal: controller.signal,
      headers: {
        "Content-Type": "application/json", Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({venueId, action, ...details}),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Please try again.");
    if (!["view", "summary", "photo"].includes(action)) {
      summaries.clear();
      window.dispatchEvent(new Event("field-lost-found-updated"));
    }
    return result;
  } catch (error) {
    if (error.name === "AbortError" && !signal?.aborted) {
      throw new Error("The Field service is taking longer than usual. Please retry.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

export function useLostFoundSummary(venueId, adminView) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    let currentKey = "";
    async function refresh() {
      const user = auth.currentUser;
      if (!alive || !user || !venueId || document.hidden) return;
      const key = `${user.uid}:${venueId}:${Boolean(adminView)}`;
      currentKey = key;
      const cached = summaries.get(key);
      if (cached && Date.now() - cached.at < 20000) {
        setCount(cached.count);
        return;
      }
      if (!active.has(key)) {
        active.set(key, lostFoundRequest(venueId, "summary", {
          asPlayer: !adminView,
        }).then(result => {
          const value = Number(result.openCount) || 0;
          summaries.set(key, {at: Date.now(), count: value});
          return value;
        }).finally(() => active.delete(key)));
      }
      try {
        const value = await active.get(key);
        if (alive && currentKey === key) setCount(value);
      } catch {
        // Keep the last known count; do not block the landing page.
      }
    }
    const unsubscribe = onAuthStateChanged(auth, () => {
      currentKey = "";
      if (alive) setCount(0);
      refresh();
    });
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener("field-lost-found-updated", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      alive = false;
      unsubscribe();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("field-lost-found-updated", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [venueId, adminView]);
  return count;
}
