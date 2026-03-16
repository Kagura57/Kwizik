import type { MusicTrack } from "./music-types";
import type { RoundChoice, RoundMode, RoomAnswerMode, RoomMediaProvider, RoomPhase, RoomSourceMode } from "../../../../packages/shared/src/room";
import type { Player, RoomSession } from "./RoomStore";

type SnapshotMedia = {
  provider: RoomMediaProvider;
  trackId: string;
  sourceUrl: string | null;
  embedUrl: string | null;
} | null;

type SnapshotReveal = RoomSession["latestReveal"];

export type RoomSnapshot = {
  roomCode: string;
  state: RoomPhase;
  round: number;
  mode: RoundMode | null;
  choices: RoundChoice[] | null;
  serverNowMs: number;
  playerCount: number;
  hostPlayerId: string | null;
  players: Array<{
    playerId: string;
    displayName: string;
    isReady: boolean;
    hasAnsweredCurrentRound: boolean;
    isHost: boolean;
    lives: number;
    isEliminated: boolean;
    canContributeLibrary: boolean;
    libraryContribution: {
      includeInPool: {
        spotify: boolean;
        deezer: boolean;
      };
      linkedProviders: {
        spotify: "linked" | "not_linked" | "expired";
        deezer: "linked" | "not_linked" | "expired";
      };
      estimatedTrackCount: {
        spotify: number | null;
        deezer: number | null;
      };
      syncStatus: "idle" | "syncing" | "ready" | "error";
      lastError: string | null;
    };
  }>;
  readyCount: number;
  allReady: boolean;
  canStart: boolean;
  isResolvingTracks: boolean;
  poolSize: number;
  categoryQuery: string;
  sourceMode: RoomSourceMode;
  answerMode: RoomAnswerMode;
  livesMode: boolean;
  maxLives: number;
  roomRoundConfig: RoomSession["roomRoundConfig"];
  sourceConfig: {
    mode: RoomSession["sourceMode"];
    themeMode: RoomSession["themeMode"];
    difficultyFilter: RoomSession["difficultyFilter"];
    contentFilters: {
      decades: number[];
      genres: string[];
    };
    publicPlaylist: RoomSession["publicPlaylistSelection"];
    playersLikedRules: RoomSession["playersLikedRules"];
  };
  poolBuild: RoomSession["poolBuild"];
  totalRounds: number;
  deadlineMs: number | null;
  roundSync: ReturnType<RoomSession["roundSync"]["snapshot"]>;
  guessDoneCount: number;
  guessTotalCount: number;
  mediaReadyCount: number;
  mediaReadyTotalCount: number;
  revealSkipCount: number;
  revealSkipTotalCount: number;
  previewUrl: string | null;
  media: SnapshotMedia;
  nextMedia: SnapshotMedia;
  reveal: SnapshotReveal | null;
  leaderboard: Array<{
    rank: number;
    playerId: string;
    userId: string | null;
    displayName: string;
    score: number;
    lastRoundScore: number;
    streak: number;
    maxStreak: number;
    lives: number;
    isEliminated: boolean;
    averageResponseMs: number | null;
    hasAnsweredCurrentRound: boolean;
  }> | null;
  chatMessages: RoomSession["chatMessages"];
  answerSuggestions: string[];
};

