export function normalizeAnswer(value) {
  return String(value || "")
    .normalize("NFC")
    .toLocaleLowerCase("da-DK")
    .trim()
    .replace(/[.,!?;:]+$/u, "")
    .replace(/\s+/gu, " ");
}

export function levenshteinDistance(left, right) {
  const a = Array.from(normalizeAnswer(left));
  const b = Array.from(normalizeAnswer(right));
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= b.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[b.length];
}

export function isTypingCorrect(answer, expected) {
  const normalizedAnswer = normalizeAnswer(answer);
  const normalizedExpected = normalizeAnswer(expected);
  if (!normalizedAnswer || !normalizedExpected) return false;
  const allowedDistance = normalizedExpected.length >= 5 ? 1 : 0;
  return levenshteinDistance(normalizedAnswer, normalizedExpected) <= allowedDistance;
}

export function isSpokenAnswerCorrect(answer, expected) {
  const normalizedAnswer = normalizeAnswer(answer);
  if (!normalizedAnswer) return false;
  const withParentheses = String(expected || "").replace(/[()]/g, "");
  let withoutParentheses = String(expected || "");
  while (/\([^()]*\)/.test(withoutParentheses)) {
    withoutParentheses = withoutParentheses.replace(/\([^()]*\)/g, "");
  }
  return [expected, withParentheses, withoutParentheses]
    .some((value) => normalizedAnswer === normalizeAnswer(value));
}

export function makeOptions(correctWord, words, direction = "danish", count = 3, fallbackWords = null) {
  const property = direction === "english" ? "english" : "danish";
  if (fallbackWords) {
    if (count <= 1) return [correctWord[property]];
    const seen = new Set([normalizeAnswer(correctWord[property])]);
    const choices = [];
    for (const pool of [words, fallbackWords]) {
      for (const word of shuffle(pool)) {
        const value = word[property];
        const normalized = normalizeAnswer(value);
        if (word.id === correctWord.id || !normalized || seen.has(normalized)) continue;
        choices.push(value);
        seen.add(normalized);
        if (choices.length === count - 1) return shuffle([...choices, correctWord[property]]);
      }
    }
    return shuffle([...choices, correctWord[property]]);
  }
  const choices = words
    .filter((word) => word.id !== correctWord.id)
    .sort(() => Math.random() - 0.5)
    .slice(0, count - 1)
    .map((word) => word[property]);
  return [...choices, correctWord[property]].sort(() => Math.random() - 0.5);
}

export function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}
