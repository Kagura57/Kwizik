export type RoomPhase =
  | "waiting"
  | "countdown"
  | "loading"
  | "playing"
  | "reveal"
  | "leaderboard"
  | "results";

export type RoundMode = "mcq" | "text";

export type RoomSourceMode =
  | "public_playlist"
  | "players_liked"
  | "anilist_union"
  | "random_classic";

export type RoomAnswerMode = "mcq_only" | "text_only" | "mixed";

export type RoomMediaProvider =
  | "spotify"
  | "deezer"
  | "apple-music"
  | "tidal"
  | "youtube"
  | "animethemes";

export type RoundChoice = {
  value: string;
  titleRomaji: string;
  titleEnglish: string | null;
  themeLabel: string;
};
