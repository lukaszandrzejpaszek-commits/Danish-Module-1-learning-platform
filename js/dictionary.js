function normalizeSearch(value) {
  return value.trim().normalize("NFC").toLocaleLowerCase("da-DK");
}

export function findDictionaryMatches(words, query) {
  const term = normalizeSearch(query);
  if (!term) return [];
  return words.filter((word) =>
    normalizeSearch(word.danish).includes(term) || normalizeSearch(word.english).includes(term));
}
