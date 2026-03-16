import type { MusicTrack } from "./music-types";
import type { RoundChoice } from "../../../../packages/shared/src/room";
import { normalizeAnimeText } from "./AnimeTextNormalization";

type TrackLanguageGroup = "japanese" | "korean" | "french" | "english" | "latin" | "other";
type TrackGenreGroup =
  | "metal"
  | "rock"
  | "pop"
  | "jpop"
  | "kpop"
  | "rap"
  | "electro"
  | "other";
type TrackVocalGroup = "female" | "male" | "mixed" | "unknown";
type TrackChoiceProfile = {
  language: TrackLanguageGroup;
  genre: TrackGenreGroup;
  vocal: TrackVocalGroup;
};

const ENGLISH_TITLE_CUE_WORDS = new Set([
  "adventure",
  "arc",
  "chapter",
  "district",
  "entertainment",
  "final",
  "kingdom",
  "movie",
  "part",
  "root",
  "season",
  "special",
  "story",
]);

const SPINOFF_TITLE_CUE_WORDS = new Set([
  "film",
  "kingdom",
  "moon",
  "movie",
  "ova",
  "princess",
  "prison",
  "snow",
  "special",
  "tower",
]);

const JAPANESE_SCRIPT_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/u;
const KOREAN_SCRIPT_RE = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/u;
const FRENCH_WORD_HINTS = new Set([
  "le", "la", "les", "de", "des", "du", "une", "un", "et", "avec", "pour", "dans", "sur", "pas", "plus",
  "toi", "moi", "amour", "coeur", "vie", "nuit", "jour", "toujours", "jamais", "sans", "mon", "ma", "mes",
  "ton", "ta", "tes", "notre", "votre", "que", "qui", "est",
]);
const ENGLISH_WORD_HINTS = new Set([
  "the", "and", "of", "to", "in", "on", "for", "with", "my", "your", "you", "me", "we", "they", "is", "are",
  "love", "night", "day", "heart", "never", "always", "without", "from", "this", "that",
]);
const GENRE_PATTERNS: Array<{ genre: TrackGenreGroup; regex: RegExp }> = [
  { genre: "metal", regex: /\b(metal|deathcore|metalcore|thrash|black metal|heavy metal)\b/i },
  { genre: "rock", regex: /\b(rock|punk|grunge|alt rock|indie rock|hard rock)\b/i },
  { genre: "kpop", regex: /\b(k-pop|kpop)\b/i },
  { genre: "jpop", regex: /\b(j-pop|jpop|anisong|anime opening|anime op)\b/i },
  { genre: "rap", regex: /\b(rap|hip hop|hip-hop|trap|drill|freestyle)\b/i },
  { genre: "electro", regex: /\b(edm|electro|house|techno|trance|dubstep|drum ?& ?bass|dnb)\b/i },
  { genre: "pop", regex: /\b(pop|radio edit|mainstream)\b/i },
];
const FEMALE_VOCAL_HINTS = [
  "girls",
  "girl",
  "women",
  "woman",
  "sisters",
  "queen",
  "princess",
  "diva",
];
const MALE_VOCAL_HINTS = [
  "boys",
  "boy",
  "men",
  "man",
  "brothers",
  "king",
  "prince",
];
const FEMALE_FIRST_NAMES = new Set([
  "adele",
  "ariana",
  "ava",
  "aya",
  "billie",
  "camila",
  "charli",
  "dua",
  "ellie",
  "halsey",
  "jennie",
  "jisoo",
  "karina",
  "lisa",
  "lorde",
  "momo",
  "olivia",
  "rihanna",
  "rosalia",
  "sabrina",
  "sana",
  "shakira",
  "sia",
  "taylor",
  "yuna",
  "yui",
]);
const MALE_FIRST_NAMES = new Set([
  "bruno",
  "drake",
  "ed",
  "eminem",
  "harry",
  "jay",
  "jimin",
  "jungkook",
  "kendrick",
  "post",
  "suga",
  "taemin",
  "theweeknd",
  "travis",
  "weeknd",
]);

function normalizeAnswer(value: string) {
  return normalizeAnimeText(value);
}

function normalizeMcqIdentity(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]+/gu, "")
    .trim();
}

function mcqChoiceIdentity(track: Pick<MusicTrack, "provider" | "title" | "artist" | "answer">) {
  const canonical =
    track.provider === "animethemes"
      ? (track.answer?.canonical ?? track.answer?.englishTitle ?? track.title)
      : track.title;
  const normalized = normalizeMcqIdentity(canonical);
  return normalized.length > 0 ? normalized : normalizeMcqIdentity(asChoiceLabel(track));
}

