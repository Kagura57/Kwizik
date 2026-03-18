import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import { toRomaji } from "wanakana";
import {
  getProjectionCopy,
  getProjectionPlaybackErrorMessage,
  getProjectionSnapshotErrorMessage,
} from "../../../i18n/copy/projection";
import { usePageSeo } from "../../../i18n/seo";
import { useCurrentLocale } from "../../../i18n/useLocale";
import {
  getAccountTitlePreference,
  HttpStatusError,
  type RoundChoice,
  type TitlePreference,
} from "../../../lib/api";
import {
  getEffectiveRoomDeadlineMs,
  getEffectiveRoomPhase,
  getEffectiveRoomStartedAtMs,
  getNextRoomTransitionAtMs,
} from "../../../lib/liveRoundTiming";
import { impactHeroVariants, impactPageVariants } from "../../../lib/impactMotion";
import { logClientEvent } from "../../../lib/logger";
import { notify } from "../../../lib/notify";
import { fetchLiveRoomState } from "../../../lib/realtime";
import { useRoomRealtimeSubscription } from "../../../lib/useRoomRealtimeSubscription";

const ROUND_MS = 20_000;
const COUNTDOWN_MS = 3_000;
const REVEAL_MS = 20_000;
const LEADERBOARD_MS = 0;
const ANIME_MEDIA_PREPARED_BUFFER_SEC = 1.25;
const ANIME_MEDIA_VERIFIED_START_ADVANCE_SEC = 0.2;
const ANIME_MEDIA_WARMUP_VERIFY_TIMEOUT_MS = 4_000;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function phaseProgress(phase: string | undefined, remainingMs: number | null) {
  if (remainingMs === null) return 0;
  if (phase === "countdown") return clamp01((COUNTDOWN_MS - remainingMs) / COUNTDOWN_MS);
  if (phase === "loading") return 0;
  if (phase === "playing") return clamp01((ROUND_MS - remainingMs) / ROUND_MS);
  if (phase === "reveal") return clamp01((REVEAL_MS - remainingMs) / REVEAL_MS);
  if (phase === "leaderboard") {
    if (LEADERBOARD_MS <= 0) return 1;
    return clamp01((LEADERBOARD_MS - remainingMs) / LEADERBOARD_MS);
  }
  return 0;
}

function errorCode(error: unknown) {
  return error instanceof Error ? error.message : null;
}

const WAVE_BARS = Array.from({ length: 64 }, (_, index) => ({
  key: index,
  heightPercent: 16 + ((index * 11) % 78),
  delaySec: (index % 10) * 0.07,
}));

function revealArtworkUrl(reveal: {
  provider: "spotify" | "deezer" | "apple-music" | "tidal" | "youtube" | "animethemes";
  trackId: string;
}) {
  if (reveal.provider === "youtube") {
    return `https://i.ytimg.com/vi/${reveal.trackId}/hqdefault.jpg`;
  }
  return null;
}

function withRomajiLabel(value: string, providedRomaji?: string | null) {
  if (!value) return value;
  const romaji = providedRomaji?.trim().length ? providedRomaji.trim() : toRomaji(value).trim();
  if (!romaji || romaji.toLowerCase() === value.toLowerCase()) return value;
  return romaji;
}

