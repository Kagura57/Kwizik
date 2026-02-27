function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function acronym(value: string) {
  const normalized = normalize(value);
  if (normalized.length <= 0) return "";
  const letters = normalized
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => part[0])
    .filter((char): char is string => typeof char === "string" && char.length > 0);
  return letters.join("");
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
  const answer = normalize(input);
  const truth = normalize(expected);
  if (answer.length < 2 || truth.length < 2) return false;

  if (answer === truth) return true;
  const answerAcronym = acronym(answer);
  const truthAcronym = acronym(truth);
  if (answer === truthAcronym || truth === answerAcronym) return true;
  if (answerAcronym.length >= 2 && answerAcronym === truthAcronym) return true;
  if (truth.includes(answer) || answer.includes(truth)) return true;

  return diceCoefficient(answer, truth) >= 0.82;
}
