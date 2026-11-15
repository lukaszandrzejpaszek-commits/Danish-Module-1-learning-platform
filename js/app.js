import { CATEGORIES, CATEGORY_ICONS, MODES, SETTINGS_DEFAULTS, MASTERED_AT, TOPIC_WORDS, sectionForWord, wordInSection } from "./config.js";
import {
  clearProgress,
  createBackup,
  getAll,
  getSettings,
  openDatabase,
  putValue,
  recordAttempt,
  restoreBackup,
  saveProfile,
  saveSession,
  saveSettings,
  saveVocabulary,
  validateBackup
} from "./storage.js";
import { isSpokenAnswerCorrect, isTypingCorrect, makeOptions, shuffle } from "./game.js";
import { findDictionaryMatches } from "./dictionary.js";
import { cancelSpeech, setSpeechMode, setSpeechPitch, setSpeechRate, speakDanish, speakEnglish } from "./speech.js";
import { setInterfaceLanguage as applyInterfaceLanguage, setUiAttribute, setUiText, translateUiText } from "./i18n.js";

const state = {
  words: [],
  progress: new Map(),
  attempts: [],
  profile: null,
  settings: { ...SETTINGS_DEFAULTS },
  session: null,
  category: "",
  searchMatches: []
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const main = $("#main-content");
let currentView = "home";
let activeRecognition = null;
let recognitionTimeout = null;

function cancelRecognition() {
  window.clearTimeout(recognitionTimeout);
  recognitionTimeout = null;
  if (!activeRecognition) return;
  const recognition = activeRecognition;
  activeRecognition = null;
  recognition.abort();
}

function showNotice(message, type = "info") {
  let notice = $("#app-notice");
  if (!notice) {
    notice = document.createElement("div");
    notice.id = "app-notice";
    notice.className = "app-notice";
    notice.setAttribute("role", "status");
    main.before(notice);
  }
  notice.className = `app-notice ${type}`;
  setUiText(notice, message);
  notice.hidden = false;
  window.clearTimeout(showNotice.timeout);
  showNotice.timeout = window.setTimeout(() => {
    notice.hidden = true;
  }, 6500);
}

function handleSpeechStatus(key, values = {}) {
  const messages = {
    voicePreparing: "Preparing the Danish Piper voice...",
    voiceDownloading: `Downloading Piper voice: ${values.percent}% (${values.downloaded} / ${values.total} MB).`,
    voiceCached: "Using the Piper voice saved in this browser.",
    voiceGenerating: "Generating Danish speech...",
    voicePlaying: "Playing Danish Piper speech.",
    voiceCacheFailed: "Piper voice downloaded, but could not be cached. It may need to download again.",
    voiceCacheUnavailable: "Browser caching is unavailable; Piper may need to download the voice again.",
    voiceFallback: "Piper is unavailable; using the browser voice instead.",
    voiceUnavailable: "Neither Piper nor browser speech could play audio."
  };
  if (messages[key]) showNotice(messages[key], key === "voiceUnavailable" ? "error" : "info");
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) setUiText(element, text);
  return element;
}

function makeContentElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.dataset.noTranslate = "true";
  element.textContent = String(text ?? "");
  return element;
}

function categoryName(category) {
  return CATEGORIES[category] || category.replaceAll("_", " ");
}

function wordsInSection(category) {
  return state.words.filter((word) => wordInSection(word, category));
}

function attemptsInSection(category) {
  if (category !== "substantiver" && !Object.prototype.hasOwnProperty.call(TOPIC_WORDS, category)) {
    return state.attempts.filter((attempt) => attempt.category === category);
  }
  const wordsById = new Map(state.words.map((word) => [word.id, word]));
  return state.attempts.filter((attempt) => {
    const word = wordsById.get(attempt.wordId);
    return word ? sectionForWord(word) === category : category === "substantiver" && attempt.category === category;
  });
}

function isMastered(progress) {
  return Boolean(progress && progress.attempts >= 3 && progress.correct >= 3 && progress.mastery >= MASTERED_AT);
}

function addToolbar() {
  const header = $(".header-content");
  const actions = $(".header-actions");
  const search = document.createElement("input");
  search.id = "global-search";
  search.className = "global-search";
  search.type = "search";
  setUiAttribute(search, "placeholder", "Search vocabulary");
  setUiAttribute(search, "aria-label", "Search vocabulary");

  header.insertBefore(search, actions);
  const results = makeElement("div", "search-results");
  results.id = "search-results";
  results.hidden = true;
  header.append(results);

  search.addEventListener("input", () => renderSearch(search.value));

  const starButton = makeElement("button", "icon-btn favorites-button", "★");
  starButton.type = "button";
  setUiAttribute(starButton, "aria-label", "Favorites");
  setUiAttribute(starButton, "title", "Favorites");
  actions.prepend(starButton);
  starButton.addEventListener("click", () => startSession({ filter: "favorites", mode: "mixed" }));
}

