// src/hooks/usePlayerAttendanceBadge.js
import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "../firebaseConfig";

function firstNameOf(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean)[0] || "";
}

function slugFromLooseName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function normKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function uniqueStrings(values = []) {
  return Array.from(
    new Set(values.map((x) => String(x || "").trim()).filter(Boolean))
  );
}

function getIdentityKeys(identity, displayName, shortName) {
  return uniqueStrings([
    identity?.memberId,
    identity?.playerId,
    identity?.shortName,
    identity?.fullName,
    identity?.displayName,
    identity?.name,
    identity?.playerName,
    identity?.email,
    displayName,
    shortName,
    firstNameOf(displayName),
    slugFromLooseName(displayName),
    slugFromLooseName(shortName),
  ]).map(normKey);
}

function extractAllSeasonsMatchDayHistory(mainData) {
  const state = mainData?.state || {};
  const seasons = Array.isArray(state?.seasons) ? state.seasons : [];
  const all = [];

  seasons.forEach((season) => {
    const history = Array.isArray(season?.matchDayHistory)
      ? season.matchDayHistory
      : [];
    history.forEach((day) => {
      all.push({
        ...day,
        seasonId: season?.seasonId || "",
      });
    });
  });

  return all;
}

function buildAttendanceFromMatchDayHistory({
  matchDayHistory = [],
  identity,
  displayName,
  shortName,
}) {
  const identityKeys = getIdentityKeys(identity, displayName, shortName);
  const allMatchDays = new Set();
  const attendedMatchDays = new Set();
  let gamesPlayed = 0;

  (Array.isArray(matchDayHistory) ? matchDayHistory : []).forEach((day) => {
    const seasonId = String(day?.seasonId || "").trim();
    const localDayId = String(day?.id || day?.matchDayId || "").trim();
    if (!localDayId) return;

    const compositeDayId = seasonId ? `${seasonId}__${localDayId}` : localDayId;
    allMatchDays.add(compositeDayId);

    const playerAppearances = Array.isArray(day?.playerAppearances)
      ? day.playerAppearances
      : [];

    const matchingEntry = playerAppearances.find((entry) => {
      const rowKeys = uniqueStrings([
        entry?.playerId,
        entry?.playerName,
        entry?.shortName,
        entry?.displayName,
        firstNameOf(
          entry?.playerName || entry?.shortName || entry?.displayName || ""
        ),
        slugFromLooseName(
          entry?.playerName || entry?.shortName || entry?.displayName || ""
        ),
      ]).map(normKey);

      return rowKeys.some((k) => identityKeys.includes(k));
    });

    if (!matchingEntry) return;

    attendedMatchDays.add(compositeDayId);

    const directMatchesPlayed = Number(
      matchingEntry?.matchesPlayed ?? matchingEntry?.gamesPlayed
    );

    if (Number.isFinite(directMatchesPlayed) && directMatchesPlayed > 0) {
      gamesPlayed += directMatchesPlayed;
    } else {
      const playedFlag = String(
        matchingEntry?.played ??
          matchingEntry?.didPlay ??
          matchingEntry?.wasInGame ??
          ""
      ).toLowerCase();

      if (
        playedFlag === "true" ||
        playedFlag === "1" ||
        playedFlag === "yes"
      ) {
        gamesPlayed += 1;
      }
    }
  });

  const attended = attendedMatchDays.size;
  const total = allMatchDays.size;
  const percent = total > 0 ? Math.round((attended / total) * 100) : null;

  return {
    loading: false,
    percent,
    attended,
    total,
    gamesPlayed,
  };
}

