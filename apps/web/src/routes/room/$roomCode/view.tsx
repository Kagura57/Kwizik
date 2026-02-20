import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { fetchLiveRoomState } from "../../../lib/realtime";

const ROUND_MS = 12_000;
const COUNTDOWN_MS = 3_000;
const REVEAL_MS = 4_000;
const LEADERBOARD_MS = 3_000;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function phaseProgress(phase: string | undefined, remainingMs: number | null) {
  if (remainingMs === null) return 0;
  if (phase === "countdown") return clamp01((COUNTDOWN_MS - remainingMs) / COUNTDOWN_MS);
  if (phase === "playing") return clamp01((ROUND_MS - remainingMs) / ROUND_MS);
  if (phase === "reveal") {
    return clamp01((REVEAL_MS - remainingMs) / REVEAL_MS);
  }
  if (phase === "leaderboard") {
    return clamp01((LEADERBOARD_MS - remainingMs) / LEADERBOARD_MS);
  }
  return 0;
}

const WAVE_BARS = Array.from({ length: 64 }, (_, index) => ({
  key: index,
  heightPercent: 16 + ((index * 11) % 78),
  delaySec: (index % 10) * 0.07,
}));

function revealArtworkUrl(reveal: { provider: "spotify" | "deezer" | "apple-music" | "tidal" | "youtube"; trackId: string }) {
  if (reveal.provider === "youtube") {
    return `https://i.ytimg.com/vi/${reveal.trackId}/hqdefault.jpg`;
  }
  return null;
}

export function RoomViewPage() {
  const { roomCode } = useParams({ from: "/room/$roomCode/view" });
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [audioError, setAudioError] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [iframeEpoch, setIframeEpoch] = useState(0);
  const [stableYoutubePlayback, setStableYoutubePlayback] = useState<{
    key: string;
    embedUrl: string;
  } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastPreviewRef = useRef<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setClockNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

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
    refetchInterval: 1_000,
  });

  const state = snapshotQuery.data?.snapshot;
  const remainingMs = useMemo(() => {
    if (!state?.deadlineMs) return null;
    return state.deadlineMs - clockNow;
  }, [clockNow, state?.deadlineMs]);
  const progress =
    state?.state === "reveal" || state?.state === "leaderboard"
      ? 1
      : phaseProgress(state?.state, remainingMs);
  const youtubePlayback = useMemo(() => {
    if (!state?.media?.embedUrl || !state.media.trackId) return null;
    if (state.media.provider !== "youtube") return null;
    return {
      key: `${state.media.provider}:${state.media.trackId}`,
      embedUrl: state.media.embedUrl,
    };
  }, [state?.media?.embedUrl, state?.media?.provider, state?.media?.trackId]);

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

  const activeYoutubeEmbed = stableYoutubePlayback?.embedUrl ?? null;
  const usingYouTubePlayback = Boolean(activeYoutubeEmbed);
  const revealVideoActive =
    usingYouTubePlayback &&
    (state?.state === "reveal" || state?.state === "leaderboard");
  const isResults = state?.state === "results";
  const roundLabel = `${state?.round ?? 0}/${state?.totalRounds ?? 0}`;
  const revealArtwork = state?.reveal ? revealArtworkUrl(state.reveal) : null;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (activeYoutubeEmbed) {
      audio.pause();
      audio.removeAttribute("src");
      lastPreviewRef.current = null;
      return;
    }

    const previewUrl = state?.previewUrl ?? null;
    if (!previewUrl) {
      audio.pause();
      lastPreviewRef.current = null;
      return;
    }

    setAudioError(false);
    if (lastPreviewRef.current !== previewUrl) {
      lastPreviewRef.current = previewUrl;
      audio.src = previewUrl;
      audio.currentTime = 0;
    }

    const playPromise = audio.play();
    if (playPromise) {
      playPromise
        .then(() => setAutoplayBlocked(false))
        .catch(() => setAutoplayBlocked(true));
    }
  }, [activeYoutubeEmbed, state?.previewUrl, state?.state]);

  useEffect(() => {
    if (!activeYoutubeEmbed) return;
    setAutoplayBlocked(true);
  }, [activeYoutubeEmbed]);

  const activateAudio = useCallback(async () => {
    if (activeYoutubeEmbed) {
      setAutoplayBlocked(false);
      setIframeEpoch((value) => value + 1);
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    try {
      await audio.play();
      setAutoplayBlocked(false);
    } catch {
      setAutoplayBlocked(true);
    }
  }, [activeYoutubeEmbed]);

  useEffect(() => {
    if (!autoplayBlocked) return;

    function unlockFromInteraction() {
      void activateAudio();
    }

    window.addEventListener("pointerdown", unlockFromInteraction, { once: true });
    window.addEventListener("keydown", unlockFromInteraction, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlockFromInteraction);
      window.removeEventListener("keydown", unlockFromInteraction);
    };
  }, [activateAudio, autoplayBlocked]);

  return (
    <section className="projection-stage">
      <article className="projection-center-stage projection-arena">
        <div className="round-strip">
          <span>Projection {roomCode}</span>
          <strong>Manche {roundLabel}</strong>
        </div>

        <div className={`sound-visual large${revealVideoActive ? " reveal-active" : ""}`}>
          <div className="wave-bars" aria-hidden="true">
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
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </div>

        {state?.state === "playing" && state.mode === "mcq" && state.choices && (
          <div className="projection-choices">
            {state.choices.map((choice) => (
              <div key={choice} className="projection-choice">
                {choice}
              </div>
            ))}
          </div>
        )}

        {state?.state === "playing" && state.mode === "text" && (
          <p className="projection-hint">Mode texte: trouver titre ou artiste</p>
        )}

        {(state?.state === "reveal" || state?.state === "leaderboard" || state?.state === "results") &&
          state?.reveal && (
            <div className="reveal-box large reveal-glass">
              <div className="reveal-cover">
                {revealArtwork ? (
                  <img src={revealArtwork} alt={`${state.reveal.title} cover`} />
                ) : (
                  <div className="reveal-cover-fallback" aria-hidden="true" />
                )}
              </div>
              <div className="reveal-content">
                <p className="kicker">Reveal</p>
                <h3 className="reveal-title">{state.reveal.title}</h3>
                <p className="reveal-artist">{state.reveal.artist}</p>
              </div>
            </div>
          )}

        {!isResults && activeYoutubeEmbed && (
          <div className="blindtest-video-shell">
            <iframe
              key={`${stableYoutubePlayback?.key ?? "none"}|${iframeEpoch}`}
              className={revealVideoActive ? "blindtest-video-reveal" : "blindtest-video-hidden"}
              src={activeYoutubeEmbed}
              title="Projection playback"
              allow="autoplay; encrypted-media"
            />
          </div>
        )}

        <ol className="leaderboard-list compact">
          {(state?.leaderboard ?? []).map((entry) => (
            <li key={entry.playerId}>
              <span>#{entry.rank}</span>
              <strong>{entry.displayName}</strong>
              <em>{entry.score} pts</em>
            </li>
          ))}
        </ol>
      </article>

      <audio
        ref={audioRef}
        className="blindtest-audio"
        preload="auto"
        onError={() => setAudioError(true)}
      >
        <track kind="captions" />
      </audio>

      {audioError && !usingYouTubePlayback && (
        <div className="projection-audio-status">
          <p className="status error">Erreur audio sur la piste en cours.</p>
        </div>
      )}
    </section>
  );
}