function showView(name) {
  if (name !== "practice-session") {
    cancelRecognition();
    if (state.session) window.clearInterval(state.session.answerTimer);
  }
  currentView = name;
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${name}`));
  $$(".nav-btn").forEach((button) => button.classList.toggle("active", button.dataset.view === name));
  if (name === "progress") renderProgress();
  if (name === "weak-areas") renderWeakAreas();
  if (name === "lessons") renderLessons();
  if (name === "dictionary") renderDictionary();
  if (name === "exam-prep") renderExamPrep();
  if (name === "home") refreshDashboard();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function changeInterfaceLanguage(language) {
  const previous = state.settings.uiLanguage || "en";
  state.settings.uiLanguage = language === "da" ? "da" : "en";
  try {
    applyInterfaceLanguage(state.settings.uiLanguage);
    await saveSettings(state.settings);
    showView(currentView);
    showNotice(state.settings.uiLanguage === "da" ? "Interface language set to Danish." : "Interface language set to English.", "success");
  } catch (error) {
    state.settings.uiLanguage = previous;
    applyInterfaceLanguage(previous);
    showView(currentView);
    showNotice(`Language preference could not be saved: ${error.message}`, "error");
  }
}

async function reloadData() {
  const [words, progress, attempts] = await Promise.all([
    getAll("words"),
    getAll("progress"),
    getAll("attempts")
  ]);
  state.words = words;
  state.progress = new Map(progress.map((item) => [item.wordId, item]));
  state.attempts = attempts;
  if (currentView === "dictionary") renderDictionary();
}

async function loadInitialVocabulary() {
  try {
    const existingWords = await getAll("words");
    const numbersResponse = await fetch("./data/numbers.json", { cache: "no-cache" });
    if (!numbersResponse.ok) throw new Error(`Numbers request returned ${numbersResponse.status}.`);
    const numbersData = await numbersResponse.json();
    const numberWords = numbersData.categories.numbers.map((word) => ({
      ...word,
      source: numbersData.source
    }));

    if (existingWords.length) {
      const existingIds = new Set(existingWords.map((word) => word.id));
      const additions = numberWords.filter((word) => !existingIds.has(word.id));
      if (additions.length) {
        const count = await saveVocabulary({ categories: { numbers: additions } });
        showNotice(`${count} Danish number words (0–100) added to your vocabulary.`, "success");
      }
      return;
    }

    const response = await fetch("./data/vocabulary.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`Vocabulary request returned ${response.status}.`);
    const data = await response.json();
    data.categories.numbers = numberWords;
    const count = await saveVocabulary(data);
    showNotice(`${count} vocabulary words, including Danish numbers 0–100, are ready to study.`, "success");
  } catch (error) {
    showNotice(`Vocabulary could not be loaded: ${error.message} Use Import words to load a JSON or CSV vocabulary file.`, "error");
  }
}

async function importVocabularyFile(event) {
  const [file] = event.target.files || [];
  if (!file) return;
  try {
    let data;
    if (file.name.toLowerCase().endsWith(".csv")) {
      data = csvToWords(await file.text());
    } else {
      data = JSON.parse(await file.text());
    }
    if (data?.schemaVersion && (data.vocabulary || data.stores)) {
      throw new Error("Use Restore backup in Profile to restore a backup file.");
    }
    const count = await saveVocabulary(data);
    await reloadData();
    refreshDashboard();
    renderLessons();
    updateProfile();
    closeModal($("#settings-modal"));
    showNotice(`Imported ${count} vocabulary ${count === 1 ? "entry" : "entries"}.`, "success");
  } catch (error) {
    closeModal($("#settings-modal"));
    showNotice(`Import failed: ${translateUiText(error.message)}`, "error");
  } finally {
    event.target.value = "";
  }
}

function csvToWords(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field.trim());
    rows.push(row);
  }
  if (!rows.length) throw new Error("The CSV file is empty.");
  const headings = rows.shift().map((heading) => heading.toLowerCase().trim());
  const column = (...names) => headings.findIndex((heading) => names.includes(heading));
  const danishColumn = column("danish", "dk", "word");
  const englishColumn = column("english", "en", "translation");
  if (danishColumn < 0 || englishColumn < 0) {
    throw new Error("CSV needs Danish and English columns; category and gender are optional.");
  }
  return rows.map((values, index) => ({
    id: `csv-${index + 1}`,
    danish: values[danishColumn],
    english: values[englishColumn],
    category: values[column("category", "section")] || "andre_udtryk",
    gender: values[column("gender")] || null
  }));
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove("hidden");
    modal.setAttribute("aria-modal", "true");
  }
}

function closeModal(modal) {
  modal.classList.add("hidden");
  modal.removeAttribute("aria-modal");
}

function bindNavigation() {
  $$(".nav-btn").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });
  $("#language-dk").addEventListener("click", () => changeInterfaceLanguage("da"));
  $("#language-en").addEventListener("click", () => changeInterfaceLanguage("en"));
  $("#dictionary-search").addEventListener("input", renderDictionary);
  $$(".lesson-mode-button").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".lesson-mode-button").forEach((option) => option.setAttribute("aria-pressed", String(option === button)));
    });
  });
  $("#settings-btn").addEventListener("click", () => openModal("settings-modal"));
  $("#profile-btn").addEventListener("click", () => {
    updateProfile();
    openModal("profile-modal");
  });
  $$(".close-btn").forEach((button) => button.addEventListener("click", () => closeModal(button.closest(".modal"))));
  $$(".modal").forEach((modal) => modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal(modal);
  }));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") $$(".modal:not(.hidden)").forEach(closeModal);
  });

  $("#save-settings").addEventListener("click", saveSettingsFromForm);
  $("#reset-settings").addEventListener("click", async () => {
    state.settings = { ...SETTINGS_DEFAULTS };
    await saveSettings(state.settings);
    applySettings();
    showNotice("Settings restored to defaults.", "success");
  });
  $("#edit-profile").addEventListener("click", editProfileName);
  $("#export-data").addEventListener("click", exportBackup);
  $("#restore-backup").addEventListener("click", () => $("#backup-file").click());
  $("#backup-file").addEventListener("change", restoreBackupFile);
  $("#import-words").addEventListener("click", () => $("#vocabulary-file").click());
  $("#vocabulary-file").addEventListener("change", importVocabularyFile);
  $("#reset-progress").addEventListener("click", resetLearningProgress);
  $("#practice-weak-areas").addEventListener("click", () => startSession({ filter: "failed", mode: "mixed" }));
  $("#exit-session").addEventListener("click", finishSession);

  $("#daily-challenge .btn").addEventListener("click", () => startSession({ filter: "all", mode: "mixed" }));
  $("#continue-lesson .btn").addEventListener("click", () => startSession({ filter: "new", mode: "multipleChoice" }));
  $("#spaced-repetition .btn").addEventListener("click", () => startSession({ filter: "due", mode: "flashcards" }));
  $("#weak-areas-quick .btn").addEventListener("click", () => showView("weak-areas"));
  $("#resource-tips").addEventListener("click", () => showNotice("Short, regular reviews help you remember more. Listen first, then test yourself without looking.", "info"));

  const speed = $("#tts-speed");
  speed.addEventListener("input", () => setSpeechRate(Number(speed.value)));
  $("#tts-pitch").addEventListener("input", (event) => setSpeechPitch(Number(event.target.value)));
  $("#dark-mode").addEventListener("change", () => {
    state.settings.theme = $("#dark-mode").checked ? "dark" : "light";
    applySettings();
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".header-content")) $("#search-results").hidden = true;
  });
}

function renderPracticeModes() {
  const grid = $(".practice-modes-grid");
  const definitions = [
    ["listening-mode", "👂 Listening", "Hear a Danish word and choose its meaning", "listening"],
    ["flashcard-mode", "🎴 Flashcards", "Reveal the translation and rate recall", "flashcards"],
    ["multiple-choice-mode", "❓ Multiple choice", "Choose the Danish word for an English prompt", "multipleChoice"],
    ["typing-mode", "⌨️ Typing", "Type the Danish translation", "typing"],
    ["sentence-mode", "↔️ Danish to English", "Choose the English meaning", "translation"],
    ["speed-mode", "⚡ Speed round", "Answer as many as you can in 60 seconds", "speed"]
  ];
  definitions.forEach(([id, title, description, mode]) => {
    const card = document.getElementById(id);
    if (!card) return;
    setUiText(card.querySelector("h3"), title);
    setUiText(card.querySelector("p"), description);
    setUiText(card.querySelector(".btn"), "Start");
    card.querySelector(".btn").addEventListener("click", () => startSession({
      mode,
      filter: $("#practice-filter")?.value || "all",
      category: $("#practice-category")?.value || ""
    }));
  });
  const extras = [
    ["spelling-mode", "✍️ Spelling trainer", "Listen and type exactly what you hear", "spelling"],
    ["mixed-mode", "🎲 Mixed challenge", "Switch between exercise types", "mixed"],
    ["speaking-mode", "🎤 Speaking", "Say the Danish word and check what was heard", "speaking"]
  ];
  extras.forEach(([id, title, description, mode]) => {
    let card = document.getElementById(id);
    if (!card) {
      card = makeElement("article", "practice-mode-card");
      card.id = id;
      card.append(makeElement("h3"), makeElement("p"));
      const button = makeElement("button", "btn btn-primary", "Start");
      button.type = "button";
      card.append(button);
      grid.append(card);
    }
    setUiText(card.querySelector("h3"), title);
    setUiText(card.querySelector("p"), description);
    card.querySelector(".btn").addEventListener("click", () => startSession({
      mode,
      filter: $("#practice-filter")?.value || "all",
      category: $("#practice-category")?.value || ""
    }));
  });
  let controls = $("#training-controls");
  if (!controls) {
    controls = makeElement("div", "training-controls");
    controls.id = "training-controls";
    const filter = document.createElement("select");
    filter.id = "practice-filter";
    setUiAttribute(filter, "aria-label", "Choose vocabulary to practice");
    [
      ["all", "All words"],
      ["new", "New words"],
      ["failed", "Missed words"],
      ["difficult", "Difficult words"],
      ["due", "Due for review"],
      ["favorites", "Favorites"]
    ].forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      setUiText(option, label);
      filter.append(option);
    });
    const category = document.createElement("select");
    category.id = "practice-category";
    setUiAttribute(category, "aria-label", "Limit practice to a section");
    const all = document.createElement("option");
    all.value = "";
    setUiText(all, "All sections");
    category.append(all);
    Object.entries(CATEGORIES).forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      setUiText(option, label);
      category.append(option);
    });
    controls.append(filter, category);
    grid.before(controls);
  }
}

function renderDashboardExtras() {
  const stats = $(".quick-stats");
  [
    ["Words mastered", "mastered-words"],
    ["Weekly streak", "weekly-streak"],
    ["Difficult words", "difficult-words"]
  ].forEach(([label, id]) => {
    if ($(`#${id}`)) return;
    const card = makeElement("div", "stat-card");
    card.append(makeElement("div", "stat-value", "0"), makeElement("div", "stat-label", label));
    card.querySelector(".stat-value").id = id;
    stats.append(card);
  });
}