function buildAttendanceFromAttendanceCollection({
  rows = [],
  identity,
  displayName,
  shortName,
}) {
  const identityKeys = getIdentityKeys(identity, displayName, shortName);

  const playerRows = rows.filter((row) => {
    const rowKeys = uniqueStrings([
      row.playerId,
      row.playerName,
      row.shortName,
      row.displayName,
      firstNameOf(row.playerName || row.shortName || row.displayName || ""),
      slugFromLooseName(
        row.playerName || row.shortName || row.displayName || ""
      ),
    ]).map(normKey);

    return rowKeys.some((k) => identityKeys.includes(k));
  });

  const allMatchDays = new Set(
    rows
      .map((row) =>
        `${String(row.seasonId || "").trim()}__${String(
          row.matchDayId || ""
        ).trim()}`
      )
      .filter((x) => x !== "__")
  );

  const attendedMatchDays = new Set(
    playerRows
      .filter((row) => {
        const value = String(
          row.attended ?? row.isPresent ?? row.present ?? "true"
        ).toLowerCase();
        return value !== "false" && value !== "0" && value !== "no";
      })
      .map(
        (row) =>
          `${String(row.seasonId || "").trim()}__${String(
            row.matchDayId || ""
          ).trim()}`
      )
      .filter((x) => x !== "__")
  );

  const attended = attendedMatchDays.size;
  const total = allMatchDays.size;
  const percent = total > 0 ? Math.round((attended / total) * 100) : null;

  const gamesPlayed = playerRows.reduce((sum, row) => {
    const directValue = Number(row.gamesPlayed ?? row.matchesPlayed);
    if (Number.isFinite(directValue) && directValue > 0) return sum + directValue;

    const playedFlag = String(
      row.played ?? row.didPlay ?? row.wasInGame ?? ""
    ).toLowerCase();

    if (
      playedFlag === "true" ||
      playedFlag === "1" ||
      playedFlag === "yes"
    ) {
      return sum + 1;
    }

    return sum;
  }, 0);

  return {
    loading: false,
    percent,
    attended,
    total,
    gamesPlayed,
  };
}

export default function usePlayerAttendanceBadge(beneficiary) {
  const [attendanceBadge, setAttendanceBadge] = useState({
    loading: true,
    percent: null,
    attended: 0,
    total: 0,
    gamesPlayed: 0,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadAttendanceBadge() {
      if (beneficiary?.isGuest) {
        if (!cancelled) {
          setAttendanceBadge({
            loading: false,
            percent: null,
            attended: 0,
            total: 0,
            gamesPlayed: 0,
          });
        }
        return;
      }

      try {
        const mainRef = doc(db, "appState_v2", "main");
        const mainSnap = await getDoc(mainRef);

        if (cancelled) return;

        const targetIdentity = {
          playerId: beneficiary?.playerId,
          shortName: beneficiary?.shortName,
          fullName: beneficiary?.fullName,
          displayName: beneficiary?.fullName,
        };

        const allHistory = mainSnap.exists()
          ? extractAllSeasonsMatchDayHistory(mainSnap.data() || {})
          : [];

        if (Array.isArray(allHistory) && allHistory.length > 0) {
          const badgeFromHistory = buildAttendanceFromMatchDayHistory({
            matchDayHistory: allHistory,
            identity: targetIdentity,
            displayName: beneficiary?.fullName,
            shortName: beneficiary?.shortName,
          });

          if (!cancelled) setAttendanceBadge(badgeFromHistory);
          return;
        }

        const seasonSnaps = await getDocs(collection(db, "seasons"));
        if (cancelled) return;

        const rows = [];
        await Promise.all(
          seasonSnaps.docs.map(async (seasonDoc) => {
            try {
              const attendanceSnap = await getDocs(
                collection(db, "seasons", seasonDoc.id, "attendance")
              );
              attendanceSnap.forEach((docSnap) =>
                rows.push({
                  seasonId: seasonDoc.id,
                  ...(docSnap.data() || {}),
                })
              );
            } catch (error) {
              console.warn(
                "Attendance fallback skipped for season:",
                seasonDoc.id,
                error
              );
            }
          })
        );

        if (cancelled) return;

        const badgeFromAttendance = buildAttendanceFromAttendanceCollection({
          rows,
          identity: targetIdentity,
          displayName: beneficiary?.fullName,
          shortName: beneficiary?.shortName,
        });

        setAttendanceBadge(badgeFromAttendance);
      } catch (err) {
        console.error("Failed to load attendance badge:", err);
        if (!cancelled) {
          setAttendanceBadge({
            loading: false,
            percent: null,
            attended: 0,
            total: 0,
            gamesPlayed: 0,
          });
        }
      }
    }

    loadAttendanceBadge();

    return () => {
      cancelled = true;
    };
  }, [beneficiary]);

  return attendanceBadge;
}