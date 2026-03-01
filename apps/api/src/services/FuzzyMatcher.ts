import { normalizeAnimeText } from "./AnimeTextNormalization";

const TRAILING_SEASON_PATTERNS = [
  /\b(?:the\s+)?final\s+season$/i,
  /\b(?:season|saison|part|partie|cour)\s*(?:\d+|[ivx]+|final)$/i,
  /\b(?:\d+)(?:st|nd|rd|th)\s+(?:season|saison|part|partie)$/i,
  /\b(?:s(?:eason)?\s*\d+)$/i,
  /\b(?:pt|part)\s*\d+$/i,
];

function acronym(value: string) {
  const expanded = value.replace(/\b([a-z]{3,})metal\b/gi, "$1 metal");
  const normalized = normalizeAnimeText(expanded);
  if (normalized.length <= 0) return "";
  const letters = normalized
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => part[0])
    .filter((char): char is string => typeof char === "string" && char.length > 0);
  return letters.join("");
}

function stripTrailingSeasonSuffix(value: string) {
  let current = value.trim();
  if (current.length <= 0) return current;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    let next = current;
    for (const pattern of TRAILING_SEASON_PATTERNS) {
      next = next.replace(pattern, "").trim();
    }
    next = next.replace(/(?:-|:)\s*$/g, "").trim();
    if (next === current || next.length <= 0) break;
    current = next;
  }

  return current;
}

function titleCore(value: string) {
  const trimmed = value.trim();
  if (trimmed.length <= 0) return "";
  const first = trimmed.split(/\s[-–—|]\s|:/g)[0] ?? trimmed;
  return first.trim();
}

function comparableForms(value: string) {
  const forms = new Set<string>();
  const push = (candidate: string) => {
    const normalized = normalizeAnimeText(candidate);
    if (normalized.length >= 2) {
      forms.add(normalized);
    }
  };

  push(value);
  push(titleCore(value));
  for (const entry of [...forms]) {
    push(stripTrailingSeasonSuffix(entry));
  }

  return [...forms];
}

function isSafeFranchisePrefix(shorter: string, longer: string) {
  if (shorter === longer) return true;
  if (!longer.startsWith(shorter)) return false;

  const tokens = shorter.split(" ").filter((token) => token.length > 0);
  if (tokens.length >= 2) {
    return shorter.length >= 4;
  }

  return shorter.length >= 5;
}

function toBigrams(value: string) {
  if (value.length < 2) return [value];
  const padded = ` ${value} `;
  const grams: string[] = [];
  for (let index = 0; index < padded.length - 1; index += 1) {
    grams.push(padded.slice(index, index + 2));
  }
  return grams;
}

function diceCoefficient(a: string, b: string) {
  const aBigrams = toBigrams(a);
  const bBigrams = toBigrams(b);
  const counts = new Map<string, number>();

  for (const gram of aBigrams) {
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }

  let intersection = 0;
  for (const gram of bBigrams) {
    const count = counts.get(gram) ?? 0;
    if (count > 0) {
      intersection += 1;
      counts.set(gram, count - 1);
    }
  }

  return (2 * intersection) / (aBigrams.length + bBigrams.length);
}

export function isTextAnswerCorrect(input: string, expected: string) {
  const answerForms = comparableForms(input);
  const truthForms = comparableForms(expected);
  if (answerForms.length <= 0 || truthForms.length <= 0) return false;

  for (const answer of answerForms) {
    for (const truth of truthForms) {
      if (answer === truth) return true;

      const answerAcronym = acronym(answer);
      const truthAcronym = acronym(truth);
      if (answer === truthAcronym || truth === answerAcronym) return true;
      if (answerAcronym.length >= 2 && answerAcronym === truthAcronym) return true;

      if (isSafeFranchisePrefix(answer, truth) || isSafeFranchisePrefix(truth, answer)) {
        return true;
      }
    }
  }

  let bestScore = 0;
  for (const answer of answerForms) {
    for (const truth of truthForms) {
      bestScore = Math.max(bestScore, diceCoefficient(answer, truth));
      if (bestScore >= 0.82) return true;
    }
  }

  return false;
}