function applySettings() {
  document.body.dataset.theme = state.settings.theme || "light";
  applyInterfaceLanguage(state.settings.uiLanguage || "en");
  $("#dark-mode").checked = state.settings.theme === "dark";
  $("#tts-engine").value = state.settings.speechEngine === "browser" ? "browser" : "piper";
  $("#tts-speed").value = String(state.settings.speechRate || 1);
  $("#tts-pitch").value = String(state.settings.speechPitch || 1);
  $("#daily-goal").value = String(state.settings.dailyGoal || SETTINGS_DEFAULTS.dailyGoal);
  const delay = state.settings.answerDelay;
  if (!Number.isInteger(delay) || delay < 1 || delay > 30) {
    console.warn("Invalid saved answer delay; using the default.");
    state.settings.answerDelay = SETTINGS_DEFAULTS.answerDelay;
  }
  $("#answer-delay").value = String(state.settings.answerDelay);
  setSpeechMode(state.settings.speechEngine);
  setSpeechRate(state.settings.speechRate || 1);
  setSpeechPitch(state.settings.speechPitch || 1);
  document.documentElement.style.setProperty("--daily-goal", String(state.settings.dailyGoal || SETTINGS_DEFAULTS.dailyGoal));
}

async function saveSettingsFromForm() {
  const delayInput = $("#answer-delay");
  if (!delayInput.value || !delayInput.checkValidity()) {
    showNotice("Enter a whole number from 1 to 30 for the answer countdown.", "error");
    return;
  }
  state.settings = {
    ...state.settings,
    theme: $("#dark-mode").checked ? "dark" : "light",
    speechEngine: $("#tts-engine").value === "browser" ? "browser" : "piper",
    speechRate: Number($("#tts-speed").value),
    speechPitch: Number($("#tts-pitch").value),
    dailyGoal: Math.min(200, Math.max(5, Number($("#daily-goal").value) || SETTINGS_DEFAULTS.dailyGoal)),
    answerDelay: Number(delayInput.value)
  };
  await saveSettings(state.settings);
  applySettings();
  closeModal($("#settings-modal"));
  showNotice("Settings saved.", "success");
}

async function editProfileName() {
  const name = window.prompt("What should we call you?", state.profile?.name || "Learner");
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) {
    showNotice("Please enter a name before saving.", "error");
    return;
  }
  state.profile = { ...state.profile, id: "current", name: trimmed };
  await saveProfile(state.profile);
  updateProfile();
}

async function resetLearningProgress() {
  if (!window.confirm("Reset all study attempts, streaks, and session history? Your vocabulary and settings will be kept.")) return;
  await clearProgress();
  await reloadData();
  updateProfile();
  refreshDashboard();
  closeModal($("#profile-modal"));
  showNotice("Learning progress was reset.", "success");
}

async function exportBackup() {
  try {
    const payload = await createBackup();
    downloadFile("danish-trainer-backup.json", JSON.stringify(payload, null, 2), "application/json");
  } catch (error) {
    closeModal($("#profile-modal"));
    showNotice(`Backup export failed: ${error.message}`, "error");
  }
}

async function restoreBackupFile(event) {
  const [file] = event.target.files || [];
  if (!file) return;
  try {
    const backup = validateBackup(JSON.parse(await file.text()));
    if (state.session) throw new Error("Finish the current practice session before restoring a backup.");
    const confirmation = backup.legacy
      ? "Replace your current profile, words and progress with this backup? Older backups do not contain sessions or settings. Session history will be cleared and current settings kept."
      : "Replace your current profile, words, progress, history and settings with this backup?";
    if (!window.confirm(translateUiText(confirmation))) return;
    await restoreBackup(backup.stores);
    await reloadData();
    [state.profile] = await getAll("profile");
    state.sessions = await getAll("sessions");
    state.settings = { ...SETTINGS_DEFAULTS, ...(await getSettings()) };
    applySettings();
    $("#global-search").value = "";
    $("#search-results").hidden = true;
    refreshDashboard();
    renderLessons();
    renderExamPrep();
    updateProfile();
    closeModal($("#profile-modal"));
    showView("home");
    showNotice(backup.legacy
      ? "Backup restored. Older backups do not include session history or settings."
      : "Backup restored successfully.", "success");
  } catch (error) {
    closeModal($("#profile-modal"));
    showNotice(`Backup restore failed: ${translateUiText(error.message)}`, "error");
  } finally {
    event.target.value = "";
  }
}

function downloadFile(filename, content, mimeType) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type: mimeType }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function renderSearch(query) {
  const results = $("#search-results");
  results.replaceChildren();
  const term = query.trim().toLocaleLowerCase("da-DK");
  if (!term) {
    results.hidden = true;
    return;
  }
  const matches = state.words
    .filter((word) => `${word.danish} ${word.english} ${word.category} ${categoryName(sectionForWord(word))} ${word.exampleDanish || ""}`.toLocaleLowerCase("da-DK").includes(term))
    .slice(0, 12);
  if (!matches.length) {
    results.append(makeElement("p", "empty-state", "No matching words."));
  } else {
    matches.forEach((word) => {
      const progress = state.progress.get(word.id);
      const row = makeElement("div", "search-result");
      const details = makeElement("div");
      details.append(
        makeContentElement("strong", "", word.danish),
        makeContentElement("span", "", word.english),
        makeElement("small", "", `${categoryName(sectionForWord(word))} · ${progress?.mastery || 0}% mastered`)
      );
      if (word.exampleDanish) details.append(makeContentElement("small", "search-example", word.exampleDanish));
      const favorite = makeElement("button", "favorite-toggle", progress?.favorite ? "★" : "☆");
      favorite.type = "button";
      setUiAttribute(favorite, "aria-label", progress?.favorite ? "Remove favorite" : "Add favorite");
      favorite.addEventListener("click", async () => {
        await toggleFavorite(word);
        renderSearch(query);
      });
      row.append(details, favorite);
      results.append(row);
    });
  }
  results.hidden = false;
}

function renderDictionary() {
  const query = $("#dictionary-search").value;
  const results = $("#dictionary-results");
  results.replaceChildren();
  if (!query.trim()) {
    setUiText($("#dictionary-status"), "Enter a Danish or English word to search.");
    return;
  }
  const matches = findDictionaryMatches(state.words, query);
  setUiText($("#dictionary-status"), matches.length
    ? `${matches.length} dictionary ${matches.length === 1 ? "result" : "results"}.`
    : "No matching words.");
  const fragment = document.createDocumentFragment();
  matches.forEach((word) => {
    const row = makeElement("article", "dictionary-entry");
    const audioButton = (label, language, speak) => {
      const button = makeElement("button", "icon-btn dictionary-play", "▶");
      button.type = "button";
      setUiAttribute(button, "aria-label", label);
      setUiAttribute(button, "title", label);
      button.append($(`#language-${language} svg`).cloneNode(true));
      button.addEventListener("click", () => speak().catch((error) => showNotice(translateUiText(error.message), "error")));
      return button;
    };
    const separator = makeElement("span", "dictionary-separator", "—");
    separator.setAttribute("aria-hidden", "true");
    row.append(
      audioButton(`Hear Danish: ${word.danish}`, "dk", () => speakDanish(word.danish, false, handleSpeechStatus)),
      makeContentElement("strong", "dictionary-term", word.danish),
      separator,
      makeContentElement("span", "dictionary-term", word.english),
      audioButton(`Hear English: ${word.english}`, "en", () => speakEnglish(word.english))
    );
    fragment.append(row);
  });
  results.append(fragment);
}