function normalizeChoiceText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isAsciiOnly(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code > 0x7f) return false;
  }
  return true;
}

export function asChoiceLabel(track: Pick<MusicTrack, "title" | "artist">) {
  return `${track.title} - ${track.artist}`;
}

function englishAliasScore(alias: string, trackTitle: string) {
  const normalizedAlias = normalizeChoiceText(alias).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const normalizedTrackTitle = normalizeChoiceText(trackTitle)
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalizedAlias || normalizedAlias === normalizedTrackTitle) return Number.NEGATIVE_INFINITY;
  if (JAPANESE_SCRIPT_RE.test(alias) || KOREAN_SCRIPT_RE.test(alias)) return Number.NEGATIVE_INFINITY;

  const tokens = normalizedAlias.split(" ").filter((token) => token.length > 0);
  if (tokens.length <= 0) return Number.NEGATIVE_INFINITY;

  const titleTokens = new Set(normalizedTrackTitle.split(" ").filter((token) => token.length >= 3));
  const englishHits = tokens.filter(
    (token) => ENGLISH_WORD_HINTS.has(token) || ENGLISH_TITLE_CUE_WORDS.has(token),
  ).length;
  const frenchHits = tokens.filter((token) => FRENCH_WORD_HINTS.has(token)).length;
  const sharedTokenHits = tokens.filter((token) => titleTokens.has(token)).length;
  const extraTokenHits = tokens.filter((token) => !titleTokens.has(token)).length;
  const spinoffHits = tokens.filter((token) => SPINOFF_TITLE_CUE_WORDS.has(token)).length;
  const aliasContainsTrackTitle =
    normalizedTrackTitle.length > 0 &&
    (normalizedAlias === normalizedTrackTitle ||
      normalizedAlias.startsWith(`${normalizedTrackTitle} `) ||
      normalizedAlias.includes(` ${normalizedTrackTitle} `));

  let score = 0;
  score += englishHits * 5;
  score -= frenchHits * 5;
  score += sharedTokenHits * 2;
  score -= extraTokenHits;
  if (isAsciiOnly(alias)) score += 2;
  if (tokens.length >= 2) score += 1;
  if (/^[A-Z0-9' -]{2,8}$/.test(alias.trim())) score -= 6;
  if (!isAsciiOnly(alias)) score -= 2;
  if (aliasContainsTrackTitle) score -= spinoffHits * 6;

  return score;
}

function englishAliasForTrack(track: MusicTrack) {
  const aliases = track.answer?.aliases ?? [];
  const normalizedTrackTitle = normalizeAnswer(track.title);
  const hasExactCanonicalAlias = aliases.some((alias) => normalizeAnswer(alias) === normalizedTrackTitle);
  let best: { value: string; score: number } | null = null;

  for (const alias of aliases) {
    const candidate = alias.trim();
    if (candidate.length <= 0) continue;
    const normalizedCandidate = normalizeAnswer(candidate);
    const candidateExtendsCanonicalTitle =
      hasExactCanonicalAlias &&
      normalizedCandidate !== normalizedTrackTitle &&
      (normalizedCandidate.startsWith(`${normalizedTrackTitle} `) ||
        normalizedCandidate.includes(` ${normalizedTrackTitle} `));
    if (candidateExtendsCanonicalTitle) continue;
    const score = englishAliasScore(candidate, track.title);
    if (!Number.isFinite(score) || score < 4) continue;
    if (!best || score > best.score) {
      best = { value: candidate, score };
    }
  }

  return best?.value ?? null;
}

export function englishTitleForTrack(track: MusicTrack) {
  const raw = track.answer?.englishTitle?.trim() ?? "";
  if (raw.length > 0 && normalizeAnswer(raw) !== normalizeAnswer(track.title)) {
    return raw;
  }
  return englishAliasForTrack(track);
}

export function buildRoundChoice(track: MusicTrack): RoundChoice {
  return {
    value: asChoiceLabel(track),
    titleRomaji: track.title,
    titleEnglish: englishTitleForTrack(track),
    themeLabel: track.artist,
  };
}

function firstArtistToken(value: string) {
  const normalized = normalizeChoiceText(value).replace(/[^a-z0-9 ]+/g, " ").trim();
  return normalized.split(/\s+/).find((token) => token.length > 0) ?? "";
}

function detectLanguageGroup(track: Pick<MusicTrack, "title" | "artist">): TrackLanguageGroup {
  const text = `${track.title} ${track.artist}`;
  if (JAPANESE_SCRIPT_RE.test(text)) return "japanese";
  if (KOREAN_SCRIPT_RE.test(text)) return "korean";

  const normalized = normalizeChoiceText(text);
  const tokens = normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  if (tokens.length > 0) {
    let frenchHits = 0;
    let englishHits = 0;
    for (const token of tokens) {
      if (FRENCH_WORD_HINTS.has(token)) frenchHits += 1;
      if (ENGLISH_WORD_HINTS.has(token)) englishHits += 1;
    }
    if (frenchHits >= 2 && frenchHits >= englishHits + 1) return "french";
    if (englishHits >= 2 && englishHits >= frenchHits + 1) return "english";
  }
  if (isAsciiOnly(normalized)) return "latin";
  return "other";
}

function detectGenreGroup(track: Pick<MusicTrack, "title" | "artist">): TrackGenreGroup {
  const normalized = normalizeChoiceText(`${track.title} ${track.artist}`);
  for (const rule of GENRE_PATTERNS) {
    if (rule.regex.test(normalized)) return rule.genre;
  }
  if (JAPANESE_SCRIPT_RE.test(`${track.title} ${track.artist}`)) return "jpop";
  if (KOREAN_SCRIPT_RE.test(`${track.title} ${track.artist}`)) return "kpop";
  return "other";
}

function detectVocalGroup(track: Pick<MusicTrack, "artist">): TrackVocalGroup {
  const artist = normalizeChoiceText(track.artist);
  const hasSplitMarkers = /\b(feat|ft|x|&|and|vs)\b/i.test(artist) || /[,/]/.test(artist);
  if (hasSplitMarkers) return "mixed";
  if (FEMALE_VOCAL_HINTS.some((hint) => artist.includes(hint))) return "female";
  if (MALE_VOCAL_HINTS.some((hint) => artist.includes(hint))) return "male";
  const firstToken = firstArtistToken(track.artist);
  if (FEMALE_FIRST_NAMES.has(firstToken)) return "female";
  if (MALE_FIRST_NAMES.has(firstToken)) return "male";
  return "unknown";
}

function buildChoiceProfile(track: Pick<MusicTrack, "title" | "artist">): TrackChoiceProfile {
  return {
    language: detectLanguageGroup(track),
    genre: detectGenreGroup(track),
    vocal: detectVocalGroup(track),
  };
}

function choiceCoherenceScore(
  source: TrackChoiceProfile,
  candidate: TrackChoiceProfile,
  sourceTrack: Pick<MusicTrack, "artist">,
  candidateTrack: Pick<MusicTrack, "artist">,
) {
  let score = 0;
  if (source.language === candidate.language) score += 80;
  if (source.genre === candidate.genre) score += 45;
  if (source.vocal !== "unknown" && source.vocal === candidate.vocal) score += 25;

  const sameArtist =
    normalizeChoiceText(sourceTrack.artist).trim() === normalizeChoiceText(candidateTrack.artist).trim();
  if (sameArtist) score -= 20;

  if (source.language === "french" && candidate.language === "english") score -= 55;
  if (source.language === "english" && candidate.language === "french") score -= 35;
  if (source.language === "french" && candidate.language !== "french") score -= 30;
  if (source.language === "english" && candidate.language !== "english" && candidate.language !== "latin") {
    score -= 25;
  }
  if (source.language === "japanese" && candidate.language !== "japanese") score -= 40;
  if (source.language === "korean" && candidate.language !== "korean") score -= 35;
  if (source.genre !== "other" && candidate.genre !== source.genre) score -= 15;

  return score;
}

function minChoiceCoherenceScore(language: TrackLanguageGroup) {
  if (language === "japanese" || language === "korean" || language === "french") return 35;
  return 15;
}

type BuildRoundChoicesInput = {
  round: number;
  trackPool: MusicTrack[];
  distractorTrackPool: MusicTrack[];
  roundChoices: Map<number, RoundChoice[]>;
  randomShuffle: <T>(values: T[]) => T[];
  requiredChoices: number;
};

export function buildRoundChoices(input: BuildRoundChoicesInput) {
  const { round, trackPool, distractorTrackPool, roundChoices, randomShuffle, requiredChoices } = input;
  const existing = roundChoices.get(round);
  if (existing) return existing;

  const track = trackPool[round - 1];
  if (!track) return [];

  const correct = buildRoundChoice(track);
  const correctIdentity = mcqChoiceIdentity(track);
  const sourceProfile = buildChoiceProfile(track);
  const previouslyCorrectChoiceIdentities = new Set(
    trackPool.slice(0, Math.max(0, round - 1)).map((previousTrack) => mcqChoiceIdentity(previousTrack)),
  );
  const canReuseFutureRoundTracksAsDistractors = track.provider !== "animethemes";
  const futureRoundTracks = canReuseFutureRoundTracksAsDistractors ? trackPool.slice(round) : [];
  const distractorCandidates = [...futureRoundTracks, ...distractorTrackPool]
    .filter((candidate) => {
      const candidateIdentity = mcqChoiceIdentity(candidate);
      return (
        candidateIdentity !== correctIdentity &&
        asChoiceLabel(candidate) !== correct.value &&
        !previouslyCorrectChoiceIdentities.has(candidateIdentity)
      );
    })
    .map((candidate) => ({
      choice: buildRoundChoice(candidate),
      track: candidate,
      identity: mcqChoiceIdentity(candidate),
      profile: buildChoiceProfile(candidate),
    }));
  const rankedDistractors = randomShuffle(distractorCandidates).map((entry) => ({
    ...entry,
    score: choiceCoherenceScore(sourceProfile, entry.profile, track, entry.track),
  }));
  const minimumScore = minChoiceCoherenceScore(sourceProfile.language);

  const uniqueOptions: RoundChoice[] = [correct];
  const seenValues = new Set([correct.value]);
  const seenIdentities = new Set([correctIdentity]);
  const weightedPool = rankedDistractors.filter((entry) => entry.score >= minimumScore);
  const pullWeightedCandidate = (
    pool: Array<(typeof weightedPool)[number]>,
    fallbackPool?: Array<(typeof weightedPool)[number]>,
  ) => {
    const weights = pool.map((entry) => Math.max(1, entry.score - minimumScore + 1));
    const totalWeight = weights.reduce((sum, current) => sum + current, 0);
    const ticket = Math.random() * totalWeight;
    let cumulative = 0;
    let selectedIndex = pool.length - 1;
    for (let index = 0; index < pool.length; index += 1) {
      cumulative += weights[index] ?? 0;
      if (ticket <= cumulative) {
        selectedIndex = index;
        break;
      }
    }
    const selected = pool.splice(selectedIndex, 1)[0];
    if (selected && fallbackPool) {
      const fallbackIndex = fallbackPool.findIndex((entry) => entry.identity === selected.identity);
      if (fallbackIndex >= 0) {
        fallbackPool.splice(fallbackIndex, 1);
      }
    }
    return selected;
  };
  const dominantScriptFamily = (candidate: Pick<MusicTrack, "title" | "artist">) => {
    const text = `${candidate.title} ${candidate.artist}`;
    if (JAPANESE_SCRIPT_RE.test(text)) return "japanese" as const;
    if (KOREAN_SCRIPT_RE.test(text)) return "korean" as const;
    return "latin" as const;
  };
  const sourceScriptFamily = dominantScriptFamily(track);
  const sameLanguagePool = rankedDistractors.filter((entry) => {
    if (sourceProfile.language === "french") {
      return entry.profile.language === "french";
    }
    return dominantScriptFamily(entry.track) === sourceScriptFamily;
  });
  while (sameLanguagePool.length > 0 && uniqueOptions.length < requiredChoices) {
    const selected = pullWeightedCandidate(sameLanguagePool, weightedPool);
    if (!selected || seenValues.has(selected.choice.value) || seenIdentities.has(selected.identity)) {
      continue;
    }
    uniqueOptions.push(selected.choice);
    seenValues.add(selected.choice.value);
    seenIdentities.add(selected.identity);
  }
  while (weightedPool.length > 0 && uniqueOptions.length < requiredChoices) {
    const selected = pullWeightedCandidate(weightedPool);
    if (!selected || seenValues.has(selected.choice.value) || seenIdentities.has(selected.identity)) {
      continue;
    }
    uniqueOptions.push(selected.choice);
    seenValues.add(selected.choice.value);
    seenIdentities.add(selected.identity);
  }

  if (uniqueOptions.length < requiredChoices) {
    for (const distractor of rankedDistractors.sort((left, right) => right.score - left.score)) {
      if (seenValues.has(distractor.choice.value) || seenIdentities.has(distractor.identity)) {
        continue;
      }
      uniqueOptions.push(distractor.choice);
      seenValues.add(distractor.choice.value);
      seenIdentities.add(distractor.identity);
      if (uniqueOptions.length >= requiredChoices) break;
    }
  }

  const options = randomShuffle(uniqueOptions);
  roundChoices.set(round, options);
  return options;
}