function normalizeChoiceLabel(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’`´]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatProjectionChoiceLabel(choice: RoundChoice, preference: TitlePreference) {
  const romajiTitle = withRomajiLabel(choice.titleRomaji);
  const englishTitle = choice.titleEnglish?.trim() ?? "";
  const hasDistinctEnglish =
    englishTitle.length > 0 &&
    normalizeChoiceLabel(englishTitle) !== normalizeChoiceLabel(choice.titleRomaji);
  const title =
    preference === "english" && hasDistinctEnglish
      ? englishTitle
      : preference === "mixed" && hasDistinctEnglish
        ? `${romajiTitle} (${englishTitle})`
        : romajiTitle;
  return `${title} - ${choice.themeLabel}`;
}

function formatProjectionRevealTitle(
  reveal: { title: string; titleRomaji: string | null; titleEnglish?: string | null },
  preference: TitlePreference,
) {
  const romaji = withRomajiLabel(reveal.title, reveal.titleRomaji);
  const english = (reveal.titleEnglish ?? "").trim();
  const hasDistinctEnglish =
    english.length > 0 && normalizeChoiceLabel(english) !== normalizeChoiceLabel(reveal.title);

  if (preference === "english" && hasDistinctEnglish) return english;
  if (preference === "mixed" && hasDistinctEnglish) return `${romaji} (${english})`;
  return romaji;
}

export function RoomViewPage() {
  const { roomCode } = useParams({ from: "/$locale/room/$roomCode/view" });
  const locale = useCurrentLocale();
  const reduceMotion = useReducedMotion();
  const copy = getProjectionCopy(locale);
  const stageMotion = reduceMotion
    ? {}
    : ({
        initial: "hidden",
        animate: "show",
      } as const);
  usePageSeo({
    title: locale === "en" ? `Projection ${roomCode} | Kwizik` : `Projection ${roomCode} | Kwizik`,
    description:
      locale === "en"
        ? "Projection view for an anime blind test room."
        : "Vue projection pour une room de blind test anime.",
    locale,
    path: `/room/${roomCode}/view`,
    robots: "noindex,nofollow",
  });
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(0);
  const [progress, setProgress] = useState(0);
  const [audioError, setAudioError] = useState(false);
  const [iframeEpoch, setIframeEpoch] = useState(0);
  const [animePlaybackStatus, setAnimePlaybackStatus] = useState<
    "idle" | "buffering" | "warming" | "ready" | "playing"
  >("idle");
  const [stableYoutubePlayback, setStableYoutubePlayback] = useState<{
    key: string;
    embedUrl: string;
  } | null>(null);
  const [stableAnimeVideoPlayback, setStableAnimeVideoPlayback] = useState<{
    key: string;
    sourceUrl: string;
  } | null>(null);
  const animeVideoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastPreviewRef = useRef<string | null>(null);
  const progressStateRef = useRef<{ key: string; value: number }>({ key: "", value: 0 });
  const postRoundProgressRef = useRef<{ key: string; startedAtMs: number } | null>(null);
  const audioRetryTimeoutRef = useRef<number | null>(null);
  const animeWarmupRafRef = useRef<number | null>(null);
  const animeWarmupVerificationRef = useRef<{
    key: string;
    baselineSec: number;
    startedAtMs: number;
  } | null>(null);
  const animeWarmupVerifiedKeyRef = useRef<string | null>(null);
  const animeReloadAttemptRef = useRef<{ key: string; count: number } | null>(null);
  const animeDiagnosticsRef = useRef<Set<string>>(new Set());
  const userInteractionUnlockedRef = useRef(false);
  const lastSnapshotErrorToastRef = useRef<string | null>(null);
  const lastPlaybackErrorToastRef = useRef<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setClockNow(Date.now() + serverClockOffsetMs), 80);
    return () => window.clearInterval(id);
  }, [serverClockOffsetMs]);

  const realtimeConnected = useRoomRealtimeSubscription(roomCode);
  const snapshotQuery = useQuery({
    queryKey: ["realtime-room-view", roomCode],
    queryFn: async () => {
      const snapshot = await fetchLiveRoomState(roomCode);
      return {
        ok: true as const,
        roomCode,
        snapshot,
        serverNowMs: snapshot.serverNowMs,
      };
    },
    refetchInterval: realtimeConnected ? false : 1_000,
  });

  const state = snapshotQuery.data?.snapshot;
  const titlePreferenceQuery = useQuery({
    queryKey: ["account-title-preference"],
    queryFn: async () => {
      try {
        return await getAccountTitlePreference();
      } catch (error) {
        if (error instanceof HttpStatusError && error.status === 401) {
          return {
            ok: true as const,
            titlePreference: "mixed" as const,
          };
        }
        throw error;
      }
    },
    retry: false,
    staleTime: 60_000,
  });
  const titlePreference = titlePreferenceQuery.data?.titlePreference ?? "mixed";

  useEffect(() => {
    if (typeof snapshotQuery.data?.serverNowMs !== "number") return;
    setServerClockOffsetMs(snapshotQuery.data.serverNowMs - Date.now());
  }, [snapshotQuery.data?.serverNowMs]);
  const effectivePhase = useMemo(
    () => getEffectiveRoomPhase(state, clockNow),
    [clockNow, state],
  );
  const effectiveDeadlineMs = useMemo(
    () => getEffectiveRoomDeadlineMs(state, clockNow, ROUND_MS),
    [clockNow, state],
  );
  const effectiveStartedAtMs = useMemo(
    () => getEffectiveRoomStartedAtMs(state, clockNow, ROUND_MS),
    [clockNow, state],
  );
  const nextTransitionAtMs = useMemo(
    () => getNextRoomTransitionAtMs(state),
    [state?.deadlineMs, state?.roundSync?.plannedStartAtMs, state?.state],
  );

  useEffect(() => {
    if (nextTransitionAtMs === null) return;
    const delayMs = Math.max(0, nextTransitionAtMs - (Date.now() + serverClockOffsetMs) + 40);
    const timeoutId = window.setTimeout(() => {
      snapshotQuery.refetch().catch(() => undefined);
    }, delayMs);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [nextTransitionAtMs, serverClockOffsetMs, snapshotQuery.refetch]);

  useEffect(() => {
    const error = snapshotQuery.error;
    if (!error) {
      lastSnapshotErrorToastRef.current = null;
      return;
    }
    const signature =
      error instanceof HttpStatusError
        ? `${error.status}:${error.message}`
        : (errorCode(error) ?? "UNKNOWN_ERROR");
    if (lastSnapshotErrorToastRef.current === signature) return;
    lastSnapshotErrorToastRef.current = signature;
    notify.error(getProjectionSnapshotErrorMessage(error, locale), {
      key: `room-view:snapshot:${roomCode}:${signature}`,
    });
  }, [locale, roomCode, snapshotQuery.error]);

  const remainingMs = useMemo(() => {
    if (!effectiveDeadlineMs) return null;
    return effectiveDeadlineMs - clockNow;
  }, [clockNow, effectiveDeadlineMs]);
  const roundMediaKey = `${state?.round ?? 0}:${state?.media?.trackId ?? state?.reveal?.trackId ?? "none"}`;
  const progressKey = `${effectivePhase ?? state?.state ?? "none"}:${state?.round ?? 0}:${effectiveDeadlineMs ?? 0}:${state?.media?.trackId ?? state?.reveal?.trackId ?? "none"}`;

  useEffect(() => {
    if (!state) {
      progressStateRef.current = { key: "", value: 0 };
      postRoundProgressRef.current = null;
      setProgress(0);
      return;
    }

    if (state.state === "reveal" || state.state === "leaderboard") {
      const postKey = `post-round:${roundMediaKey}`;
      if (!postRoundProgressRef.current || postRoundProgressRef.current.key !== postKey) {
        postRoundProgressRef.current = { key: postKey, startedAtMs: clockNow };
      }
      const startedAtMs = postRoundProgressRef.current.startedAtMs;
      const elapsedMs = Math.max(0, clockNow - startedAtMs);
      const rawProgress = clamp01(elapsedMs / (REVEAL_MS + LEADERBOARD_MS));
      const previous = progressStateRef.current;
      const nextProgress =
        previous.key === postKey ? Math.max(previous.value, rawProgress) : rawProgress;

      progressStateRef.current = {
        key: postKey,
        value: nextProgress,
      };
      setProgress(nextProgress);
      return;
    }

    postRoundProgressRef.current = null;
    const rawProgress = phaseProgress(effectivePhase ?? state.state, remainingMs);
    const previous = progressStateRef.current;
    const nextProgress =
      previous.key === progressKey ? Math.max(previous.value, rawProgress) : rawProgress;

    progressStateRef.current = {
      key: progressKey,
      value: nextProgress,
    };
    setProgress(nextProgress);
  }, [effectivePhase, progressKey, remainingMs, state]);

  const youtubePlayback = useMemo(() => {
    if (!state?.media?.embedUrl || !state.media.trackId) return null;
    if (state.media.provider !== "youtube") return null;
    return {
      key: `${state.media.provider}:${state.media.trackId}`,
      embedUrl: state.media.embedUrl,
    };
  }, [state?.media?.embedUrl, state?.media?.provider, state?.media?.trackId]);

  const animeVideoPlayback = useMemo(() => {
    if (!state?.media?.sourceUrl || !state.media.trackId) return null;
    if (state.media.provider !== "animethemes") return null;
    return {
      key: `${state.media.provider}:${state.media.trackId}`,
      sourceUrl: state.media.sourceUrl,
    };
  }, [state?.media?.sourceUrl, state?.media?.provider, state?.media?.trackId]);

  useEffect(() => {
    if (youtubePlayback) {
      setStableYoutubePlayback((previous) => {
        if (previous?.key === youtubePlayback.key) return previous;
        return youtubePlayback;
      });
      return;
    }

    const shouldClear =
      state?.state === "waiting" ||
      state?.state === "playing" ||
      state?.state === "results" ||
      state?.state === undefined;
    if (shouldClear) {
      setStableYoutubePlayback(null);
    }
  }, [state?.state, youtubePlayback]);

  useEffect(() => {
    if (animeVideoPlayback) {
      setStableAnimeVideoPlayback((previous) => {
        if (previous?.key === animeVideoPlayback.key) return previous;
        return animeVideoPlayback;
      });
      return;
    }

    const shouldClear =
      state?.state === "waiting" || state?.state === "results" || state?.state === undefined;
    if (shouldClear) {
      setStableAnimeVideoPlayback(null);
    }
  }, [animeVideoPlayback, state?.state]);

  const activeYoutubeEmbed = stableYoutubePlayback?.embedUrl ?? null;
  const activeAnimeVideoSource = stableAnimeVideoPlayback?.sourceUrl ?? null;
  const usingYouTubePlayback = Boolean(activeYoutubeEmbed);
  const usingAnimeVideoPlayback = Boolean(activeAnimeVideoSource);
  const currentAnimeRoundKey = useMemo(() => {
    if (!state?.media || state.media.provider !== "animethemes") return null;
    return `${state.round}:${state.media.trackId}`;
  }, [state?.media, state?.round]);
  const shouldKeepMediaPlaying = effectivePhase === "playing" || effectivePhase === "reveal";
  const shouldWarmupAnimePlayback =
    effectivePhase === "loading" &&
    state?.state === "loading" &&
    currentAnimeRoundKey !== null &&
    usingAnimeVideoPlayback;
  const revealVideoActive =
    (usingYouTubePlayback || usingAnimeVideoPlayback) &&
    (state?.state === "reveal" || state?.state === "leaderboard");
  const showRevealAnswersInLeaderboard =
    state?.state === "reveal" || state?.state === "leaderboard";
  const revealAnswerByPlayerId = useMemo(() => {
    const map = new Map<
      string,
      { answer: string | null; submitted: boolean; isCorrect: boolean }
    >();
    if (!showRevealAnswersInLeaderboard || !state?.reveal) return map;
    for (const entry of state.reveal.playerAnswers) {
      map.set(entry.playerId, {
        answer: entry.answer,
        submitted: entry.submitted,
        isCorrect: entry.isCorrect,
      });
    }
    return map;
  }, [showRevealAnswersInLeaderboard, state?.reveal]);
  const roundLabel = `${state?.round ?? 0}/${state?.totalRounds ?? 0}`;
  const revealArtwork = state?.reveal ? revealArtworkUrl(state.reveal) : null;

  function currentRoundMediaOffsetSec() {
    return Math.max(0, state?.roundSync?.mediaOffsetSec ?? 0);
  }

  function describeMediaElement(media: HTMLMediaElement | null) {
    if (!media) return {};
    return {
      readyState: media.readyState,
      networkState: media.networkState,
      currentTime: Number.isFinite(media.currentTime) ? Number(media.currentTime.toFixed(3)) : null,
      currentSrc: media.currentSrc || media.getAttribute("src") || null,
    };
  }

  function logAnimeDiagnosticOnce(
    level: Parameters<typeof logClientEvent>[0],
    event: string,
    key: string,
    data: Record<string, unknown> = {},
  ) {
    const signature = `${event}:${key}`;
    if (animeDiagnosticsRef.current.has(signature)) return;
    animeDiagnosticsRef.current.add(signature);
    logClientEvent(level, event, {
      roomCode,
      projection: true,
      round: state?.round ?? null,
      phase: state?.state ?? null,
      effectivePhase: effectivePhase ?? null,
      ...data,
    });
  }

  function cancelAnimeWarmupVerification() {
    if (animeWarmupRafRef.current !== null) {
      window.cancelAnimationFrame(animeWarmupRafRef.current);
      animeWarmupRafRef.current = null;
    }
    animeWarmupVerificationRef.current = null;
  }

  function animeBufferedAheadSec(video: HTMLVideoElement) {
    const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    for (let index = 0; index < video.buffered.length; index += 1) {
      const start = video.buffered.start(index);
      const end = video.buffered.end(index);
      if (currentTime + 0.25 < start || currentTime > end + 0.25) continue;
      return Math.max(0, end - currentTime);
    }
    return 0;
  }

  function hasEnoughAnimeReadyBuffer(video: HTMLVideoElement) {
    if (video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return false;
    return animeBufferedAheadSec(video) >= ANIME_MEDIA_PREPARED_BUFFER_SEC;
  }

  function disposeAnimeVideoElement(
    video: HTMLVideoElement | null,
    reason: string,
    trackKey = currentAnimeRoundKey ?? `${state?.round ?? 0}:${stableAnimeVideoPlayback?.key ?? "none"}`,
  ) {
    if (!video) return;
    cancelAnimeWarmupVerification();
    logAnimeDiagnosticOnce("info", "anime_video_disposed", `${trackKey}:${reason}`, {
      reason,
      ...describeMediaElement(video),
    });
    try {
      video.pause();
    } catch {
      // Ignore pause failures during projection teardown.
    }
    try {
      video.removeAttribute("src");
    } catch {
      // Ignore attribute cleanup errors.
    }
    try {
      video.load();
    } catch {
      // Ignore decoder reset failures.
    }
  }

  function retryAnimeMediaLoad(trackKey: string) {
    const video = animeVideoRef.current;
    if (!video || !activeAnimeVideoSource) return false;

    const previousAttempt =
      animeReloadAttemptRef.current?.key === trackKey ? animeReloadAttemptRef.current.count : 0;
    if (previousAttempt >= 1) return false;

    animeReloadAttemptRef.current = {
      key: trackKey,
      count: previousAttempt + 1,
    };
    animeWarmupVerifiedKeyRef.current = null;
    setAudioError(false);
    setAnimePlaybackStatus("buffering");
    logAnimeDiagnosticOnce("warn", "anime_video_soft_reload", trackKey, {
      attempt: previousAttempt + 1,
      sourceUrl: activeAnimeVideoSource,
      ...describeMediaElement(video),
    });
    disposeAnimeVideoElement(video, "soft_reload", trackKey);
    video.src = activeAnimeVideoSource;
    video.load();
    return true;
  }

  function timelinePlaybackTargetSec(nowMs: number) {
    const baseOffsetSec = currentRoundMediaOffsetSec();
    if (effectivePhase === "playing" && effectiveStartedAtMs !== null) {
      return baseOffsetSec + Math.max(0, nowMs - effectiveStartedAtMs) / 1_000;
    }
    if (effectivePhase === "reveal" && effectiveDeadlineMs !== null) {
      const revealStartedAtMs = effectiveDeadlineMs - REVEAL_MS;
      return (
        baseOffsetSec +
        ROUND_MS / 1_000 +
        Math.max(0, nowMs - revealStartedAtMs) / 1_000
      );
    }
    return baseOffsetSec;
  }

  function syncMediaElementToTimeline(
    media: HTMLMediaElement | null,
    nowMs = Date.now() + serverClockOffsetMs,
  ) {
    if (!media) return;
    const rawTargetSec = timelinePlaybackTargetSec(nowMs);
    const duration =
      typeof media.duration === "number" && Number.isFinite(media.duration)
        ? Math.max(0, media.duration)
        : null;
    const targetSec =
      duration === null ? rawTargetSec : Math.min(rawTargetSec, Math.max(0, duration - 0.25));
    try {
      if (Math.abs(media.currentTime - targetSec) > 0.45) {
        media.currentTime = targetSec;
      }
    } catch {
      // Ignore seek errors while the decoder pipeline initializes.
    }
  }

  function handleAnimeLoadedMetadata() {
    const video = animeVideoRef.current;
    if (!video) return;
    setAnimePlaybackStatus("buffering");
    syncMediaElementToTimeline(video);
  }

  function verifyAnimeWarmupPlayback(trackKey: string) {
    if (animeWarmupRafRef.current !== null) return;
    const tick = () => {
      const video = animeVideoRef.current;
      const verification = animeWarmupVerificationRef.current;
      if (!video || !verification || verification.key !== trackKey) {
        cancelAnimeWarmupVerification();
        return;
      }
      if (animeWarmupVerifiedKeyRef.current === trackKey) {
        cancelAnimeWarmupVerification();
        return;
      }
      const advancedSec = Math.max(0, video.currentTime - verification.baselineSec);
      if (advancedSec >= ANIME_MEDIA_VERIFIED_START_ADVANCE_SEC) {
        animeWarmupVerifiedKeyRef.current = trackKey;
        cancelAnimeWarmupVerification();
        video.pause();
        syncMediaElementToTimeline(video);
        setAnimePlaybackStatus("ready");
        return;
      }
      if (Date.now() - verification.startedAtMs >= ANIME_MEDIA_WARMUP_VERIFY_TIMEOUT_MS) {
        const elapsedMs = Math.max(0, Date.now() - verification.startedAtMs);
        const didRetry = retryAnimeMediaLoad(trackKey);
        logAnimeDiagnosticOnce("warn", "anime_video_warmup_verify_timeout", trackKey, {
          advancedSec: Number(advancedSec.toFixed(3)),
          elapsedMs,
          didRetry,
          ...describeMediaElement(video),
        });
        if (!didRetry) {
          cancelAnimeWarmupVerification();
          setAnimePlaybackStatus("buffering");
        }
        return;
      }
      animeWarmupRafRef.current = window.requestAnimationFrame(tick);
    };
    animeWarmupRafRef.current = window.requestAnimationFrame(tick);
  }

  function tryStartAnimeWarmup(video: HTMLVideoElement | null) {
    if (!video || !currentAnimeRoundKey || !shouldWarmupAnimePlayback) return false;
    if (animeWarmupVerifiedKeyRef.current === currentAnimeRoundKey) {
      setAnimePlaybackStatus("ready");
      return true;
    }
    if (!hasEnoughAnimeReadyBuffer(video)) {
      logAnimeDiagnosticOnce("info", "anime_video_warmup_waiting_for_buffer", currentAnimeRoundKey, {
        bufferedAheadSec: Number(animeBufferedAheadSec(video).toFixed(3)),
        ...describeMediaElement(video),
      });
      setAnimePlaybackStatus("buffering");
      return false;
    }
    if (animeWarmupVerificationRef.current?.key === currentAnimeRoundKey) {
      setAnimePlaybackStatus("warming");
      return true;
    }
    syncMediaElementToTimeline(video);
    const baselineSec = Number.isFinite(video.currentTime)
      ? video.currentTime
      : currentRoundMediaOffsetSec();
    cancelAnimeWarmupVerification();
    animeWarmupVerificationRef.current = {
      key: currentAnimeRoundKey,
      baselineSec,
      startedAtMs: Date.now(),
    };
    video.muted = true;
    video.defaultMuted = true;
    setAnimePlaybackStatus("warming");
    const startVerification = () => {
      verifyAnimeWarmupPlayback(currentAnimeRoundKey);
    };
    try {
      const playPromise = video.play();
      if (playPromise) {
        playPromise.then(startVerification).catch((error) => {
          logAnimeDiagnosticOnce("warn", "anime_video_warmup_play_failed", currentAnimeRoundKey, {
            error: error instanceof Error ? error.message : String(error),
            ...describeMediaElement(video),
          });
          cancelAnimeWarmupVerification();
          setAudioError(true);
          setAnimePlaybackStatus("buffering");
        });
      } else {
        startVerification();
      }
    } catch (error) {
      logAnimeDiagnosticOnce("warn", "anime_video_warmup_play_failed", currentAnimeRoundKey, {
        error: error instanceof Error ? error.message : String(error),
        ...describeMediaElement(video),
      });
      cancelAnimeWarmupVerification();
      setAudioError(true);
      setAnimePlaybackStatus("buffering");
      return false;
    }
    return true;
  }

  function handleAnimePlayable() {
    const video = animeVideoRef.current;
    if (!video) return;
    if (shouldWarmupAnimePlayback) {
      tryStartAnimeWarmup(video);
      return;
    }
    video.muted = false;
    video.defaultMuted = false;
    setAnimePlaybackStatus("playing");
    syncMediaElementToTimeline(video);
  }

  useEffect(() => {
    animeDiagnosticsRef.current.clear();
    animeReloadAttemptRef.current = null;
  }, [state?.round, state?.media?.trackId, state?.reveal?.trackId]);

  useEffect(() => {
    setAudioError(false);
    animeWarmupVerifiedKeyRef.current = null;
    cancelAnimeWarmupVerification();
    if (state?.state === "loading" && state.media?.provider === "animethemes") {
      setAnimePlaybackStatus("buffering");
      return;
    }
    setAnimePlaybackStatus("idle");
  }, [state?.state, state?.round, state?.media?.trackId]);

  useEffect(() => {
    const video = animeVideoRef.current;
    if (!video) return;

    if (!activeAnimeVideoSource) {
      disposeAnimeVideoElement(video, "source_cleared");
      animeWarmupVerifiedKeyRef.current = null;
      setAnimePlaybackStatus("idle");
      return;
    }

    if (shouldWarmupAnimePlayback) {
      video.muted = true;
      video.defaultMuted = true;
    } else {
      video.muted = false;
      video.defaultMuted = false;
    }
    setAnimePlaybackStatus("buffering");
    syncMediaElementToTimeline(video);
  }, [activeAnimeVideoSource, shouldWarmupAnimePlayback, stableAnimeVideoPlayback?.key]);

  useEffect(() => {
    const video = animeVideoRef.current;
    const trackKey = `${state?.round ?? 0}:${stableAnimeVideoPlayback?.key ?? "none"}`;
    return () => {
      disposeAnimeVideoElement(video, "track_change", trackKey);
    };
  }, [stableAnimeVideoPlayback?.key, state?.round]);

  useEffect(() => {
    const video = animeVideoRef.current;
    if (!video || !activeAnimeVideoSource) return;

    function onProgress() {
      tryStartAnimeWarmup(video);
    }

    video.addEventListener("progress", onProgress);
    return () => {
      video.removeEventListener("progress", onProgress);
    };
  }, [
    activeAnimeVideoSource,
    currentAnimeRoundKey,
    shouldWarmupAnimePlayback,
    stableAnimeVideoPlayback?.key,
  ]);

  useEffect(() => {
    const video = animeVideoRef.current;
    if (!video || !activeAnimeVideoSource) return;
    if (shouldWarmupAnimePlayback) {
      tryStartAnimeWarmup(video);
      return;
    }
    cancelAnimeWarmupVerification();
    video.muted = false;
    video.defaultMuted = false;
    syncMediaElementToTimeline(video);
    if (!shouldKeepMediaPlaying) {
      video.pause();
      return;
    }
    const playPromise = video.play();
    if (playPromise) {
      playPromise.catch((error) => {
        logAnimeDiagnosticOnce("warn", "anime_video_play_failed", currentAnimeRoundKey ?? "none", {
          error: error instanceof Error ? error.message : String(error),
          ...describeMediaElement(video),
        });
      });
    }
  }, [
    activeAnimeVideoSource,
    shouldKeepMediaPlaying,
    shouldWarmupAnimePlayback,
    stableAnimeVideoPlayback?.key,
  ]);

  useEffect(() => {
    if (!shouldKeepMediaPlaying || !activeAnimeVideoSource) return;
    const intervalId = window.setInterval(() => {
      syncMediaElementToTimeline(animeVideoRef.current);
    }, 1_250);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    activeAnimeVideoSource,
    shouldKeepMediaPlaying,
    effectiveStartedAtMs,
    effectiveDeadlineMs,
    serverClockOffsetMs,
    state?.roundSync?.mediaOffsetSec,
  ]);

  useEffect(() => {
    const activeProvider = state?.media?.provider ?? state?.reveal?.provider ?? null;
    if (!audioError) {
      lastPlaybackErrorToastRef.current = null;
      return;
    }
    const trackId = state?.media?.trackId ?? state?.reveal?.trackId ?? "unknown";
    const key = `room-view:playback:${roomCode}:${state?.state ?? "unknown"}:${trackId}:${activeProvider ?? "preview"}`;
    if (lastPlaybackErrorToastRef.current === key) return;
    lastPlaybackErrorToastRef.current = key;
    notify.error(getProjectionPlaybackErrorMessage(activeProvider, locale), { key });
  }, [
    audioError,
    locale,
    roomCode,
    state?.media?.provider,
    state?.media?.trackId,
    state?.reveal?.provider,
    state?.reveal?.trackId,
    state?.state,
  ]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audioRetryTimeoutRef.current !== null) {
      window.clearTimeout(audioRetryTimeoutRef.current);
      audioRetryTimeoutRef.current = null;
    }

    if (activeYoutubeEmbed || activeAnimeVideoSource) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      lastPreviewRef.current = null;
      return;
    }

    const previewUrl = state?.previewUrl ?? null;
    if (!previewUrl) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      lastPreviewRef.current = null;
      return;
    }

    setAudioError(false);
    if (lastPreviewRef.current !== previewUrl) {
      lastPreviewRef.current = previewUrl;
      audio.src = previewUrl;
      audio.currentTime = 0;
    }

    syncMediaElementToTimeline(audio);
    if (!shouldKeepMediaPlaying) {
      audio.pause();
      return;
    }

    const playPromise = audio.play();
    if (playPromise) {
      playPromise.catch(() => {
        if (audioRetryTimeoutRef.current !== null) return;
        audioRetryTimeoutRef.current = window.setTimeout(() => {
          audioRetryTimeoutRef.current = null;
          const nextAudio = audioRef.current;
          if (!nextAudio || !nextAudio.src) return;
          nextAudio.play().catch(() => undefined);
        }, 320);
      });
    }
  }, [
    activeAnimeVideoSource,
    activeYoutubeEmbed,
    shouldKeepMediaPlaying,
    state?.previewUrl,
  ]);

  useEffect(() => {
    function unlockAudioPlayback() {
      const shouldKickIframe = Boolean(activeYoutubeEmbed) && !userInteractionUnlockedRef.current;
      userInteractionUnlockedRef.current = true;
      const canAutoPlayMedia = shouldKeepMediaPlaying || shouldWarmupAnimePlayback;

      const audio = audioRef.current;
      if (audio && audio.src && canAutoPlayMedia) {
        audio.play().catch(() => undefined);
      }
      const video = animeVideoRef.current;
      if (video && activeAnimeVideoSource && canAutoPlayMedia) {
        if (shouldWarmupAnimePlayback) {
          tryStartAnimeWarmup(video);
        } else {
          video.play().catch(() => undefined);
        }
      }
      if (shouldKickIframe) {
        setIframeEpoch((value) => value + 1);
      }
    }

    window.addEventListener("pointerdown", unlockAudioPlayback, { passive: true });
    window.addEventListener("keydown", unlockAudioPlayback);
    return () => {
      window.removeEventListener("pointerdown", unlockAudioPlayback);
      window.removeEventListener("keydown", unlockAudioPlayback);
    };
  }, [
    activeAnimeVideoSource,
    activeYoutubeEmbed,
    shouldKeepMediaPlaying,
    shouldWarmupAnimePlayback,
  ]);

  useEffect(() => {
    return () => {
      if (audioRetryTimeoutRef.current !== null) {
        window.clearTimeout(audioRetryTimeoutRef.current);
      }
      if (animeWarmupRafRef.current !== null) {
        window.cancelAnimationFrame(animeWarmupRafRef.current);
      }
      try {
        const video = animeVideoRef.current;
        if (video) {
          video.pause();
          video.removeAttribute("src");
          video.load();
        }
      } catch {
        // Ignore cleanup failures during unmount.
      }
    };
  }, []);

  return (
    <motion.section className="projection-stage" variants={impactPageVariants} {...stageMotion}>
      <motion.article
        className="projection-center-stage projection-arena"
        variants={impactHeroVariants}
      >
        <div className="round-strip">
          <span>{copy.projection} {roomCode}</span>
          <strong>{copy.round} {roundLabel}</strong>
        </div>

        <div
          className={`sound-visual media-shell large${revealVideoActive ? " reveal-active" : ""}`}
        >
          {activeAnimeVideoSource && (
            <video
              ref={animeVideoRef}
              key={stableAnimeVideoPlayback?.key ?? "none"}
              className="media-video-layer anime-video-layer"
              src={activeAnimeVideoSource}
              preload="auto"
              playsInline
              onLoadedMetadata={handleAnimeLoadedMetadata}
              onCanPlayThrough={handleAnimePlayable}
              onPlaying={handleAnimePlayable}
              onError={() => {
                setAudioError(true);
              }}
            />
          )}
          {activeYoutubeEmbed && (
            <iframe
              key={`${stableYoutubePlayback?.key ?? "none"}|${iframeEpoch}`}
              className="media-video-layer youtube-video-layer"
              src={activeYoutubeEmbed}
              title={copy.playbackTitle}
              allow="autoplay; encrypted-media"
              onError={() => {
                setAudioError(true);
                setIframeEpoch((value) => value + 1);
              }}
            />
          )}
          <div className="media-wave-layer" aria-hidden="true">
            <div className={`wave-bars${usingAnimeVideoPlayback ? " wave-bars-fallback" : ""}`}>
              {WAVE_BARS.map((bar) => (
                <span
                  key={bar.key}
                  style={{
                    height: `${bar.heightPercent}%`,
                    animationDelay: `${bar.delaySec}s`,
                  }}
                />
              ))}
            </div>
            <div className="sound-timeline">
              <span style={{ width: `${(progress * 100).toFixed(3)}%` }} />
            </div>
          </div>
          {effectivePhase === "loading" && usingAnimeVideoPlayback && (
            <div className="media-loading-overlay" role="status" aria-live="polite">
              <span className="resolving-tracks-spinner" aria-hidden="true" />
              <p>{copy.loadingVideo}</p>
              <small>
                {animePlaybackStatus === "ready"
                  ? copy.readySync
                  : animePlaybackStatus === "warming"
                    ? copy.localPrep
                    : copy.buffering}
              </small>
              <small>
                {state?.mediaReadyCount ?? 0}/{state?.mediaReadyTotalCount ?? 0} {copy.ready}
                {(state?.mediaReadyTotalCount ?? 0) > 1 ? "s" : ""}
              </small>
            </div>
          )}
        </div>

        {effectivePhase === "playing" && state?.mode === "mcq" && state.choices && (
          <div className="projection-choices">
            {state.choices.map((choice, index) => (
              <div key={`${choice.value}-${index}`} className="projection-choice">
                {formatProjectionChoiceLabel(choice, titlePreference)}
              </div>
            ))}
          </div>
        )}

        {effectivePhase === "playing" && state?.mode === "text" && (
          <p className="projection-hint">{copy.textModeHint}</p>
        )}

        {(state?.state === "reveal" ||
          state?.state === "leaderboard" ||
          state?.state === "results") &&
          state?.reveal && (
            <div className="reveal-box large reveal-glass">
              <div className="reveal-cover">
                {revealArtwork ? (
                  <img src={revealArtwork} alt={`${state.reveal.title} ${copy.revealArtworkAlt}`} />
                ) : (
                  <div className="reveal-cover-fallback" aria-hidden="true" />
                )}
              </div>
              <div className="reveal-content">
                <p className="kicker">{copy.reveal}</p>
                <h3 className="reveal-title">
                  {formatProjectionRevealTitle(state.reveal, titlePreference)}
                </h3>
                {state.reveal.songTitle && (
                  <p className="reveal-song-title">{state.reveal.songTitle}</p>
                )}
                {state.reveal.songArtists.length > 0 && (
                  <p className="reveal-song-artists">{state.reveal.songArtists.join(", ")}</p>
                )}
                <p className="reveal-artist">
                  {withRomajiLabel(state.reveal.artist, state.reveal.artistRomaji)}
                </p>
              </div>
            </div>
          )}

        <ol className="leaderboard-list compact">
          {(state?.leaderboard ?? []).map((entry) => (
            <li key={entry.playerId} className={entry.hasAnsweredCurrentRound ? "answered" : ""}>
              <span>#{entry.rank}</span>
              <div className="leaderboard-player-block">
                <strong className="leaderboard-name">
                  {entry.displayName}
                  {entry.hasAnsweredCurrentRound && (
                    <i className="answer-check" aria-label={copy.answerValidated}>
                      ✓
                    </i>
                  )}
                </strong>
                {showRevealAnswersInLeaderboard &&
                  (() => {
                    const revealAnswer = revealAnswerByPlayerId.get(entry.playerId);
                    if (!revealAnswer) return null;
                    const label =
                      revealAnswer.submitted && revealAnswer.answer
                        ? withRomajiLabel(revealAnswer.answer)
                        : copy.noAnswer;
                    return (
                      <small
                        className={`leaderboard-reveal-answer${revealAnswer.isCorrect ? " correct" : revealAnswer.submitted ? " wrong" : ""}`}
                      >
                        {label}
                      </small>
                    );
                  })()}
              </div>
              <div className="leaderboard-score-block">
                <em>{entry.score} {copy.points}</em>
                <small className="leaderboard-meta">
                  <span className="round-gain">+{entry.lastRoundScore}</span>
                  <span className={`streak-chip${entry.streak > 0 ? " hot" : ""}`}>
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <path d="M12 2c.5 3-2 4.8-2 7.2 0 1.5 1 2.7 2 3.4 1.1-.7 2-2 2-3.6 0-1.8-1-3.1-2-4.6 2 .8 4.8 3.4 4.8 7.1A4.8 4.8 0 0 1 12 20a4.8 4.8 0 0 1-4.8-4.9C7.2 10.6 10.1 7.8 12 2Z" />
                    </svg>
                    {entry.streak}
                  </span>
                </small>
              </div>
            </li>
          ))}
        </ol>
      </motion.article>

      <audio
        ref={audioRef}
        className="blindtest-audio"
        preload="auto"
        onError={() => setAudioError(true)}
      >
        <track kind="captions" />
      </audio>
    </motion.section>
  );
}