async function toggleFavorite(word) {
  const current = state.progress.get(word.id) || {
    wordId: word.id,
    attempts: 0,
    correct: 0,
    wrong: 0,
    streak: 0,
    mastery: 0,
    favorite: false
  };
  await putValue("progress", { ...current, favorite: !current.favorite });
  await reloadData();
  showNotice(current.favorite ? "Removed from favorites." : "Added to favorites.", "success");
}

function filterWords(filter, category) {
  let words = category ? wordsInSection(category) : [...state.words];
  if (filter === "due") {
    const now = Date.now();
    words = words.filter((word) => {
      const review = state.progress.get(word.id)?.nextReview;
      return review && new Date(review).getTime() <= now;
    });
  } else if (filter === "new") {
    words = words.filter((word) => !(state.progress.get(word.id)?.attempts));
  } else if (filter === "failed") {
    words = words.filter((word) => {
      const progress = state.progress.get(word.id);
      return progress?.wrong > 0 && (progress.mastery || 0) < 70;
    });
  } else if (filter === "difficult") {
    words = words.filter((word) => {
      const progress = state.progress.get(word.id);
      return word.difficulty >= 4 || (progress?.attempts >= 2 && progress.mastery < 50);
    });
  } else if (filter === "favorites") {
    words = words.filter((word) => state.progress.get(word.id)?.favorite);
  }
  return words;
}

async function startSession({ mode = "multipleChoice", filter = "all", category = "", total = 10, sectionChoices = false } = {}) {
  if (!state.words.length) {
    showNotice("Load vocabulary with Import words before starting a practice session.", "error");
    return;
  }
  const candidates = shuffle(filterWords(filter, category));
  if (!candidates.length) {
    showNotice(filter === "due" ? "No words are due for review yet." : "No words match this training selection.", "info");
    return;
  }
  const limit = mode === "speed" ? candidates.length : Math.min(total, candidates.length);
  if (state.session) window.clearInterval(state.session.answerTimer);
  state.session = {
    mode,
    filter,
    category,
    sectionChoices,
    words: candidates.slice(0, limit),
    index: 0,
    correct: 0,
    answered: 0,
    xp: 0,
    startedAt: Date.now(),
    questionStartedAt: Date.now(),
    answeredCurrent: false,
    timer: null,
    answerTimer: null,
    secondsRemaining: mode === "speed" ? 60 : null,
    results: [],
    currentMode: mode
  };
  showView("practice-session");
  renderQuestion();
  if (mode === "speed") startSpeedTimer();
}

function chooseCurrentMode(session) {
  if (session.mode !== "mixed") return session.mode;
  const modes = ["multipleChoice", "translation", "typing", "spelling", "flashcards", "listening"];
  return modes[Math.floor(Math.random() * modes.length)];
}

function renderQuestion() {
  cancelRecognition();
  const session = state.session;
  if (!session) return;
  window.clearInterval(session.answerTimer);
  session.answerTimer = null;
  if (session.mode !== "speed" && session.index >= session.words.length) {
    finishSession();
    return;
  }
  if (session.mode === "speed" && !session.words.length) {
    finishSession();
    return;
  }
  const word = session.words[session.mode === "speed" ? session.index % session.words.length : session.index];
  const mode = chooseCurrentMode(session);
  session.currentMode = mode;
  session.answeredCurrent = false;
  session.questionStartedAt = Date.now();

  const container = $(".practice-session-container");
  container.replaceChildren();
  const header = makeElement("div", "session-header");
  const title = makeElement("div");
  title.append(
    makeElement("p", "eyebrow", session.mode === "speed" ? "60-second challenge" : categoryName(sectionForWord(word))),
    makeElement("h2", "", session.mode === "mixed" ? "Mixed practice" : MODES[session.mode] || "Practice")
  );
  const status = makeElement("div", "session-info");
  const counter = session.mode === "speed" ? `${session.secondsRemaining}s · ${session.correct} correct` : `${session.index + 1} / ${session.words.length}`;
  status.append(makeElement("span", "", counter));
  const exit = makeElement("button", "btn btn-small", "Exit");
  exit.type = "button";
  exit.addEventListener("click", finishSession);
  status.append(exit);
  header.append(title, status);
  container.append(header);

  if (session.mode !== "speed") {
    const progress = makeElement("div", "session-progress-track");
    const fill = makeElement("div", "session-progress-fill");
    fill.style.width = `${(session.index / session.words.length) * 100}%`;
    progress.append(fill);
    container.append(progress);
  }

  const card = makeElement("div", "question-card");
  card.setAttribute("aria-live", "polite");
  container.append(card);
  renderPrompt(card, word, mode, session);
}

function renderPrompt(card, word, mode, session) {
  const ask = (text) => card.append(makeElement("p", "question-label", text));
  const prompt = (text, isVocabulary = false) => card.append(
    isVocabulary ? makeContentElement("h3", "question-prompt", text) : makeElement("h3", "question-prompt", text)
  );
  const addSpeech = (text, label = "🔊 Hear Danish") => {
    const button = makeElement("button", "btn btn-secondary audio-button", label);
    button.type = "button";
    button.addEventListener("click", () => speakDanish(text, button.dataset.slow === "true", handleSpeechStatus).catch((error) => showNotice(error.message, "error")));
    card.append(button);
    return button;
  };
  const meaningOptions = () => session.sectionChoices
    ? makeOptions(word, wordsInSection(session.category), "english", 3, state.words)
    : makeOptions(word, state.words, "english");

  if (mode === "multipleChoice") {
    ask("Choose the Danish translation");
    prompt(word.english, true);
    renderChoices(card, makeOptions(word, state.words, "danish"), word.danish, word, session);
  } else if (mode === "translation") {
    ask("Choose the English translation");
    prompt(word.danish, true);
    addSpeech(word.danish);
    renderChoices(card, meaningOptions(), word.english, word, session);
  } else if (mode === "listening") {
    ask("Listen, then choose the meaning");
    prompt("Which meaning did you hear?");
    addSpeech(word.danish);
    renderChoices(card, meaningOptions(), word.english, word, session);
  } else if (mode === "speaking") {
    ask("Say the Danish word");
    prompt(word.danish, true);
    card.append(makeContentElement("p", "speaking-meaning", word.english));
    const listen = addSpeech(word.danish);
    renderSpeaking(card, word, session, listen);
  } else if (mode === "typing" || mode === "spelling") {
    const reverseTyping = mode === "typing" && session.typingDirection === "english";
    ask(mode === "spelling" ? "Listen and type the Danish word" : "Type the translation");
    if (mode === "typing") {
      const direction = makeElement("button", "btn btn-small direction-toggle", reverseTyping ? "Danish → English" : "English → Danish");
      direction.type = "button";
      setUiAttribute(direction, "aria-label", "Switch typing direction");
      direction.addEventListener("click", () => {
        session.typingDirection = reverseTyping ? "danish" : "english";
        renderQuestion();
      });
      card.append(direction);
      prompt(reverseTyping ? word.danish : word.english, true);
    }
    else {
      prompt("Listen carefully");
      addSpeech(word.danish, "🔊 Normal");
      const slow = addSpeech(word.danish, "🔊 Slow");
      slow.dataset.slow = "true";
    }
    const form = makeElement("form", "answer-form");
    const input = document.createElement("input");
    input.type = "text";
    input.autocomplete = "off";
    input.autocapitalize = "none";
    input.spellcheck = false;
    setUiAttribute(input, "placeholder", "Type your answer");
    setUiAttribute(input, "aria-label", "Your answer");
    const submit = makeElement("button", "btn btn-primary", "Check answer");
    submit.type = "submit";
    form.append(input, submit);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!input.value.trim()) {
        showNotice("Type an answer before checking it.", "error");
        input.focus();
        return;
      }
      const expected = reverseTyping ? word.english : word.danish;
      submitAnswer(word, isTypingCorrect(input.value, expected), input.value);
    });
    card.append(form);
    input.focus();
  } else if (mode === "flashcards") {
    ask("Flashcard");
    prompt(word.danish, true);
    addSpeech(word.danish);
    const reveal = makeElement("button", "btn btn-primary", "Reveal translation");
    reveal.type = "button";
    reveal.addEventListener("click", () => {
      reveal.remove();
      card.append(makeContentElement("p", "flashcard-translation", word.english));
      if (word.exampleDanish) {
        card.append(makeContentElement("p", "example-sentence", word.exampleDanish));
        if (word.exampleEnglish) card.append(makeContentElement("p", "example-translation", word.exampleEnglish));
      }
      const ratings = makeElement("div", "rating-buttons");
      [
        ["Hard", false],
        ["Medium", true],
        ["Easy", true]
      ].forEach(([label, correct]) => {
        const button = makeElement("button", "btn btn-secondary", label);
        button.type = "button";
        button.addEventListener("click", () => submitAnswer(word, correct, label.toLowerCase()));
        ratings.append(button);
      });
      card.append(ratings);
    });
    card.append(reveal);
  } else {
    ask("Complete the Danish translation");
    prompt(word.english, true);
    renderChoices(card, makeOptions(word, state.words, "danish"), word.danish, word, session);
  }
}