type CreateRoomSnapshotInput = {
  session: RoomSession;
  nowMs: number;
  state: RoomPhase;
  currentRound: number;
  currentMode: RoundMode | null;
  activeTrack: MusicTrack | null;
  buildRoundChoices: (session: RoomSession, round: number) => RoundChoice[];
  ensureHost: (session: RoomSession) => string | null;
  sortedPlayers: (session: RoomSession) => Player[];
  isPlayerSpectating: (session: RoomSession, player: Player | null | undefined) => boolean;
  canStartWaitingSession: (session: RoomSession) => boolean;
  ranking: (session: RoomSession) => Array<{
    rank: number;
    playerId: string;
    userId: string | null;
    displayName: string;
    score: number;
    lastRoundScore: number;
    streak: number;
    maxStreak: number;
    lives: number;
    isEliminated: boolean;
    averageResponseMs: number | null;
  }>;
  activePlayerIds: (session: RoomSession) => string[];
  trackForRound: (session: RoomSession, round: number) => MusicTrack | null;
  hasGuessDone: (playerId: string) => boolean;
  hasRevealSkipped: (playerId: string) => boolean;
  embedUrlForTrack: (
    track: Pick<MusicTrack, "provider" | "id" | "durationSec">,
    context?: { roomCode: string; round: number },
  ) => string | null;
  collectRoomAnswerSuggestions: (tracks: MusicTrack[]) => string[];
};

function buildPlayersSnapshot(input: CreateRoomSnapshotInput, hostPlayerId: string | null) {
  const { session, sortedPlayers, isPlayerSpectating, state, hasGuessDone } = input;
  return sortedPlayers(session).map((player) => ({
    playerId: player.id,
    displayName: player.displayName,
    isReady: player.isReady,
    hasAnsweredCurrentRound:
      state === "playing" && !isPlayerSpectating(session, player) ? hasGuessDone(player.id) : false,
    isHost: player.id === hostPlayerId,
    lives: player.lives,
    isEliminated: player.isEliminated,
    canContributeLibrary: Boolean(player.userId),
    libraryContribution: {
      includeInPool: {
        spotify: player.library.includeInPool.spotify,
        deezer: player.library.includeInPool.deezer,
      },
      linkedProviders: {
        spotify: player.library.linkedProviders.spotify,
        deezer: player.library.linkedProviders.deezer,
      },
      estimatedTrackCount: {
        spotify: player.library.estimatedTrackCount.spotify,
        deezer: player.library.estimatedTrackCount.deezer,
      },
      syncStatus: player.library.syncStatus,
      lastError: player.library.lastError,
    },
  }));
}

function buildSnapshotMedia(
  track: MusicTrack | null,
  embedUrlForTrack: CreateRoomSnapshotInput["embedUrlForTrack"],
  context: { roomCode: string; round: number },
): SnapshotMedia {
  if (!track) return null;
  return {
    provider: track.provider,
    trackId: track.id,
    sourceUrl: track.sourceUrl,
    embedUrl: embedUrlForTrack(track, context),
  };
}

