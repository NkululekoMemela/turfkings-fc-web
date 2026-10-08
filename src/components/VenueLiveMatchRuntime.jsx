import {normalizeVenueLeagueScope} from "../core/venueLeaguePaths.js";
import FieldMatchHalfClock from "./FieldMatchHalfClock.jsx";
import { tickFieldMatchClock, startFieldSecondHalf } from "../core/fieldMatchClock.js";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { auth } from "../firebaseConfig.js";
import {
  getVenueRefereeDeviceId,
  buildVenueRefereeController,
} from "../core/venueRefereeController.js";
import VenueLeagueLiveMatchPage from "../pages/VenueLeagueLiveMatchPage.jsx";
import LiveMatchPage from "../pages/LiveMatchPage.jsx";
import VenueLeagueSpectatorPage from "../pages/VenueLeagueSpectatorPage.jsx";
import VenueCameraApprovalPanel from "./VenueCameraApprovalPanel.jsx";
import {
  cancelVenueFixtureStart,
  completeVenueFixture,
} from "../storage/leagueSeasonRepository.js";
import {
  markVenueLiveMatchCompleted,
  saveVenueLiveMatchState,
  subscribeVenueLiveMatch,
} from "../storage/venueLiveMatchRepository.js";

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export default function VenueLiveMatchRuntime({
  dataScope = null,
  venue,
  season,
  teams = [],
  identity = null,
  activeRole = "spectator",
  isAdmin = false,
  canOperateMatch = false,
  viewerOnly = false,
  onBack,
  onGoToStats,
}) {
  const scope = useMemo(() => {
    const value = dataScope || {
      kind: "venueLeague", environment: "official",
      venueId: String(venue?.id || "").trim(),
      seasonId: String(season?.id || "").trim(),
    };
    normalizeVenueLeagueScope(value, {requireSeason: true});
    if (value.venueId !== venue?.id || value.seasonId !== season?.id) {
      throw new Error("Live match session scope mismatch.");
    }
    return value;
  }, [
    venue?.id, season?.id, dataScope?.environment,
    dataScope?.practiceSessionId, dataScope?.venueId, dataScope?.seasonId,
  ]);

  const refereeDeviceId = useMemo(
    () => getVenueRefereeDeviceId(),
    []
  );

  const [liveState, setLiveState] =
    useState(null);

  const [loadError, setLoadError] =
    useState("");

  const [currentEvents, setCurrentEvents] =
    useState([]);

  const [
    confirmedLineupSnapshot,
    setConfirmedLineupSnapshot,
  ] = useState(null);

  const [
    confirmedLineupsByMatchNo,
    setConfirmedLineupsByMatchNo,
  ] = useState({});

  const [
    matchTeamColorOverrides,
    setMatchTeamColorOverrides,
  ] = useState({});

  const liveStateRef = useRef(null);
  const currentEventsRef =
    useRef(currentEvents);

  const canUseRefereeControls =
    canOperateMatch && !viewerOnly;

  useEffect(() => {
    currentEventsRef.current =
      currentEvents;
  }, [currentEvents]);

  useEffect(() => {
    liveStateRef.current = liveState;
  }, [liveState]);

  useEffect(() => {
    if (
      !scope.venueId ||
      !scope.seasonId
    ) {
      setLoadError(
        "The Field season reference is missing."
      );
      return undefined;
    }

    return subscribeVenueLiveMatch({
      scope,
      onData: (nextState) => {
        setLiveState(nextState);
        setLoadError("");

        if (!nextState) return;

        setCurrentEvents(
          safeArray(nextState.currentEvents)
        );

        setConfirmedLineupSnapshot(
          nextState.confirmedLineupSnapshot ||
          null
        );

        setConfirmedLineupsByMatchNo(
          nextState.confirmedLineupsByMatchNo &&
          typeof nextState
            .confirmedLineupsByMatchNo ===
            "object"
            ? nextState
                .confirmedLineupsByMatchNo
            : {}
        );

        setMatchTeamColorOverrides(
          nextState.matchTeamColorOverrides &&
          typeof nextState
            .matchTeamColorOverrides ===
            "object"
            ? nextState
                .matchTeamColorOverrides
            : {}
        );
      },
      onError: (error) => {
        setLoadError(
          error?.message ||
          "The live Field match could not be loaded."
        );
      },
    });
  }, [
    scope.venueId,
    scope.seasonId,
  ]);

  const liveController =
    liveState?.liveMatchController ||
    null;

  const controllerDeviceId =
    String(
      liveController?.deviceId || ""
    ).trim();

  const canControlCurrentLiveMatch =
    canUseRefereeControls &&
    (
      !controllerDeviceId ||
      controllerDeviceId ===
        refereeDeviceId
    );

  useEffect(() => {
    if (
      !canUseRefereeControls ||
      !liveState ||
      liveState.status !== "live" ||
      controllerDeviceId
    ) {
      return;
    }

    saveVenueLiveMatchState({
      scope,
      patch: {
        liveMatchController: buildVenueRefereeController({
          deviceId: refereeDeviceId,
          identity,
          user: auth.currentUser,
          role: activeRole,
        }),
      },
    }).catch((error) => {
      console.error(
        "[VenueLiveMatch] Controller claim failed:",
        error
      );
    });
  }, [
    activeRole,
    canUseRefereeControls,
    controllerDeviceId,
    identity,
    liveState,
    refereeDeviceId,
    scope,
  ]);

  useEffect(() => {
    if (
      !canControlCurrentLiveMatch ||
      !liveState?.running ||
      liveState?.timeUp ||
      liveState?.status !== "live"
    ) {
      return undefined;
    }

    const timerId = window.setInterval(
      () => {
        setLiveState((previous) => {
          if (
            !previous ||
            !previous.running ||
            previous.timeUp
          ) {
            return previous;
          }

          return tickFieldMatchClock(previous);

        });
      },
      1000
    );

    return () =>
      window.clearInterval(timerId);
  }, [
    canControlCurrentLiveMatch,
    liveState?.running,
    liveState?.status,
    liveState?.timeUp,
  ]);

  useEffect(() => {
    if (
      !canControlCurrentLiveMatch ||
      !liveState ||
      liveState.status !== "live"
    ) {
      return undefined;
    }

    const persistenceId =
      window.setInterval(() => {
        const snapshot =
          liveStateRef.current;

        if (!snapshot) return;

        saveVenueLiveMatchState({
          scope,
          patch: {
            clockVersion: snapshot.clockVersion || 0,
            clockPhase: snapshot.clockPhase || "legacy",
            halftimeSeconds: snapshot.halftimeSeconds || 0,
            halftimeEndsAtMs: snapshot.halftimeEndsAtMs || 0,
            secondsLeft: Math.max(
              0,
              Number(
                snapshot.secondsLeft
              ) || 0
            ),
            running:
              snapshot.running === true,
            timeUp:
              snapshot.timeUp === true,
          },
        }).catch((error) => {
          console.error(
            "[VenueLiveMatch] Timer persistence failed:",
            error
          );
        });
      }, 5000);

    return () =>
      window.clearInterval(
        persistenceId
      );
  }, [
    canControlCurrentLiveMatch,
    liveState?.status,
    scope,
  ]);

  const persistPatch = useCallback(
    async (patch) => {
      await saveVenueLiveMatchState({
        scope,
        patch,
      });
    },
    [scope]
  );

  useEffect(() => {
    if (!canControlCurrentLiveMatch || liveState?.clockVersion !== 1 ||
        !["halftime", "full_time"].includes(liveState?.clockPhase)) return;
    const state = liveStateRef.current;
    persistPatch({
      clockPhase: state.clockPhase,
      halftimeEndsAtMs: state.halftimeEndsAtMs || 0,
      secondsLeft: state.secondsLeft,
      running: false,
      timeUp: state.clockPhase === "full_time",
    }).catch(error => console.error("[Field half clock]", error));
  }, [
    canControlCurrentLiveMatch, liveState?.clockVersion,
    liveState?.clockPhase, liveState?.halftimeEndsAtMs, persistPatch,
  ]);

  const handleStartSecondHalf = useCallback(async () => {
    if (!canControlCurrentLiveMatch) {
      throw new Error("Only the controlling referee can start the second half.");
    }
    const patch = startFieldSecondHalf(liveStateRef.current);
    await persistPatch(patch);
    setLiveState(previous => previous ? {...previous, ...patch} : previous);
  }, [canControlCurrentLiveMatch, persistPatch]);

  const handleAddEvent = useCallback(
    (event) => {
      setCurrentEvents((previous) => {
        const next = [
          ...previous,
          event,
        ];

        currentEventsRef.current = next;

        persistPatch({
          currentEvents: next,
        }).catch((error) => {
          console.error(
            "[VenueLiveMatch] Event save failed:",
            error
          );
        });

        return next;
      });
    },
    [persistPatch]
  );

  const handleDeleteEvent = useCallback(
    (eventIndex) => {
      setCurrentEvents((previous) => {
        const next = previous.filter(
          (_, index) =>
            index !== Number(eventIndex)
        );

        currentEventsRef.current = next;

        persistPatch({
          currentEvents: next,
        }).catch((error) => {
          console.error(
            "[VenueLiveMatch] Event delete failed:",
            error
          );
        });

        return next;
      });
    },
    [persistPatch]
  );

  const handleUndoLastEvent =
    useCallback(() => {
      setCurrentEvents((previous) => {
        const next =
          previous.slice(0, -1);

        currentEventsRef.current = next;

        persistPatch({
          currentEvents: next,
        }).catch((error) => {
          console.error(
            "[VenueLiveMatch] Event undo failed:",
            error
          );
        });

        return next;
      });
    }, [persistPatch]);

  const handleConfirmLineups =
    useCallback(
      (snapshot) => {
        const matchNo =
          Number(
            liveStateRef.current
              ?.currentMatchNo
          ) || 1;

        setConfirmedLineupSnapshot(
          snapshot
        );

        setConfirmedLineupsByMatchNo(
          (previous) => {
            const next = {
              ...previous,
              [matchNo]: snapshot,
            };

            const live = liveStateRef.current;
            const previousTimeline = safeArray(live?.lineupTimeline);
            const elapsedSeconds = previousTimeline.length === 0
              ? 0
              : Math.max(
                  0,
                  Number(live?.matchSeconds || 0) -
                    Number(live?.secondsLeft || 0)
                );
            const lineupTimeline = [
              ...previousTimeline.filter(
                (entry) => Number(entry?.timeSeconds) !== elapsedSeconds
              ),
              { timeSeconds: elapsedSeconds, snapshots: snapshot },
            ].sort((x, y) => x.timeSeconds - y.timeSeconds);

            persistPatch({
              confirmedLineupSnapshot:
                snapshot,
              confirmedLineupsByMatchNo:
                next,
              lineupTimeline,
            }).catch((error) => {
              console.error(
                "[VenueLiveMatch] Lineup save failed:",
                error
              );
            });

            return next;
          }
        );
      },
      [persistPatch]
    );

  const handleCancelLineups =
    useCallback(async () => {
      if (!canControlCurrentLiveMatch) {
        throw new Error("Only the controlling Field official can cancel this match.");
      }

      try {
        await cancelVenueFixtureStart({ scope });
        onBack?.();
      } catch (error) {
        console.error("[VenueLiveMatch] Cancel failed:", error);
        throw error;
      }
    }, [canControlCurrentLiveMatch, onBack, scope]);

  const handleUpdateMatchSeconds =
    useCallback(
      (nextMatchSeconds) => {
        if (liveStateRef.current?.clockVersion === 1) {
          return;
        }
        const safeSeconds = Math.max(
          60,
          Number(nextMatchSeconds) ||
            3600
        );

        setLiveState((previous) =>
          previous
            ? {
                ...previous,
                matchSeconds: safeSeconds,
                secondsLeft: safeSeconds,
                running: true,
                timeUp: false,
              }
            : previous
        );

        persistPatch({
          matchSeconds: safeSeconds,
          secondsLeft: safeSeconds,
          running: true,
          timeUp: false,
        }).catch((error) => {
          console.error(
            "[VenueLiveMatch] Match duration update failed:",
            error
          );
        });
      },
      [persistPatch]
    );

  const handleUpdateTeamColor =
    useCallback(
      (teamId, color) => {
        setMatchTeamColorOverrides(
          (previous) => {
            const next = {
              ...previous,
              [teamId]: color,
            };

            persistPatch({
              matchTeamColorOverrides:
                next,
            }).catch((error) => {
              console.error(
                "[VenueLiveMatch] Team colour save failed:",
                error
              );
            });

            return next;
          }
        );
      },
      [persistPatch]
    );

  const handleResetTeamColors =
    useCallback(() => {
      setMatchTeamColorOverrides({});

      persistPatch({
        matchTeamColorOverrides: {},
      }).catch((error) => {
        console.error(
          "[VenueLiveMatch] Team colour reset failed:",
          error
        );
      });
    }, [persistPatch]);

  const currentController = useCallback(
    () => buildVenueRefereeController({
      deviceId: refereeDeviceId,
      identity,
      user: auth.currentUser,
      role: activeRole,
    }),
    [activeRole, identity, refereeDeviceId]
  );

  const handleTakeOver = useCallback(async () => {
    const request = liveStateRef.current?.liveMatchTakeoverRequest;
    if (!canUseRefereeControls ||
        request?.status !== "pending" ||
        request?.requester?.deviceId !== refereeDeviceId ||
        Date.now() < new Date(request.expiresAtISO || "").getTime()) {
      return;
    }

    const nextController = currentController();
    await persistPatch({
      liveMatchController: nextController,
      liveMatchTakeoverRequest: null,
      takeoverAtISO: new Date().toISOString(),
      takeoverBy: nextController,
    });
  }, [
    canUseRefereeControls,
    currentController,
    persistPatch,
    refereeDeviceId,
  ]);

  const handleRequestTakeOver = useCallback(async () => {
    if (!canUseRefereeControls || canControlCurrentLiveMatch) return;

    const requestedAt = Date.now();
    await persistPatch({
      liveMatchTakeoverRequest: {
        id: `takeover-${requestedAt}-${Math.random().toString(36).slice(2, 8)}`,
        status: "pending",
        requestedAtISO: new Date(requestedAt).toISOString(),
        expiresAtISO: new Date(requestedAt + 15000).toISOString(),
        requester: currentController(),
        currentController: liveStateRef.current?.liveMatchController || null,
      },
    });
  }, [
    canUseRefereeControls,
    canControlCurrentLiveMatch,
    currentController,
    persistPatch,
  ]);

  const handleRejectTakeOver = useCallback(async () => {
    if (!canControlCurrentLiveMatch) return;
    const request = liveStateRef.current?.liveMatchTakeoverRequest;
    if (request?.status !== "pending") return;

    await persistPatch({
      liveMatchTakeoverRequest: {
        ...request,
        status: "rejected",
        rejectedAtISO: new Date().toISOString(),
        rejectedBy: currentController(),
      },
    });
  }, [canControlCurrentLiveMatch, currentController, persistPatch]);

  const handleAcceptTakeOver = useCallback(async () => {
    if (!canControlCurrentLiveMatch) return;
    const request = liveStateRef.current?.liveMatchTakeoverRequest;
    const nextController = request?.requester;
    if (request?.status !== "pending" || !nextController?.deviceId) return;

    await persistPatch({
      liveMatchController: {
        ...nextController,
        acquiredAtISO: new Date().toISOString(),
      },
      liveMatchTakeoverRequest: null,
      takeoverAtISO: new Date().toISOString(),
      takeoverBy: nextController,
    });
  }, [canControlCurrentLiveMatch, persistPatch]);

  useEffect(() => {
    const request = liveState?.liveMatchTakeoverRequest;
    if (request?.status !== "pending" ||
        canControlCurrentLiveMatch ||
        request?.requester?.deviceId !== refereeDeviceId) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      if (Date.now() >= new Date(request.expiresAtISO || "").getTime()) {
        window.clearInterval(interval);
        handleTakeOver().catch((error) => {
          console.error("[VenueLiveMatch] Takeover failed:", error);
        });
      }
    }, 500);

    return () => window.clearInterval(interval);
  }, [
    liveState?.liveMatchTakeoverRequest,
    canControlCurrentLiveMatch,
    refereeDeviceId,
    handleTakeOver,
  ]);

  const handleConfirmEndMatch =
    useCallback(
      async (summary) => {
        if (
          !canControlCurrentLiveMatch
        ) {
          window.alert(
            "Only the controlling Field official can end this match."
          );
          return;
        }

        const snapshot =
          liveStateRef.current;

        const fixtureId =
          String(
            snapshot?.fixtureId ||
            snapshot?.currentMatch
              ?.fixtureId ||
            ""
          ).trim();

        if (!fixtureId) {
          window.alert(
            "The Field fixture reference is missing."
          );
          return;
        }

        try {
          await completeVenueFixture({
            scope,
            venueId: scope.venueId,
            fixtureId,
            summary,
            currentEvents:
              currentEventsRef.current,
            confirmedLineupSnapshot,
            lineupTimeline: safeArray(snapshot?.lineupTimeline),
          });

          await markVenueLiveMatchCompleted({
            scope,
            summary,
            currentEvents:
              currentEventsRef.current,
          });

          onBack?.();
        } catch (error) {
          console.error(
            "[VenueLiveMatch] Completion failed:",
            error
          );

          window.alert(
            error?.message ||
            "The Field match could not be completed."
          );
        }
      },
      [
        canControlCurrentLiveMatch,
        confirmedLineupSnapshot,
        onBack,
        scope,
      ]
    );

  if (loadError) {
    return (
      <main
        className="venue-live-match-error"
        role="alert"
      >
        <p>{loadError}</p>

        <button
          type="button"
          onClick={onBack}
        >
          Back to Field
        </button>
      </main>
    );
  }

  if (!liveState) {
    return (
      <main
        className="venue-live-match-loading"
        role="status"
      >
        Loading live Field match...
      </main>
    );
  }

  const sharedProps = {
    isPracticeMode: scope.environment === "practice",
    practiceSessionId: scope.practiceSessionId || null,
    fieldClockVersion: liveState.clockVersion || 0,
    fieldClockPhase: liveState.clockPhase || "legacy",
    matchSeconds:
      Number(liveState.matchSeconds) ||
      Number(season?.matchSeconds) ||
      3600,
    secondsLeft:
      Number.isFinite(
        Number(liveState.secondsLeft)
      )
        ? Number(liveState.secondsLeft)
        : (
            Number(
              liveState.matchSeconds
            ) ||
            Number(
              season?.matchSeconds
            ) ||
            3600
          ),
    timeUp:
      liveState.timeUp === true,
    running:
      liveState.running === true,
    teams:
      safeArray(liveState.teams)
        .length
        ? liveState.teams
        : teams,
    currentMatchNo:
      Number(
        liveState.currentMatchNo
      ) ||
      Number(
        season?.currentMatchNo
      ) ||
      1,
    currentMatch:
      liveState.currentMatch || null,
    currentEvents,
    results:
      safeArray(season?.results),
    identity,
    activeRole,
    isAdmin,
    isCaptain: false,
    activeClubId: venue?.id || "",
    activeClub: venue,
    dataScope: scope,
    onBackToLanding: onBack,
    onBack,
    onGoToStats,
  };

  const halfClock = (
    <FieldMatchHalfClock state={liveState}
      canControl={canControlCurrentLiveMatch}
      onStartSecondHalf={handleStartSecondHalf} />
  );

  if (
    viewerOnly ||
    !canOperateMatch
  ) {
    return (
      <>
        {halfClock}
        <VenueLeagueSpectatorPage {...sharedProps} />
      </>
    );
  }

  return (
    <>
    {halfClock}
    <LiveMatchPage
      {...sharedProps}
      leagueMatchComponent={VenueLeagueLiveMatchPage}
      videoHighlightsClubId={venue?.id || ""}
      canControlMatch={
        canControlCurrentLiveMatch
      }
      refereeDeviceId={
        refereeDeviceId
      }
      liveMatchController={
        liveState.liveMatchController ||
        null
      }
      liveMatchTakeoverRequest={
        liveState
          .liveMatchTakeoverRequest ||
        null
      }
      canControlCurrentLiveMatch={
        canControlCurrentLiveMatch
      }
      onTakeOverLiveMatch={
        handleTakeOver
      }
      onRequestTakeOverLiveMatch={
        handleRequestTakeOver
      }
      onAcceptTakeoverRequest={
        handleAcceptTakeOver
      }
      onRejectTakeoverRequest={
        handleRejectTakeOver
      }
      pendingMatchStartContext={{
        currentMatch:
          liveState.currentMatch,
        matchType: "LEAGUE",
        matchMode: "fixtured",
        gameFormat:
          liveState.currentMatch
            ?.gameFormat ||
          season?.gameFormat ||
          "5_V_5",
      }}
      matchType="LEAGUE"
      matchMode="fixtured"
      gameFormat={
        season?.gameFormat ||
        "5_V_5"
      }
      confirmedLineupSnapshot={
        confirmedLineupSnapshot
      }
      confirmedLineupsByMatchNo={
        confirmedLineupsByMatchNo
      }
      onConfirmPreMatchLineups={
        handleConfirmLineups
      }
      onCancelPreMatchLineups={
        handleCancelLineups
      }
      onAddEvent={handleAddEvent}
      onDeleteEvent={
        handleDeleteEvent
      }
      onUndoLastEvent={
        handleUndoLastEvent
      }
      onConfirmEndMatch={
        handleConfirmEndMatch
      }
      onUpdateMatchSeconds={
        liveState.clockVersion === 1 ? undefined : handleUpdateMatchSeconds
      }
      matchTeamColorOverrides={
        matchTeamColorOverrides
      }
      onUpdateMatchTeamColorOverride={
        handleUpdateTeamColor
      }
      onResetMatchTeamColorOverrides={
        handleResetTeamColors
      }
    />
    {scope.environment !== "practice" && canControlCurrentLiveMatch &&
      liveState.status === "live" &&
      liveController?.uid === auth.currentUser?.uid && (
        <VenueCameraApprovalPanel
          venueId={scope.venueId}
          seasonId={scope.seasonId}
          fixtureId={liveState.fixtureId}
        />
      )}
    </>
  );
}