function renderSpeaking(card, word, session, listen) {
  card.append(makeElement("p", "speaking-hint", "Speech recognition may send audio to an online service. It checks recognized text, not pronunciation quality."));
  const status = makeElement("p", "speaking-status");
  status.setAttribute("role", "status");
  const heardLabel = makeElement("p", "speaking-heard-label", "Heard:");
  heardLabel.hidden = true;
  const transcript = makeContentElement("span", "speaking-transcript", "");
  heardLabel.append(" ", transcript);
  const microphone = makeElement("button", "btn btn-primary speaking-microphone", "🎤 Speak");
  microphone.type = "button";
  const record = makeElement("button", "btn btn-secondary speaking-record", "Record this answer");
  record.type = "button";
  record.hidden = true;
  const skip = makeElement("button", "btn btn-secondary speaking-skip",
    session.index + 1 >= session.words.length ? "Skip and finish" : "Skip to next word");
  skip.type = "button";
  skip.hidden = true;
  let attempts = 0;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    microphone.disabled = true;
    setUiText(status, "Speech recognition is not available in this browser.");
  }
  const submit = async (correct) => {
    microphone.disabled = true;
    record.disabled = true;
    skip.disabled = true;
    await submitAnswer(word, correct, transcript.textContent);
    if (state.session === session && !session.answeredCurrent) {
      microphone.disabled = false;
      record.disabled = false;
      skip.disabled = false;
    } else {
      skip.hidden = true;
    }
  };
  record.addEventListener("click", () => submit(false));
  skip.addEventListener("click", () => {
    if (state.session !== session || session.answeredCurrent) return;
    session.index += 1;
    renderQuestion();
  });
  microphone.addEventListener("click", () => {
    attempts += 1;
    if (attempts >= 3) skip.hidden = false;
    cancelSpeech();
    record.hidden = true;
    heardLabel.hidden = true;
    transcript.textContent = "";
    microphone.disabled = true;
    listen.disabled = true;
    setUiText(status, "Starting microphone...");
    let recognition;
    try {
      recognition = new Recognition();
      activeRecognition = recognition;
      recognition.lang = "da-DK";
      recognition.continuous = false;
      recognition.interimResults = false;
      let heard = "";
      let errorMessage = "";
      recognition.onstart = () => {
        if (activeRecognition === recognition) setUiText(status, "Listening...");
      };
      recognition.onresult = (event) => {
        if (activeRecognition !== recognition) return;
        const result = event.results[event.resultIndex];
        if (result?.isFinal && result[0]) heard = result[0].transcript.trim();
      };
      recognition.onerror = (event) => {
        if (activeRecognition !== recognition) return;
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          errorMessage = "Microphone or speech recognition permission was denied.";
        } else if (event.error === "no-speech" || event.error === "audio-capture") {
          errorMessage = "No speech was captured. Check your microphone and try again.";
        } else if (event.error === "network") {
          errorMessage = "Speech recognition requires a network connection in this browser.";
        } else if (event.error === "language-not-supported") {
          errorMessage = "Danish speech recognition is not available in this browser.";
        } else {
          errorMessage = "Speech recognition failed. Please try again.";
        }
      };
      recognition.onend = () => {
        if (activeRecognition !== recognition) return;
        window.clearTimeout(recognitionTimeout);
        recognitionTimeout = null;
        activeRecognition = null;
        microphone.disabled = false;
        listen.disabled = false;
        if (errorMessage || !heard) {
          setUiText(status, errorMessage || "No speech was recognized. Please try again.");
          return;
        }
        transcript.textContent = heard;
        heardLabel.hidden = false;
        if (isSpokenAnswerCorrect(heard, word.danish)) {
          setUiText(status, "The recognized text matches.");
          submit(true);
        } else {
          setUiText(status, "The recognized text did not match. Try again or record this answer.");
          record.hidden = false;
        }
      };
      recognitionTimeout = window.setTimeout(() => {
        if (activeRecognition !== recognition) return;
        cancelRecognition();
        microphone.disabled = false;
        listen.disabled = false;
        setUiText(status, "Speech recognition timed out. Please try again.");
      }, 15000);
      recognition.start();
    } catch (error) {
      window.clearTimeout(recognitionTimeout);
      recognitionTimeout = null;
      if (activeRecognition === recognition) activeRecognition = null;
      microphone.disabled = false;
      listen.disabled = false;
      setUiText(status, "Speech recognition could not start. Check microphone permissions and try again.");
      console.error("Speech recognition could not start.", error);
    }
  });
  card.append(status, heardLabel, microphone, record, skip);
}

function renderChoices(card, options, expected, word, session) {
  const list = makeElement("div", "options-grid");
  options.forEach((option) => {
    const button = makeContentElement("button", "option-button", option);
    button.type = "button";
    button.addEventListener("click", () => {
      if (session.mode === "speed") submitAnswer(word, option === expected, option, true);
      else submitAnswer(word, option === expected, option);
    });
    list.append(button);
  });
  card.append(list);
}

