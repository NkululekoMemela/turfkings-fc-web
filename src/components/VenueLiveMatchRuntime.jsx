import {resolveGameFormat} from "../core/matchConfig.js";
import {boothRequest, readBooth, rememberBoothContext, rememberBoothState, finishBooth, queueBoothPatch, flushBooth, watchBooth, markBoothCancelled} from "../storage/fieldBoothJournal.js";
import {recoverFieldClock} from "../core/fieldBoothRecovery.mjs";
import {fieldConfirm,fieldAlert,fieldPrompt} from './FieldDialog.jsx';
import {normalizeVenueLeagueScope} from "../core/venueLeaguePaths.js";
import FieldMatchHalfClock from "./FieldMatchHalfClock.jsx";
import { tickPracticeFieldMatchClock, practiceClockCanResume, mergePracticeFieldClock, startFieldSecondHalf } from "../core/fieldMatchClock.js";
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
  onControlState,
  temporaryReferee = false,
  onPracticeProgress,
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
    dataScope?.fixtureId, dataScope?.liveDocumentId,
  ]);

  useEffect(()=>{
    if(scope.environment==="practice" || !canOperateMatch)return;
    window.dispatchEvent(new CustomEvent("fanm:booth-visibility",{detail:true}));
    return()=>window.dispatchEvent(new CustomEvent("fanm:booth-visibility",{detail:false}));
  },[scope,canOperateMatch]);

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

  const practiceVerified = Boolean(liveState?.confirmedLineupSnapshot &&
    !liveState.awaitingKitVerification);
  const practiceHasGoal = currentEvents.some(event => event.type === "goal");
  const timeline = Array.isArray(liveState?.lineupTimeline) ? liveState.lineupTimeline : [];
  const practiceHasSubstitution = scope.environment === "practice" && timeline.some((item,index) => {
    if (!index) return false;
    return Object.entries(item.snapshots || {}).some(([teamId, lineup]) => {
      const before = new Set(Object.values(timeline[index - 1].snapshots?.[teamId]?.positions || {}).filter(Boolean));
      return before.size > 0 && Object.values(lineup?.positions || {}).some(name => name && !before.has(name));
    });
  });
  const practiceHasCard = currentEvents.some(event => ["yellow_card","red_card"].includes(event.type));
  const practiceHasInjury = currentEvents.some(event => ["injury_knock","injury_sitting_out"].includes(event.type));
  const practiceSecondHalf = ["second_half","full_time"].includes(liveState?.clockPhase);
  useEffect(() => {
    if (scope.environment !== "practice" || !onPracticeProgress) return undefined;
    onPracticeProgress({verified: practiceVerified, hasGoal: practiceHasGoal, hasSubstitution:practiceHasSubstitution, hasCard:practiceHasCard, hasInjury:practiceHasInjury, secondHalf:practiceSecondHalf});
    return () => onPracticeProgress(null);
  }, [scope.environment, onPracticeProgress, practiceVerified, practiceHasGoal, practiceHasSubstitution, practiceHasCard, practiceHasInjury, practiceSecondHalf]);

  const [loadAttempt,setLoadAttempt]=useState(0);
  const [finishPending,setFinishPending]=useState(()=>scope.environment!=="practice" && Boolean(readBooth(scope)?.finishSummary));
  const [boothBlocked,setBoothBlocked]=useState(()=>scope.environment!=="practice" && Boolean(readBooth(scope)?.conflict));
  useEffect(()=>scope.environment==="practice"?undefined:watchBooth(scope,saved=>{
    setBoothBlocked(Boolean(saved?.conflict));
    setFinishPending(Boolean(saved?.finishSummary));
  }),[scope]);

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

    setLoadError("");
    const timeout=window.setTimeout(()=>setLoadError("The match is taking too long to load. Retry or return to the Field."),15000);
    const unsubscribe=subscribeVenueLiveMatch({
      scope,
      onData: (nextState, metadata) => {
        if(nextState || !metadata?.fromCache)window.clearTimeout(timeout);
        setLiveState(previous => scope.environment === "practice" ? mergePracticeFieldClock(previous,nextState) : nextState);
        setLoadError("");

        if (!nextState) {
          if(!metadata?.fromCache)setLoadError("No live match was found. Return to the Field and start the fixture again.");
          return;
        }

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
        window.clearTimeout(timeout);
        setLoadError(
          error?.message ||
          "The live Field match could not be loaded."
        );
      },
    });
    return ()=>{window.clearTimeout(timeout);unsubscribe();};
  }, [
    loadAttempt,
    scope.venueId,
    scope.seasonId,
    scope.fixtureId, scope.liveDocumentId,
  ]);

  const liveController =
    liveState?.liveMatchController ||
    null;

  const controllerDeviceId =
    String(
      liveController?.deviceId || ""
    ).trim();

  const canControlCurrentLiveMatch =
    canUseRefereeControls && liveState?.status === "live" && !finishPending && !boothBlocked &&
    (!temporaryReferee || liveState?.boothGuest?.expiresAtMs > Date.now()) &&
    (scope.environment === "practice" || liveState?.boothVersion === 1) &&
    (scope.environment === "practice" || liveController?.uid === auth.currentUser?.uid) &&
    (
      !controllerDeviceId ||
      controllerDeviceId ===
        refereeDeviceId
    );

  useEffect(() => {
    onControlState?.(Boolean(canControlCurrentLiveMatch && liveState?.status === "live"));
  }, [canControlCurrentLiveMatch,liveState?.status,onControlState]);

  useEffect(() => {
    if (scope.environment === "practice" || !canUseRefereeControls) return;
    let active=true;
    const bootstrap=async()=>{
      try {
        const context=await boothRequest(scope,"context");
        if(!active)return;
        const state=rememberBoothContext(scope,context);
        setLiveState(recoverFieldClock(state));
        setCurrentEvents(safeArray(state.currentEvents));
        setConfirmedLineupSnapshot(state.confirmedLineupSnapshot||null);
        setConfirmedLineupsByMatchNo(state.confirmedLineupsByMatchNo||{});
        setMatchTeamColorOverrides(state.matchTeamColorOverrides||{});
      } catch(error) {
        if(active && !readBooth(scope)?.state)setLoadError(error.message);
      }
    };
    bootstrap(); window.addEventListener("online",bootstrap);
    return()=>{active=false;window.removeEventListener("online",bootstrap);};
  },[scope,canUseRefereeControls,loadAttempt]);

  useEffect(()=>{
    if(scope.environment!=="practice" && canControlCurrentLiveMatch && liveState) {
      try { rememberBoothState(scope,liveState); }
      catch { setLoadError("This phone cannot save the match. Free storage or hand over to another official before continuing."); }
    }
  },[scope,canControlCurrentLiveMatch,liveState]);

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

          return scope.environment === "practice" ? tickPracticeFieldMatchClock(previous) : recoverFieldClock(previous);

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
    scope.environment,
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
            clockObservedAtMs: snapshot.clockObservedAtMs || Date.now(),
            clockVersion: snapshot.clockVersion || 0,
            ...(scope.environment === "practice" ? {practiceHalfTicks:snapshot.practiceHalfTicks || 0} : {}),
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
    const patch = {...startFieldSecondHalf(liveStateRef.current),clockObservedAtMs:Date.now(),
      ...(scope.environment === "practice" ? {practiceHalfTicks:0} : {})};
    await persistPatch(patch);
    setLiveState(previous => previous ? {...previous, ...patch} : previous);
  }, [canControlCurrentLiveMatch, persistPatch]);

  async function resumePracticeClock() {
    const live = liveStateRef.current;
    if (!canControlCurrentLiveMatch || !practiceClockCanResume(live)) return;
    const patch = {running:true, clockObservedAtMs:Date.now()};
    await persistPatch(patch);
    setLiveState(previous=>previous ? {...previous,...patch} : previous);
  }

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

  const handleConfirmLineups = useCallback(async snapshot=>{
    if(!canControlCurrentLiveMatch || !auth.currentUser?.emailVerified)throw new Error("Sign in as the controlling referee.");
    if(!snapshot || Object.values(snapshot).some(team=>!team.kitVerification))throw new Error("Verify both teams' kit before confirming lineups.");
    const live=liveStateRef.current,matchNo=Number(live?.currentMatchNo) || 1;
    const next={...(live?.confirmedLineupsByMatchNo || {}),[matchNo]:snapshot};
    const previous=safeArray(live?.lineupTimeline);
    const elapsed=previous.length===0?0:Math.max(0,Number(live?.matchSeconds || 0)-Number(live?.secondsLeft || 0));
    const lineupTimeline=[...previous.filter(item=>Number(item?.timeSeconds)!==elapsed),{timeSeconds:elapsed,snapshots:snapshot}].sort((a,b)=>a.timeSeconds-b.timeSeconds);
    const kickoff=(live?.awaitingKitVerification || (scope.environment === "practice" && live?.clockPhase === "first_half" && !live.running && live.secondsLeft === live.matchSeconds))?{clockObservedAtMs:Date.now(),awaitingKitVerification:false,running:true,startedAtMs:Date.now(),startedAtISO:new Date().toISOString()}:{};
    const patch={confirmedLineupSnapshot:snapshot,confirmedLineupsByMatchNo:next,lineupTimeline,...kickoff};
    await persistPatch(patch);
    setLiveState(previous=>({...previous,...patch}));
    setConfirmedLineupSnapshot(snapshot);setConfirmedLineupsByMatchNo(next);
  },[persistPatch,canControlCurrentLiveMatch,scope.environment]);

  const handleCancelLineups =
    useCallback(async () => {
      if (!canControlCurrentLiveMatch) {
        throw new Error("Only the controlling Field official can cancel this match.");
      }

      try {
        if(temporaryReferee)throw Error("A registered Field official must cancel the fixture. You can continue refereeing this match.");
        if(scope.environment!=="practice"){
          await flushBooth(scope);
          await boothRequest(scope,"cancel");
          markBoothCancelled(scope);
          onControlState?.(false);
        }else await cancelVenueFixtureStart({ scope });
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
                clockObservedAtMs: Date.now(),
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
    [activeRole, identity, refereeDeviceId, scope]
  );

  const handleTakeOver = useCallback(async () => {
    if(scope.environment !== "practice") {
      const result=await boothRequest(scope,"takeover",{fixtureId:liveStateRef.current?.fixtureId});
      if(result.live){rememberBoothContext(scope,result);setLiveState(recoverFieldClock(result.live));}
      return;
    }
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
    scope,
    currentController,
    persistPatch,
    refereeDeviceId,
  ]);

  const [takeoverRecoveryError, setTakeoverRecoveryError] = useState("");
  const handleRequestTakeOver = useCallback(async () => {
    setTakeoverRecoveryError("");
    if(scope.environment !== "practice") {
      const result=await boothRequest(scope,"requestTakeover",{fixtureId:liveStateRef.current?.fixtureId});
      if(result.live){rememberBoothContext(scope,result);setLiveState(recoverFieldClock(result.live));}
      if (result.takeoverRequest) setLiveState(current => {
        if (!current || current.liveMatchController?.deviceId === refereeDeviceId) return current;
        const request = current.liveMatchTakeoverRequest;
        if (Date.parse(request?.requestedAtISO) >= Date.parse(result.takeoverRequest.requestedAtISO)) return current;
        return {...current, liveMatchTakeoverRequest: result.takeoverRequest};
      });
      return;
    }
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
    persistPatch, refereeDeviceId, scope,
  ]);

  const handleRejectTakeOver = useCallback(async () => {
    if(scope.environment !== "practice") {
      const result=await boothRequest(scope,"rejectTakeover",{fixtureId:liveStateRef.current?.fixtureId});
      if(result.live){rememberBoothContext(scope,result);setLiveState(recoverFieldClock(result.live));}
      return;
    }
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
  }, [canControlCurrentLiveMatch, currentController, persistPatch, scope]);

  const handleAcceptTakeOver = useCallback(async () => {
    if(scope.environment !== "practice") {
      if(readBooth(scope)?.pending?.length)await flushBooth(scope);
      const result=await boothRequest(scope,"acceptTakeover",{fixtureId:liveStateRef.current?.fixtureId});
      if(result.live){rememberBoothContext(scope,result);setLiveState(recoverFieldClock(result.live));}
      return;
    }
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
          setTakeoverRecoveryError(error.message || "Could not take over. Try again.");
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
          (await fieldAlert("Only the controlling Field official can end this match."
          ));
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
          (await fieldAlert("The Field fixture reference is missing."
          ));
          return;
        }

        try {
          if(scope.environment !== "practice") {
            await queueBoothPatch(scope,{currentEvents:currentEventsRef.current,
              secondsLeft:snapshot.secondsLeft,running:false,clockObservedAtMs:Date.now()});
            const result=await finishBooth(scope,summary);
            if(result.pending){setFinishPending(true);await fieldAlert("Match saved on this phone. Keep this phone until the result uploads. Standings will update when the connection returns.");}
            else {onControlState?.(false);onBack?.();}
            return;
          }
          await completeVenueFixture({
            scope,
            venueId: scope.venueId,
            fixtureId,
            summary,
            currentEvents:
              currentEventsRef.current,
            confirmedLineupSnapshot,
            lineupTimeline: safeArray(snapshot?.lineupTimeline),
            playedSeconds: Math.max(0,Number(snapshot?.matchSeconds||0)-Number(snapshot?.secondsLeft||0)),
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

          (await fieldAlert(error?.message ||
            "The Field match could not be completed."
          ));
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
        <button type="button" onClick={()=>setLoadAttempt(value=>value+1)}>Retry</button>

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

  /*
   * The shared Live Match page validates every lineup name
   * against team.players. Field squads are stored on the live
   * match as paidSquads, so join them to their club here.
   *
   * Pipeline:
   * Squads -> Formations -> confirmedLineupSnapshot
   *         -> paidSquads/team.players -> Live Match
   */
  const fieldLiveTeams = safeArray(teams).map((team) => {
    const teamId = String(team?.id || "").trim();
    const squadPlayers = safeArray(
      liveState?.paidSquads?.[teamId]
    );

    return {
      ...team,
      clubId:teamId,
      kitNumbers:Object.fromEntries(squadPlayers.map(player=>[player.sourcePlayerId,player.jerseyNumber??null])),
      players: squadPlayers.map((player) => {
        const fullName = String(
          player?.fullName ||
          player?.displayName ||
          player?.name ||
          player?.playerName ||
          ""
        ).trim();

        return {
          ...player,
          id:
            player?.id ||
            player?.playerId ||
            player?.sourcePlayerId ||
            fullName,
          name: fullName,
          fullName,
          shortName:
            String(
              player?.shortName ||
              fullName.split(/\s+/)[0] ||
              ""
            ).trim(),
        };
      }),
    };
  });

  const sharedProps = {
    isPracticeMode: scope.environment === "practice",
    awaitingKitVerification: liveState.awaitingKitVerification === true,
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
    venue, season, currentLive:liveState,
    teams: fieldLiveTeams,
    fieldPaidSquads: liveState.paidSquads || null,
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
    onFutsalAbandonment: async stopped=>{
      if(!canControlCurrentLiveMatch)return;
      const live=liveStateRef.current;
      const running=!stopped && Number(live?.secondsLeft)>0 && live?.clockPhase!=="halftime" && !live?.timeUp;
      const patch={running,clockObservedAtMs:Date.now()};
      await persistPatch(patch);
      setLiveState(previous=>({...previous,...patch}));
    },
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
    <div className="field-live-runtime">
    {halfClock}
    {canControlCurrentLiveMatch && practiceClockCanResume(liveState) && (
      <button type="button" className="primary-btn" onClick={() => resumePracticeClock().catch(error=>fieldAlert(error.message))}>
        Resume Practice clock
      </button>
    )}
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
      takeoverRecoveryError={takeoverRecoveryError}
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
        venue, season, currentLive:liveState,
    teams: fieldLiveTeams,
        currentMatch:
          liveState.currentMatch,
        matchType: "LEAGUE",
        matchMode: "fixtured",
        gameFormat: resolveGameFormat(
          liveState.gameFormat, season?.gameFormat, liveState.currentMatch?.gameFormat
        ),
      }}
      matchType="LEAGUE"
      matchMode="fixtured"
      gameFormat={resolveGameFormat(
        liveState.gameFormat, season?.gameFormat, liveState.currentMatch?.gameFormat
      )}
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
    {scope.environment !== "practice" && !temporaryReferee && canControlCurrentLiveMatch &&
      liveState.status === "live" &&
      liveController?.uid === auth.currentUser?.uid && (
        <VenueCameraApprovalPanel
          venueId={scope.venueId}
          seasonId={scope.seasonId}
          fixtureId={liveState.fixtureId}
        />
      )}
    </div>
  );
}