export function createRoomSnapshot(input: CreateRoomSnapshotInput): RoomSnapshot {
  const {
    session,
    nowMs,
    state,
    currentRound,
    currentMode,
    activeTrack,
    buildRoundChoices,
    ensureHost,
    canStartWaitingSession,
    ranking,
    activePlayerIds,
    trackForRound,
    hasGuessDone,
    hasRevealSkipped,
    embedUrlForTrack,
    collectRoomAnswerSuggestions,
  } = input;

  const choices =
    state === "playing" && currentMode === "mcq" ? buildRoundChoices(session, currentRound) : null;
  const hostPlayerId = ensureHost(session);
  const players = buildPlayersSnapshot(input, hostPlayerId);
  const readyCount = players.filter((player) => player.isReady).length;
  const allReady = players.length > 0 && readyCount === players.length;
  const canStart = canStartWaitingSession(session);
  const leaderboard = ranking(session)
    .slice(0, 10)
    .map((entry) => ({
      ...entry,
      hasAnsweredCurrentRound: state === "playing" ? hasGuessDone(entry.playerId) : false,
    }));
  const playerIds = activePlayerIds(session);
  const roundSync = session.roundSync.snapshot();
  const guessTotalCount = state === "playing" ? playerIds.length : 0;
  const guessDoneCount = state === "playing" ? playerIds.filter((playerId) => hasGuessDone(playerId)).length : 0;
  const mediaReadyTotalCount = state === "loading" ? playerIds.length : 0;
  const mediaReadyCount = state === "loading" ? roundSync.preparedCount : 0;
  const revealSkipTotalCount = state === "reveal" ? playerIds.length : 0;
  const revealSkipCount =
    state === "reveal" ? playerIds.filter((playerId) => hasRevealSkipped(playerId)).length : 0;
  const revealMedia =
    state === "reveal" || state === "leaderboard" || state === "results" ? session.latestReveal : null;
  const nextRound =
    state === "countdown"
      ? 1
      : state === "loading" || state === "playing" || state === "reveal" || state === "leaderboard"
        ? currentRound + 1
        : 0;
  const nextTrack = trackForRound(session, nextRound);
  const media =
    (state === "playing" || state === "loading") && activeTrack
      ? buildSnapshotMedia(activeTrack, embedUrlForTrack, {
          roomCode: session.roomCode,
          round: currentRound,
        })
      : revealMedia
        ? {
            provider: revealMedia.provider,
            trackId: revealMedia.trackId,
            sourceUrl: revealMedia.sourceUrl,
            embedUrl: revealMedia.embedUrl,
          }
        : null;
  const nextMedia = buildSnapshotMedia(nextTrack, embedUrlForTrack, {
    roomCode: session.roomCode,
    round: nextRound,
  });
  const suggestionTracks =
    session.trackPool.length > 0 ? [...session.trackPool, ...session.distractorTrackPool] : session.playersLikedPool;

  return {
    roomCode: session.roomCode,
    state,
    round: currentRound,
    mode: currentMode,
    choices,
    serverNowMs: nowMs,
    playerCount: session.players.size,
    hostPlayerId,
    players,
    readyCount,
    allReady,
    canStart,
    isResolvingTracks: session.isResolvingTracks,
    poolSize: session.trackPool.length,
    categoryQuery: session.categoryQuery,
    sourceMode: session.sourceMode,
    answerMode: session.answerMode,
    livesMode: session.livesMode,
    maxLives: session.maxLives,
    roomRoundConfig: session.roomRoundConfig,
    sourceConfig: {
      mode: session.sourceMode,
      themeMode: session.themeMode,
      difficultyFilter: session.difficultyFilter,
      contentFilters: {
        decades: [...session.contentFilters.decades],
        genres: [...session.contentFilters.genres],
      },
      publicPlaylist: session.publicPlaylistSelection
        ? {
            provider: session.publicPlaylistSelection.provider,
            id: session.publicPlaylistSelection.id,
            name: session.publicPlaylistSelection.name,
            trackCount: session.publicPlaylistSelection.trackCount,
            sourceQuery: session.publicPlaylistSelection.sourceQuery,
            selectedByPlayerId: session.publicPlaylistSelection.selectedByPlayerId,
          }
        : null,
      playersLikedRules: {
        minContributors: session.playersLikedRules.minContributors,
        minTotalTracks: session.playersLikedRules.minTotalTracks,
      },
    },
    poolBuild: {
      status: session.poolBuild.status,
      contributorsCount: session.poolBuild.contributorsCount,
      mergedTracksCount: session.poolBuild.mergedTracksCount,
      playableTracksCount: session.poolBuild.playableTracksCount,
      lastBuiltAtMs: session.poolBuild.lastBuiltAtMs,
      errorCode: session.poolBuild.errorCode,
    },
    totalRounds: session.totalRounds,
    deadlineMs: session.manager.deadlineMs(),
    roundSync,
    guessDoneCount,
    guessTotalCount,
    mediaReadyCount,
    mediaReadyTotalCount,
    revealSkipCount,
    revealSkipTotalCount,
    previewUrl: state === "playing" ? activeTrack?.previewUrl ?? null : revealMedia?.previewUrl ?? null,
    media,
    nextMedia,
    reveal: revealMedia,
    leaderboard,
    chatMessages: session.chatMessages.slice(-80),
    answerSuggestions: collectRoomAnswerSuggestions(suggestionTracks),
  };
}