async function submitAnswer(word, correct, answer, advanceImmediately = false) {
  const session = state.session;
  if (!session || session.answeredCurrent) return;
  session.answeredCurrent = true;
  const responseTime = (Date.now() - session.questionStartedAt) / 1000;
  let saved;
  try {
    saved = await recordAttempt({
      word,
      correct,
      mode: session.currentMode,
      responseTime,
      answer
    });
    state.profile = saved.profile;
  } catch (error) {
    session.answeredCurrent = false;
    showNotice(`Your answer could not be saved: ${error.message}`, "error");
    return;
  }
  session.answered += 1;
  session.correct += correct ? 1 : 0;
  session.xp += correct ? [1, 1, 3, 5, 5][Math.min(4, Math.max(0, word.difficulty - 1))] : 0;
  session.results.push({ word, correct, responseTime });
  await reloadData();
  refreshDashboard();
  if (state.session !== session || currentView !== "practice-session") return;
  if (session.mode === "speed" || advanceImmediately) {
    session.index += 1;
    renderQuestion();
    return;
  }
  const card = $(".question-card");
  const feedback = makeElement("div", `answer-feedback ${correct ? "correct" : "incorrect"}`);
  feedback.setAttribute("role", "status");
  const xpEarned = correct ? [1, 1, 3, 5, 5][Math.min(4, Math.max(0, word.difficulty - 1))] : 0;
  feedback.append(
    makeElement("strong", "", correct ? `Correct! +${xpEarned} XP` : "Not quite"),
    makeContentElement("span", "", `${word.danish} — ${word.english}`)
  );
  if (word.exampleDanish) {
    feedback.append(makeContentElement("span", "example-sentence", word.exampleDanish));
    if (word.exampleEnglish) feedback.append(makeContentElement("span", "example-translation", word.exampleEnglish));
  }
  const listen = makeElement("button", "btn btn-small", "🔊 Hear answer");
  listen.type = "button";
  listen.addEventListener("click", () => speakDanish(word.danish, false, handleSpeechStatus).catch((error) => showNotice(error.message, "error")));
  feedback.append(listen);
  card.append(feedback);
  $$(".option-button", card).forEach((button) => {
    button.disabled = true;
    if (button.textContent === (session.currentMode === "translation" || session.currentMode === "listening" ? word.english : word.danish)) {
      button.classList.add("correct-answer");
    }
  });
  const next = makeElement("button", "btn btn-primary next-question", session.index + 1 >= session.words.length ? "Finish session" : "Next word");
  next.type = "button";
  const advance = () => {
    if (state.session !== session || currentView !== "practice-session") return;
    window.clearInterval(session.answerTimer);
    session.answerTimer = null;
    session.index += 1;
    renderQuestion();
  };
  next.addEventListener("click", advance);
  const countdown = makeElement("p", "answer-countdown");
  const deadline = Date.now() + state.settings.answerDelay * 1000;
  const updateCountdown = () => {
    const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    setUiText(countdown, `Next question in ${remaining} seconds.`);
    if (remaining === 0) {
      window.clearInterval(session.answerTimer);
      session.answerTimer = window.setTimeout(advance, 250);
    }
  };
  updateCountdown();
  session.answerTimer = window.setInterval(updateCountdown, 250);
  card.append(countdown, next);
  if (session.currentMode === "typing" || session.currentMode === "spelling") {
    $$(".answer-form input, .answer-form button", card).forEach((control) => { control.disabled = true; });
  }
}

function startSpeedTimer() {
  state.session.timer = window.setInterval(() => {
    if (!state.session) return;
    state.session.secondsRemaining -= 1;
    if (state.session.secondsRemaining <= 0) {
      window.clearInterval(state.session.timer);
      finishSession();
    } else {
      const info = $(".session-info span");
      if (info) setUiText(info, `${state.session.secondsRemaining}s · ${state.session.correct} correct`);
    }
  }, 1000);
}

async function finishSession() {
  cancelRecognition();
  const session = state.session;
  if (!session) {
    showView("home");
    return;
  }
  window.clearInterval(session.timer);
  window.clearInterval(session.answerTimer);
  state.session = null;
  const elapsedSeconds = Math.round((Date.now() - session.startedAt) / 1000);
  const accuracy = session.answered ? Math.round((session.correct / session.answered) * 100) : 0;
  try {
    await saveSession({
      mode: session.mode,
      filter: session.filter,
      category: session.category,
      startedAt: new Date(session.startedAt).toISOString(),
      completedAt: new Date().toISOString(),
      durationSeconds: elapsedSeconds,
      questions: session.answered,
      correct: session.correct,
      accuracy,
      xp: session.xp
    });
  } catch (error) {
    showNotice(`Session summary could not be saved: ${error.message}`, "error");
  }
  await reloadData();
  state.sessions = await getAll("sessions");
  const container = $(".practice-session-container");
  container.replaceChildren();
  const summary = makeElement("section", "session-summary");
  summary.append(
    makeElement("p", "eyebrow", "Session complete"),
    makeElement("h2", "", session.mode === "speed" ? "Time is up!" : "Nice work"),
    makeElement("p", "summary-score", `${accuracy}% accuracy`),
    makeElement("p", "", `${session.correct} correct out of ${session.answered} answers · ${elapsedSeconds}s studied`),
    makeElement("p", "summary-xp", `You earned ${session.xp} XP`)
  );
  const categoryScores = new Map();
  session.results.forEach(({ word, correct }) => {
    const category = sectionForWord(word);
    const score = categoryScores.get(category) || { total: 0, correct: 0 };
    score.total += 1;
    score.correct += correct ? 1 : 0;
    categoryScores.set(category, score);
  });
  if (categoryScores.size) {
    summary.append(makeElement("h3", "", "Review these categories"));
    [...categoryScores.entries()]
      .sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total)
      .slice(0, 2)
      .forEach(([category, score]) => {
        summary.append(makeElement("p", "", `${categoryName(category)}: ${Math.round((score.correct / score.total) * 100)}%`));
      });
  }
  const home = makeElement("button", "btn btn-primary", "Back to dashboard");
  home.type = "button";
  home.addEventListener("click", () => showView("home"));
  const again = makeElement("button", "btn btn-secondary", "Practice again");
  again.type = "button";
  again.addEventListener("click", () => startSession({ mode: session.mode, filter: session.filter, category: session.category, sectionChoices: session.sectionChoices }));
  summary.append(home, again);
  container.append(summary);
  updateProfile();
}

function startExam() {
  const questionCount = Number($("#exam-question-count")?.value || 20);
  startSession({ mode: "multipleChoice", filter: "all", total: questionCount });
}

function renderLessons() {
  const list = $("#lessons-list");
  if (!list) return;
  list.replaceChildren();
  Object.entries(CATEGORIES).forEach(([category, label]) => {
    const words = wordsInSection(category);
    if (!words.length) return;
    const learned = words.filter((word) => isMastered(state.progress.get(word.id))).length;
    const percentage = Math.round((learned / words.length) * 100);
    const card = makeElement("article", "lesson-card");
    const heading = makeElement("div");
    const title = makeElement("h3", "lesson-title");
    const icon = makeElement("span", "lesson-icon", CATEGORY_ICONS[category] || "📘");
    icon.setAttribute("aria-hidden", "true");
    title.append(icon, makeElement("span", "", label));
    heading.append(title, makeElement("p", "", `${learned} of ${words.length} words mastered (${percentage}%)`));
    const bar = makeElement("div", "category-progress");
    const fill = makeElement("span");
    fill.style.width = `${percentage}%`;
    bar.append(fill);
    const button = makeElement("button", "btn btn-primary", "Practice this section");
    button.type = "button";
    button.addEventListener("click", () => startSession({ category, mode: $("#lesson-mode .lesson-mode-button[aria-pressed='true']").dataset.lessonMode, sectionChoices: true }));
    card.append(heading, bar, button);
    list.append(card);
  });
  if (!list.children.length) list.append(makeElement("p", "empty-state", "Import vocabulary to see your learning sections."));
}

