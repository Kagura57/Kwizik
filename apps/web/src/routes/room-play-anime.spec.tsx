import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("room play anime mode", () => {
  it("guards loopback API and realtime fallbacks behind the local dev origin helper", () => {
    const apiFile = readFileSync("apps/web/src/lib/api.ts", "utf8");
    const realtimeFile = readFileSync("apps/web/src/lib/useRoomRealtimeSubscription.ts", "utf8");
    expect(apiFile).toContain("shouldAllowLoopbackFallbacks()");
    expect(realtimeFile).toContain("shouldAllowLoopbackFallbacks()");
    expect(realtimeFile).not.toContain('candidates.push("ws://127.0.0.1:3001");\n\n  const seen');
  });

  it("keeps anime playback continuous into reveal without preloading the next animethemes track on the player page", () => {
    const file = readFileSync("apps/web/src/routes/room/$roomCode/play.tsx", "utf8");
    expect(file).toContain("Nom de l'anime");
    expect(file).toContain("media-shell");
    expect(file).toContain("anime-video-layer");
    expect(file).toContain("Chargement de la video");
    expect(file).toContain("video.removeAttribute(\"src\")");
    expect(file).toContain("anilist_union");
    expect(file).toContain("ANIME_MEDIA_SOFT_RETRY_TIMEOUT_MS");
    expect(file).toContain("ANIME_MEDIA_LONG_LOAD_TOAST_MS");
    expect(file).toContain("ANIME_MEDIA_PREPARED_BUFFER_SEC");
    expect(file).toContain("ANIME_MEDIA_VERIFIED_START_ADVANCE_SEC");
    expect(file).toContain("ANIME_MEDIA_WARMUP_VERIFY_TIMEOUT_MS");
    expect(file).toContain("animeWarmupVerificationRef");
    expect(file).toContain("animeDiagnosticsRef");
    expect(file).toContain("verifyAnimeWarmupPlayback");
    expect(file).toContain("tryStartAnimeWarmup");
    expect(file).toContain("disposeAnimeVideoElement");
    expect(file).toContain("video.muted = true");
    expect(file).toContain("Pret localement, synchronisation de la room...");
    expect(file).toContain("shouldKeepMediaPlaying");
    expect(file).toContain('effectivePhase === "reveal"');
    expect(file).toContain("if (!shouldKeepMediaPlaying)");
    expect(file).toContain("Chargement du theme toujours en cours, nouvelle tentative...");
    expect(file).toContain("video.buffered.end(index)");
    expect(file).toContain("anime_video_warmup_verify_timeout");
    expect(file).toContain("anime_video_soft_reload");
    expect(file).toContain("audio.load();");
    expect(file).not.toContain('state?.nextMedia?.provider === "animethemes"');
    expect(file).not.toContain("data-kwizik-next-anime-preload");
    expect(file).not.toContain("ANIME_MEDIA_ERROR_THRESHOLD = 3");
    expect(file).not.toContain("Passage automatique au round suivant");
    expect(file).not.toContain("reportRoomMediaUnavailable");
  });

  it("mirrors reveal playback continuity on the projection page", () => {
    const file = readFileSync("apps/web/src/routes/room/$roomCode/view.tsx", "utf8");
    expect(file).toContain("media-shell");
    expect(file).toContain("anime-video-layer");
    expect(file).toContain("disposeAnimeVideoElement");
    expect(file).toContain("anime_video_warmup_verify_timeout");
    expect(file).toContain("shouldKeepMediaPlaying");
    expect(file).toContain('effectivePhase === "reveal"');
    expect(file).toContain("if (!shouldKeepMediaPlaying)");
    expect(file).toContain("audio.load();");
  });
});
