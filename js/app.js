import { CATEGORIES, MODES, SETTINGS_DEFAULTS, MASTERED_AT } from "./config.js";
import {
  clearProgress,
  getAll,
  getSettings,
  openDatabase,
  putValue,
  recordAttempt,
  saveProfile,
  saveSession,
  saveSettings,
  saveVocabulary
} from "./storage.js";
import { isTypingCorrect, makeOptions, shuffle } from "./game.js";
import { setSpeechPitch, setSpeechRate, speakDanish } from "./speech.js";

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
  notice.textContent = message;
  notice.hidden = false;
  window.clearTimeout(showNotice.timeout);
  showNotice.timeout = window.setTimeout(() => {
    notice.hidden = true;
  }, 6500);
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function categoryName(category) {
  return CATEGORIES[category] || category.replaceAll("_", " ");
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
  search.placeholder = "Search vocabulary";
  search.setAttribute("aria-label", "Search vocabulary");

  const importButton = makeElement("button", "btn btn-secondary import-button", "Import words");
  importButton.type = "button";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.id = "vocabulary-file";
  fileInput.accept = ".json,.csv,application/json,text/csv";
  fileInput.hidden = true;

  header.insertBefore(search, actions);
  actions.prepend(importButton, fileInput);
  const results = makeElement("div", "search-results");
  results.id = "search-results";
  results.hidden = true;
  header.append(results);

  importButton.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", importVocabularyFile);
  search.addEventListener("input", () => renderSearch(search.value));

  const starButton = makeElement("button", "btn btn-secondary favorites-button", "★ Favorites");
  starButton.type = "button";
  actions.prepend(starButton);
  starButton.addEventListener("click", () => startSession({ filter: "favorites", mode: "mixed" }));

  const saveButton = makeElement("button", "btn btn-secondary", "Export backup");
  saveButton.type = "button";
  actions.prepend(saveButton);
  saveButton.addEventListener("click", exportBackup);
}