function refreshDashboard() {
  const words = state.words;
  const progress = [...state.progress.values()];
  const attempts = state.attempts;
  const studied = progress.filter((item) => item.attempts > 0).length;
  const mastered = progress.filter(isMastered).length;
  const difficult = progress.filter((item) => item.attempts >= 2 && item.mastery < 50).length;
  const correctCount = attempts.filter((item) => item.correct).length;
  const accuracy = attempts.length ? Math.round((correctCount / attempts.length) * 100) : 0;
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = attempts.filter((item) => item.createdAt?.slice(0, 10) === today).length;
  const goal = state.settings.dailyGoal || SETTINGS_DEFAULTS.dailyGoal;
  const currentStreak = calculateStreak(state.profile?.daysActive || []);
  const weeklyStreak = countActiveDaysThisWeek(state.profile?.daysActive || []);
  const values = {
    "#total-words": words.length,
    "#words-learned": studied,
    "#current-streak": currentStreak,
    "#accuracy-rate": `${accuracy}%`
  };
  Object.entries(values).forEach(([selector, value]) => {
    const element = $(selector);
    if (element) setUiText(element, String(value));
  });
  setUiText($("#mastered-words"), String(mastered));
  setUiText($("#weekly-streak"), String(weeklyStreak));
  setUiText($("#difficult-words"), String(difficult));
  $("#daily-progress").style.width = `${Math.min(100, Math.round((todayCount / goal) * 100))}%`;
  setUiText($("#welcome-message"), words.length
    ? `${todayCount} of ${goal} answers toward today's goal · ${difficult} words to revisit`
    : "Import the vocabulary PDF list to start learning.");
  setUiText($("#continue-lesson-text"), `${Math.max(0, words.length - studied)} new words waiting`);
  setUiText($("#total-study-time"), formatDuration(attempts.reduce((sum, item) => sum + (item.responseTime || 0), 0)));
  setUiText($("#sessions-completed"), String((state.sessions || []).length));
  setUiText($("#avg-accuracy"), `${accuracy}%`);
  setUiText($("#retention-rate"), `${mastered} words mastered`);
  renderCategoryProgress();
}

function calculateStreak(days) {
  const unique = [...new Set(days)].sort().reverse();
  let streak = 0;
  let expected = new Date();
  expected.setUTCHours(0, 0, 0, 0);
  if (unique[0] !== expected.toISOString().slice(0, 10)) expected.setUTCDate(expected.getUTCDate() - 1);
  for (const day of unique) {
    if (day !== expected.toISOString().slice(0, 10)) break;
    streak += 1;
    expected.setUTCDate(expected.getUTCDate() - 1);
  }
  return streak;
}

function countActiveDaysThisWeek(days) {
  const weekStart = new Date();
  weekStart.setUTCHours(0, 0, 0, 0);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  const start = weekStart.toISOString().slice(0, 10);
  const end = new Date().toISOString().slice(0, 10);
  return new Set(days.filter((day) => day >= start && day <= end)).size;
}

function formatDuration(seconds) {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  return `${hours}h ${totalMinutes % 60}m`;
}

function renderCategoryProgress() {
  const container = $(".home-container");
  let section = $("#category-progress-list");
  if (!section) {
    section = makeElement("section", "category-progress-panel");
    section.id = "category-progress-list";
    section.append(makeElement("h3", "", "Progress by section"));
    container.append(section);
  }
  section.replaceChildren(makeElement("h3", "", "Progress by section"));
  Object.entries(CATEGORIES).forEach(([category, label]) => {
    const words = wordsInSection(category);
    if (!words.length) return;
    const mastered = words.filter((word) => isMastered(state.progress.get(word.id))).length;
    const percentage = Math.round((mastered / words.length) * 100);
    const row = makeElement("div", "category-progress-row");
    row.append(makeElement("span", "", label), makeElement("small", "", `${mastered} / ${words.length} (${percentage}%)`));
    const bar = makeElement("div", "category-progress");
    const fill = makeElement("span");
    fill.style.width = `${percentage}%`;
    bar.append(fill);
    row.append(bar);
    section.append(row);
  });
  let coach = $("#coach-insight");
  if (!coach) {
    coach = makeElement("section", "coach-card");
    coach.id = "coach-insight";
    container.append(coach);
  }
  coach.replaceChildren(makeElement("h3", "", "Weekly study insight"));
  const weekStart = Date.now() - 7 * 86400000;
  const weeklyAttempts = state.attempts.filter((attempt) => new Date(attempt.createdAt).getTime() >= weekStart);
  const wordsLearned = new Set(weeklyAttempts.map((attempt) => attempt.wordId)).size;
  const scores = Object.entries(CATEGORIES).map(([category, label]) => {
    const categoryAttempts = attemptsInSection(category);
    return {
      label,
      accuracy: categoryAttempts.length
        ? categoryAttempts.filter((attempt) => attempt.correct).length / categoryAttempts.length
        : null
    };
  }).filter((score) => score.accuracy !== null).sort((a, b) => a.accuracy - b.accuracy);
  coach.append(makeElement("p", "", `You practiced ${wordsLearned} distinct ${wordsLearned === 1 ? "word" : "words"} in the last 7 days.`));
  if (scores.length > 1) {
    coach.append(makeElement("p", "", `Strongest section: ${scores[scores.length - 1].label}. Focus next on ${scores[0].label}.`));
  } else if (scores.length === 1) {
    coach.append(makeElement("p", "", `You have started with ${scores[0].label}. Try another section for a broader progress picture.`));
  } else {
    coach.append(makeElement("p", "", "Start a practice session to get a personalized section recommendation."));
  }
  const bestSpeed = (state.sessions || [])
    .filter((session) => session.mode === "speed")
    .reduce((best, session) => Math.max(best, session.correct || 0), 0);
  if (bestSpeed) coach.append(makeElement("p", "", `Personal best: ${bestSpeed} correct in a speed round.`));
}

function renderWeakAreas() {
  const list = $("#weak-areas-list");
  if (!list) return;
  list.replaceChildren();
  const categoryScores = Object.entries(CATEGORIES).map(([category, label]) => {
    const words = wordsInSection(category);
    const categoryAttempts = attemptsInSection(category);
    const accuracy = categoryAttempts.length
      ? Math.round((categoryAttempts.filter((attempt) => attempt.correct).length / categoryAttempts.length) * 100)
      : null;
    return { category, label, words, accuracy, attempts: categoryAttempts.length };
  }).filter((item) => item.words.length).sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101));
  if (!categoryScores.length) {
    list.append(makeElement("p", "empty-state", "Import vocabulary and complete a few practice answers to see weak areas."));
  } else {
    categoryScores.slice(0, 5).forEach((item) => {
      const card = makeElement("article", "weak-area-card");
      card.append(
        makeElement("h3", "", item.label),
        makeElement("p", "", item.accuracy === null ? "Not practiced yet" : `${item.accuracy}% accuracy across ${item.attempts} answers`)
      );
      if (item.accuracy !== null) {
        const bar = makeElement("div", "category-progress");
        const fill = makeElement("span");
        fill.style.width = `${item.accuracy}%`;
        bar.append(fill);
        card.append(bar);
      }
      const button = makeElement("button", "btn btn-secondary", "Train this section");
      button.type = "button";
      button.addEventListener("click", () => startSession({ category: item.category, filter: "all", mode: "mixed" }));
      card.append(button);
      list.append(card);
    });
  }
  const weakWords = state.words
    .map((word) => ({ word, progress: state.progress.get(word.id) }))
    .filter(({ progress }) => progress?.wrong)
    .sort((a, b) => (b.progress.wrong - a.progress.wrong) || (a.progress.mastery - b.progress.mastery))
    .slice(0, 8);
  if (weakWords.length) {
    list.append(makeElement("h3", "weak-words-heading", "Words to revisit"));
    weakWords.forEach(({ word, progress }) => {
      const item = makeElement("div", "weak-word-row");
      item.append(
        makeContentElement("strong", "", word.danish),
        makeContentElement("span", "", word.english),
        makeElement("small", "", ` · ${progress.wrong} missed · ${progress.mastery}%`)
      );
      const favorite = makeElement("button", "favorite-toggle", progress.favorite ? "★" : "☆");
      favorite.type = "button";
      setUiAttribute(favorite, "aria-label", "Toggle favorite");
      favorite.addEventListener("click", () => toggleFavorite(word));
      item.append(favorite);
      list.append(item);
    });
  }
  const slowWords = state.words
    .map((word) => ({ word, progress: state.progress.get(word.id) }))
    .filter(({ progress }) => progress?.attempts)
    .sort((a, b) =>
      (b.progress.responseTimeTotal / b.progress.attempts) -
      (a.progress.responseTimeTotal / a.progress.attempts)
    )
    .slice(0, 5);
  if (slowWords.length) {
    list.append(makeElement("h3", "weak-words-heading", "Words taking the longest"));
    slowWords.forEach(({ word, progress }) => {
      const average = Math.round(progress.responseTimeTotal / progress.attempts);
      const row = makeElement("div", "weak-word-row");
      row.append(
        makeContentElement("span", "", `${word.danish} — ${word.english}`),
        makeElement("small", "", ` · ${average}s average`)
      );
      list.append(row);
    });
  }
  const forgotten = state.words
    .map((word) => ({ word, progress: state.progress.get(word.id) }))
    .filter(({ progress }) => progress?.nextReview && new Date(progress.nextReview).getTime() <= Date.now())
    .slice(0, 10);
  if (forgotten.length) {
    list.append(makeElement("h3", "weak-words-heading", "Reviews due"));
    list.append(makeElement("p", "", `${forgotten.length} words are ready for spaced review.`));
  }
}

function renderExamPrep() {
  const mastered = [...state.progress.values()].filter(isMastered).length;
  const readiness = state.words.length ? Math.round((mastered / state.words.length) * 100) : 0;
  $("#readiness-bar").style.width = `${readiness}%`;
  setUiText($("#readiness-text"), `${readiness}% ready · ${mastered} of ${state.words.length} words mastered`);
  setUiText($("#vocab-coverage"), `${mastered} of ${state.words.length} words mastered`);
  const resource = $("#resource-mock-exam");
  if (!$("#exam-question-count")) {
    const selector = document.createElement("select");
    selector.id = "exam-question-count";
    setUiAttribute(selector, "aria-label", "Exam question count");
    [20, 30, 50].forEach((count) => {
      const option = document.createElement("option");
      option.value = String(count);
      setUiText(option, `${count} questions`);
      selector.append(option);
    });
    const start = makeElement("button", "btn btn-primary", "Start mock exam");
    start.type = "button";
    start.addEventListener("click", startExam);
    resource.append(selector, start);
  }
}

function renderProgress() {
  renderChart($("#learning-chart"), "answers");
  renderChart($("#category-chart"), "categories");
}

function renderChart(canvas, type) {
  if (!canvas) return;
  const context = canvas.getContext("2d");
  const width = canvas.clientWidth || 400;
  const height = canvas.clientHeight || 240;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  context.scale(ratio, ratio);
  context.clearRect(0, 0, width, height);
  const padding = 28;
  const values = type === "answers" ? dailyCounts() : categoryCounts();
  if (!values.length) {
    context.fillStyle = getComputedStyle(document.body).getPropertyValue("--muted");
    context.font = "14px sans-serif";
    context.fillText(translateUiText("Complete practice sessions to build your chart."), padding, height / 2);
    return;
  }
  const max = Math.max(1, ...values.map((item) => item.value));
  const slot = (width - padding * 2) / values.length;
  const baseline = height - padding;
  context.strokeStyle = getComputedStyle(document.body).getPropertyValue("--border");
  context.beginPath();
  context.moveTo(padding, baseline);
  context.lineTo(width - padding, baseline);
  context.stroke();
  values.forEach((item, index) => {
    const barHeight = (item.value / max) * (height - padding * 2 - 20);
    const x = padding + slot * index + slot * 0.18;
    context.fillStyle = type === "answers" ? "#c8102e" : "#005b96";
    context.fillRect(x, baseline - barHeight, slot * 0.62, barHeight);
    context.fillStyle = getComputedStyle(document.body).getPropertyValue("--muted");
    context.font = "10px sans-serif";
    context.fillText(translateUiText(item.label).slice(0, 8), x - 1, baseline + 14, slot + 8);
  });
}

function dailyCounts() {
  const days = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const key = date.toISOString().slice(0, 10);
    days.push({
      label: date.toLocaleDateString(document.documentElement.lang === "da" ? "da-DK" : "en-US", { weekday: "short" }),
      value: state.attempts.filter((attempt) => attempt.createdAt?.slice(0, 10) === key).length
    });
  }
  return days;
}

function categoryCounts() {
  return Object.entries(CATEGORIES)
    .map(([category, label]) => ({
      label,
      value: attemptsInSection(category).length
    }))
    .filter((item) => item.value);
}

function updateProfile() {
  const profile = state.profile || { name: "Learner", xp: 0, achievements: [], daysActive: [] };
  const levels = [
    [0, "Beginner"],
    [50, "Explorer"],
    [150, "Learner"],
    [350, "Speaker"],
    [700, "Advanced"],
    [1200, "Module 1 Master"]
  ];
  const level = [...levels].reverse().find(([xp]) => (profile.xp || 0) >= xp)?.[1] || "Beginner";
  const profileName = $("#profile-name");
  if (!profile.name || profile.name === "Learner" || profile.name === "Student") {
    delete profileName.dataset.noTranslate;
    setUiText(profileName, "Learner");
  } else {
    profileName.dataset.noTranslate = "true";
    profileName.textContent = profile.name;
  }
  setUiText($("#profile-level"), level);
  $("#profile-xp").textContent = String(profile.xp || 0);
  $("#profile-badges").textContent = String(achievementCount());
  $("#profile-days").textContent = String(profile.daysActive?.length || 0);
  renderAchievements();
}

function achievementCount() {
  const correct = state.attempts.filter((attempt) => attempt.correct).length;
  const badges = [
    state.words.filter((word) => isMastered(state.progress.get(word.id))).length >= 10,
    correct >= 100,
    calculateStreak(state.profile?.daysActive || []) >= 7,
    hasCategoryMaster()
  ];
  return badges.filter(Boolean).length;
}

function hasCategoryMaster() {
  return ["substantiver", "verber", "adjektiver"].some((category) => {
    const words = wordsInSection(category);
    return words.length >= 50 && words.every((word) => isMastered(state.progress.get(word.id)));
  });
}

function renderAchievements() {
  const modalBody = $(".profile-info");
  if (!modalBody) return;
  let list = $("#achievement-list");
  if (!list) {
    list = makeElement("div", "achievement-list");
    list.id = "achievement-list";
    modalBody.append(list);
  }
  list.replaceChildren();
  list.append(makeElement("h3", "", "Achievements"));
  const achievements = [
    ["First 10 mastered", state.words.filter((word) => isMastered(state.progress.get(word.id))).length >= 10],
    ["100 correct answers", state.attempts.filter((attempt) => attempt.correct).length >= 100],
    ["7-day learning streak", calculateStreak(state.profile?.daysActive || []) >= 7],
    ["Category specialist", hasCategoryMaster()]
  ];
  achievements.forEach(([label, earned]) => {
    list.append(makeElement("p", earned ? "achievement earned" : "achievement", `${earned ? "✓" : "○"} ${label}`));
  });
}

async function hydrateProfile() {
  const profile = await getAll("profile");
  state.profile = profile.find((item) => item.id === "current") || {
    id: "current",
    name: "Learner",
    created: new Date().toISOString(),
    xp: 0,
    daysActive: [],
    achievements: []
  };
  state.profile.lastLogin = new Date().toISOString();
  await saveProfile(state.profile);
}

async function initialize() {
  try {
    await openDatabase();
    state.settings = { ...SETTINGS_DEFAULTS, ...(await getSettings()) };
    applySettings();
    bindNavigation();
    addToolbar();
    await loadInitialVocabulary();
    await reloadData();
    await hydrateProfile();
    state.sessions = await getAll("sessions");
    renderPracticeModes();
    renderDashboardExtras();
    refreshDashboard();
    renderLessons();
    updateProfile();
    renderExamPrep();
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("./service-worker.js").catch((error) => {
        showNotice(`Offline support could not be enabled: ${error.message}`, "error");
      });
    }
  } catch (error) {
    showNotice(`The trainer could not start: ${error.message}`, "error");
  }
}

initialize();