function showView(name) {
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${name}`));
  $$(".nav-btn").forEach((button) => button.classList.toggle("active", button.dataset.view === name));
  if (name === "progress") renderProgress();
  if (name === "weak-areas") renderWeakAreas();
  if (name === "lessons") renderLessons();
  if (name === "exam-prep") renderExamPrep();
  if (name === "home") refreshDashboard();
  window.scrollTo({ top: 0, behavior: "smooth" });
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
}

async function loadInitialVocabulary() {
  if ((await getAll("words")).length) return;
  try {
    const response = await fetch("./data/vocabulary.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`Vocabulary request returned ${response.status}.`);
    const data = await response.json();
    const count = await saveVocabulary(data);
    showNotice(`${count} words from the supplied list are ready to study.`, "success");
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
    const backupWords = data.vocabulary;
    const count = await saveVocabulary(backupWords ? { categories: backupWords } : data);
    if (backupWords) {
      for (const word of Object.values(backupWords).flat()) {
        if (word.progress) await putValue("progress", { ...word.progress, wordId: word.id });
      }
      if (Array.isArray(data.attempts)) {
        const db = await openDatabase();
        const transaction = db.transaction("attempts", "readwrite");
        const saved = new Promise((resolve, reject) => {
          transaction.oncomplete = resolve;
          transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error("Could not restore the answer history."));
        });
        data.attempts.forEach(({ id, ...attempt }) => transaction.objectStore("attempts").add(attempt));
        await saved;
      }
      if (data.profile) {
        state.profile = { ...data.profile, id: "current" };
        await saveProfile(state.profile);
      }
    }
    await reloadData();
    if (backupWords) await hydrateProfile();
    refreshDashboard();
    renderLessons();
    updateProfile();
    showNotice(`Imported ${count} vocabulary ${count === 1 ? "entry" : "entries"}.`, "success");
  } catch (error) {
    showNotice(`Import failed: ${error.message}`, "error");
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
  $("#settings-btn").addEventListener("click", () => openModal("settings-modal"));
  $("#profile-btn").addEventListener("click", () => {
    updateProfile();
    openModal("profile-modal");
  });
  $("#sync-btn").addEventListener("click", () => {
    $("#sync-status-text").textContent = "Your vocabulary and progress are stored on this device. Use Export backup to move them to another device.";
    openModal("sync-modal");
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
    card.querySelector("h3").textContent = title;
    card.querySelector("p").textContent = description;
    card.querySelector(".btn").textContent = "Start";
    card.querySelector(".btn").addEventListener("click", () => startSession({
      mode,
      filter: $("#practice-filter")?.value || "all",
      category: $("#practice-category")?.value || ""
    }));
  });
  const extras = [
    ["spelling-mode", "✍️ Spelling trainer", "Listen and type exactly what you hear", "spelling"],
    ["mixed-mode", "🎲 Mixed challenge", "Switch between exercise types", "mixed"]
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
    card.querySelector("h3").textContent = title;
    card.querySelector("p").textContent = description;
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
    filter.setAttribute("aria-label", "Choose vocabulary to practice");
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
      option.textContent = label;
      filter.append(option);
    });
    const category = document.createElement("select");
    category.id = "practice-category";
    category.setAttribute("aria-label", "Limit practice to a section");
    const all = document.createElement("option");
    all.value = "";
    all.textContent = "All sections";
    category.append(all);
    Object.entries(CATEGORIES).forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
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
  $("#dark-mode").checked = state.settings.theme === "dark";
  $("#tts-speed").value = String(state.settings.speechRate || 1);
  $("#tts-pitch").value = String(state.settings.speechPitch || 1);
  $("#daily-goal").value = String(state.settings.dailyGoal || SETTINGS_DEFAULTS.dailyGoal);
  setSpeechRate(state.settings.speechRate || 1);
  setSpeechPitch(state.settings.speechPitch || 1);
  document.documentElement.style.setProperty("--daily-goal", String(state.settings.dailyGoal || SETTINGS_DEFAULTS.dailyGoal));
}

async function saveSettingsFromForm() {
  state.settings = {
    ...state.settings,
    theme: $("#dark-mode").checked ? "dark" : "light",
    speechRate: Number($("#tts-speed").value),
    speechPitch: Number($("#tts-pitch").value),
    dailyGoal: Math.min(200, Math.max(5, Number($("#daily-goal").value) || SETTINGS_DEFAULTS.dailyGoal))
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

function exportBackup() {
  const payload = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    profile: state.profile,
    vocabulary: Object.fromEntries(
      Object.keys(CATEGORIES).map((category) => [
        category,
        state.words.filter((word) => word.category === category).map((word) => ({
          ...word,
          progress: state.progress.get(word.id) || null
        }))
      ])
    ),
    attempts: state.attempts
  };
  downloadFile("danish-trainer-backup.json", JSON.stringify(payload, null, 2), "application/json");
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
    .filter((word) => `${word.danish} ${word.english} ${word.category} ${word.exampleDanish || ""}`.toLocaleLowerCase("da-DK").includes(term))
    .slice(0, 12);
  if (!matches.length) {
    results.append(makeElement("p", "empty-state", "No matching words."));
  } else {
    matches.forEach((word) => {
      const progress = state.progress.get(word.id);
      const row = makeElement("div", "search-result");
      const details = makeElement("div");
      details.append(
        makeElement("strong", "", word.danish),
        makeElement("span", "", word.english),
        makeElement("small", "", `${categoryName(word.category)} · ${progress?.mastery || 0}% mastered`)
      );
      if (word.exampleDanish) details.append(makeElement("small", "search-example", word.exampleDanish));
      const favorite = makeElement("button", "favorite-toggle", progress?.favorite ? "★" : "☆");
      favorite.type = "button";
      favorite.setAttribute("aria-label", progress?.favorite ? "Remove favorite" : "Add favorite");
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
  let words = state.words.filter((word) => !category || word.category === category);
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

async function startSession({ mode = "multipleChoice", filter = "all", category = "", total = 10 } = {}) {
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
  state.session = {
    mode,
    filter,
    category,
    words: candidates.slice(0, limit),
    index: 0,
    correct: 0,
    answered: 0,
    xp: 0,
    startedAt: Date.now(),
    questionStartedAt: Date.now(),
    answeredCurrent: false,
    timer: null,
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
  const session = state.session;
  if (!session) return;
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
    makeElement("p", "eyebrow", session.mode === "speed" ? "60-second challenge" : categoryName(word.category)),
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
  const prompt = (text) => card.append(makeElement("h3", "question-prompt", text));
  const addSpeech = (text, label = "🔊 Hear Danish") => {
    const button = makeElement("button", "btn btn-secondary audio-button", label);
    button.type = "button";
    button.addEventListener("click", () => speakDanish(text, button.dataset.slow === "true").catch((error) => showNotice(error.message, "error")));
    card.append(button);
    return button;
  };

  if (mode === "multipleChoice") {
    ask("Choose the Danish translation");
    prompt(word.english);
    renderChoices(card, makeOptions(word, state.words, "danish"), word.danish, word, session);
  } else if (mode === "translation") {
    ask("Choose the English translation");
    prompt(word.danish);
    addSpeech(word.danish);
    renderChoices(card, makeOptions(word, state.words, "english"), word.english, word, session);
  } else if (mode === "listening") {
    ask("Listen, then choose the meaning");
    prompt("Which meaning did you hear?");
    addSpeech(word.danish);
    renderChoices(card, makeOptions(word, state.words, "english"), word.english, word, session);
  } else if (mode === "typing" || mode === "spelling") {
    const reverseTyping = mode === "typing" && session.typingDirection === "english";
    ask(mode === "spelling" ? "Listen and type the Danish word" : "Type the translation");
    if (mode === "typing") {
      const direction = makeElement("button", "btn btn-small direction-toggle", reverseTyping ? "Danish → English" : "English → Danish");
      direction.type = "button";
      direction.setAttribute("aria-label", "Switch typing direction");
      direction.addEventListener("click", () => {
        session.typingDirection = reverseTyping ? "danish" : "english";
        renderQuestion();
      });
      card.append(direction);
      prompt(reverseTyping ? word.danish : word.english);
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
    input.placeholder = "Type your answer";
    input.setAttribute("aria-label", "Your answer");
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
    prompt(word.danish);
    addSpeech(word.danish);
    const reveal = makeElement("button", "btn btn-primary", "Reveal translation");
    reveal.type = "button";
    reveal.addEventListener("click", () => {
      reveal.remove();
      card.append(makeElement("p", "flashcard-translation", word.english));
      if (word.exampleDanish) {
        card.append(makeElement("p", "example-sentence", word.exampleDanish));
        if (word.exampleEnglish) card.append(makeElement("p", "example-translation", word.exampleEnglish));
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
    prompt(word.english);
    renderChoices(card, makeOptions(word, state.words, "danish"), word.danish, word, session);
  }
}

function renderChoices(card, options, expected, word, session) {
  const list = makeElement("div", "options-grid");
  options.forEach((option) => {
    const button = makeElement("button", "option-button", option);
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
    makeElement("span", "", `${word.danish} — ${word.english}`)
  );
  if (word.exampleDanish) {
    feedback.append(makeElement("span", "example-sentence", word.exampleDanish));
    if (word.exampleEnglish) feedback.append(makeElement("span", "example-translation", word.exampleEnglish));
  }
  const listen = makeElement("button", "btn btn-small", "🔊 Hear answer");
  listen.type = "button";
  listen.addEventListener("click", () => speakDanish(word.danish).catch((error) => showNotice(error.message, "error")));
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
  next.addEventListener("click", () => {
    session.index += 1;
    renderQuestion();
  });
  card.append(next);
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
      if (info) info.textContent = `${state.session.secondsRemaining}s · ${state.session.correct} correct`;
    }
  }, 1000);
}

async function finishSession() {
  const session = state.session;
  if (!session) {
    showView("home");
    return;
  }
  window.clearInterval(session.timer);
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
    const score = categoryScores.get(word.category) || { total: 0, correct: 0 };
    score.total += 1;
    score.correct += correct ? 1 : 0;
    categoryScores.set(word.category, score);
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
  again.addEventListener("click", () => startSession({ mode: session.mode, filter: session.filter, category: session.category }));
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
    const words = state.words.filter((word) => word.category === category);
    if (!words.length) return;
    const learned = words.filter((word) => isMastered(state.progress.get(word.id))).length;
    const card = makeElement("article", "lesson-card");
    const heading = makeElement("div");
    heading.append(makeElement("h3", "", label), makeElement("p", "", `${words.length} words · ${learned} mastered`));
    const bar = makeElement("div", "category-progress");
    const fill = makeElement("span");
    fill.style.width = `${Math.round((learned / words.length) * 100)}%`;
    bar.append(fill);
    const button = makeElement("button", "btn btn-primary", "Practice this section");
    button.type = "button";
    button.addEventListener("click", () => startSession({ category, mode: "mixed" }));
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
    if (element) element.textContent = String(value);
  });
  $("#mastered-words").textContent = String(mastered);
  $("#weekly-streak").textContent = String(weeklyStreak);
  $("#difficult-words").textContent = String(difficult);
  $("#daily-progress").style.width = `${Math.min(100, Math.round((todayCount / goal) * 100))}%`;
  $("#welcome-message").textContent = words.length
    ? `${todayCount} of ${goal} answers toward today's goal · ${difficult} words to revisit`
    : "Import the vocabulary PDF list to start learning.";
  $("#continue-lesson-text").textContent = `${Math.max(0, words.length - studied)} new words waiting`;
  $("#total-study-time").textContent = formatDuration(attempts.reduce((sum, item) => sum + (item.responseTime || 0), 0));
  $("#sessions-completed").textContent = String((state.sessions || []).length);
  $("#avg-accuracy").textContent = `${accuracy}%`;
  $("#retention-rate").textContent = `${mastered} words mastered`;
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
    const words = state.words.filter((word) => word.category === category);
    if (!words.length) return;
    const mastered = words.filter((word) => isMastered(state.progress.get(word.id))).length;
    const row = makeElement("div", "category-progress-row");
    row.append(makeElement("span", "", label), makeElement("small", "", `${mastered} / ${words.length}`));
    const bar = makeElement("div", "category-progress");
    const fill = makeElement("span");
    fill.style.width = `${Math.round((mastered / words.length) * 100)}%`;
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
    const categoryAttempts = state.attempts.filter((attempt) => attempt.category === category);
    return {
      label,
      accuracy: categoryAttempts.length
        ? categoryAttempts.filter((attempt) => attempt.correct).length / categoryAttempts.length
        : null
    };
  }).filter((score) => score.accuracy !== null).sort((a, b) => a.accuracy - b.accuracy);
  coach.append(makeElement("p", "", `You practiced ${wordsLearned} distinct words in the last 7 days.`));
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
    const words = state.words.filter((word) => word.category === category);
    const categoryAttempts = state.attempts.filter((attempt) => attempt.category === category);
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
      item.append(makeElement("strong", "", word.danish), makeElement("span", "", `${word.english} · ${progress.wrong} missed · ${progress.mastery}%`));
      const favorite = makeElement("button", "favorite-toggle", progress.favorite ? "★" : "☆");
      favorite.type = "button";
      favorite.setAttribute("aria-label", "Toggle favorite");
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
      list.append(makeElement("div", "weak-word-row", `${word.danish} — ${word.english} · ${average}s average`));
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
  $("#readiness-text").textContent = `${readiness}% ready · ${mastered} of ${state.words.length} words mastered`;
  $("#vocab-coverage").textContent = `${mastered} of ${state.words.length} words mastered`;
  const resource = $("#resource-mock-exam");
  if (!$("#exam-question-count")) {
    const selector = document.createElement("select");
    selector.id = "exam-question-count";
    selector.setAttribute("aria-label", "Exam question count");
    [20, 30, 50].forEach((count) => {
      const option = document.createElement("option");
      option.value = String(count);
      option.textContent = `${count} questions`;
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
    context.fillText("Complete practice sessions to build your chart.", padding, height / 2);
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
    context.fillText(item.label, x - 1, baseline + 14, slot + 8);
  });
}

function dailyCounts() {
  const days = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const key = date.toISOString().slice(0, 10);
    days.push({
      label: date.toLocaleDateString(undefined, { weekday: "short" }),
      value: state.attempts.filter((attempt) => attempt.createdAt?.slice(0, 10) === key).length
    });
  }
  return days;
}

function categoryCounts() {
  return Object.entries(CATEGORIES)
    .map(([category, label]) => ({
      label: label.slice(0, 8),
      value: state.attempts.filter((attempt) => attempt.category === category).length
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
  $("#profile-name").textContent = profile.name || "Learner";
  $("#profile-level").textContent = level;
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
    const words = state.words.filter((word) => word.category === category);
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
