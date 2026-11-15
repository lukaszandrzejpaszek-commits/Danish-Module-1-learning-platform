const DATABASE_NAME = "danish-module-1-trainer";
const DATABASE_VERSION = 1;
let databasePromise;
const BACKUP_STORES = ["words", "progress", "attempts", "sessions", "profile", "settings"];

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () =>
      reject(transaction.error || new Error("IndexedDB transaction failed."));
  });
}

function stableWordId(category, danish, english) {
  const source = `${category}|${danish.normalize("NFC").toLocaleLowerCase("da-DK")}|${english.normalize("NFC").toLocaleLowerCase("en")}`;
  let hash = 2166136261;
  for (const char of source) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${category}-${(hash >>> 0).toString(36)}`;
}

export function openDatabase() {
  if (!("indexedDB" in window)) {
    return Promise.reject(new Error("This browser does not support IndexedDB, which is required to save your learning progress."));
  }
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("words")) {
          const words = db.createObjectStore("words", { keyPath: "id" });
          words.createIndex("category", "category");
          words.createIndex("danish", "danish");
        }
        if (!db.objectStoreNames.contains("progress")) {
          const progress = db.createObjectStore("progress", { keyPath: "wordId" });
          progress.createIndex("mastery", "mastery");
          progress.createIndex("nextReview", "nextReview");
        }
        if (!db.objectStoreNames.contains("attempts")) {
          const attempts = db.createObjectStore("attempts", { keyPath: "id", autoIncrement: true });
          attempts.createIndex("createdAt", "createdAt");
          attempts.createIndex("wordId", "wordId");
          attempts.createIndex("category", "category");
        }
        if (!db.objectStoreNames.contains("sessions")) {
          db.createObjectStore("sessions", { keyPath: "id", autoIncrement: true });
        }
        if (!db.objectStoreNames.contains("profile")) {
          db.createObjectStore("profile", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "id" });
        }
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error || new Error("Could not open the local learning database."));
      request.onblocked = () => reject(new Error("The learning database is blocked by another open tab. Close other trainer tabs and reload."));
    });
  }
  return databasePromise;
}

export async function getAll(storeName) {
  const db = await openDatabase();
  return requestResult(db.transaction(storeName, "readonly").objectStore(storeName).getAll());
}

export async function createBackup() {
  const db = await openDatabase();
  const transaction = db.transaction(BACKUP_STORES, "readonly");
  const done = transactionDone(transaction);
  const values = await Promise.all(BACKUP_STORES.map((name) => requestResult(transaction.objectStore(name).getAll())));
  await done;
  return {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    stores: Object.fromEntries(BACKUP_STORES.map((name, index) => [name, values[index]]))
  };
}

export function validateBackup(data) {
  const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  if (!isObject(data) || ![1, 2].includes(data.schemaVersion)) {
    throw new Error("Unsupported or invalid backup file.");
  }
  let stores;
  if (data.schemaVersion === 1) {
    if (!isObject(data.vocabulary) || !Array.isArray(data.attempts) || !isObject(data.profile)) {
      throw new Error("Invalid backup file.");
    }
    const categories = Object.values(data.vocabulary);
    if (!categories.every(Array.isArray)) throw new Error("Invalid backup file.");
    const entries = categories.flat();
    if (!entries.every((entry) => isObject(entry) && (entry.progress == null || isObject(entry.progress)))) {
      throw new Error("Invalid backup file.");
    }
    stores = {
      words: entries.map(({ progress, ...word }) => word),
      progress: entries.filter((word) => word.progress != null).map((word) => ({ ...word.progress, wordId: word.id })),
      attempts: data.attempts,
      sessions: [],
      profile: [{ ...data.profile, id: "current" }],
      settings: null
    };
  } else {
    if (!isObject(data.stores)) throw new Error("Invalid backup file.");
    stores = data.stores;
    if (!BACKUP_STORES.every((name) => Array.isArray(stores[name]))) throw new Error("Invalid backup file.");
  }

  const storeNames = stores.settings === null ? BACKUP_STORES.filter((name) => name !== "settings") : BACKUP_STORES;
  for (const name of storeNames) {
    const records = stores[name];
    if (!Array.isArray(records) || !records.every(isObject)) throw new Error("Invalid backup file.");
    const key = name === "progress" ? "wordId" : "id";
    const ids = records.map((record) => record[key]);
    const optionalIds = data.schemaVersion === 1 && name === "attempts";
    if (ids.some((id) => !(optionalIds && id === undefined) &&
      !(typeof id === "string" && id.length > 0) &&
      !(typeof id === "number" && Number.isFinite(id)))) throw new Error("Invalid backup file.");
    const presentIds = ids.filter((id) => id !== undefined);
    if (new Set(presentIds).size !== presentIds.length) throw new Error("Invalid backup file.");
  }
  if (!stores.words.every((word) => typeof word.id === "string" &&
    typeof word.danish === "string" && word.danish.trim() &&
    typeof word.english === "string" && word.english.trim() &&
    typeof word.category === "string" && word.category.trim()) ||
    !stores.progress.every((progress) => typeof progress.wordId === "string") ||
    stores.profile.length !== 1 || stores.profile[0].id !== "current" ||
    typeof stores.profile[0].name !== "string" ||
    (stores.profile[0].daysActive !== undefined && (!Array.isArray(stores.profile[0].daysActive) ||
      !stores.profile[0].daysActive.every((day) => typeof day === "string"))) ||
    (stores.settings !== null && (stores.settings.length > 1 ||
      stores.settings.some((setting) => setting.id !== "current" || !isObject(setting.value))))) {
    throw new Error("Invalid backup file.");
  }
  return { stores, legacy: data.schemaVersion === 1 };
}

export async function restoreBackup(stores) {
  const names = BACKUP_STORES.filter((name) => stores[name] !== null);
  const db = await openDatabase();
  const transaction = db.transaction(names, "readwrite");
  const done = transactionDone(transaction);
  try {
    names.forEach((name) => {
      const store = transaction.objectStore(name);
      store.clear();
      stores[name].forEach((record) => store.add(record));
    });
  } catch (error) {
    transaction.abort();
    await done.catch(() => {});
    throw error;
  }
  await done;
}

export async function getValue(storeName, key) {
  const db = await openDatabase();
  return requestResult(db.transaction(storeName, "readonly").objectStore(storeName).get(key));
}

export async function putValue(storeName, value) {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put(value);
  await transactionDone(transaction);
}

function toWords(input) {
  const result = [];
  const add = (entry, category) => {
    if (!entry || typeof entry !== "object") return;
    const danish = String(entry.danish || entry.dk || entry.word || "").trim();
    const english = String(entry.english || entry.en || entry.translation || "").trim();
    if (!danish || !english) return;
    result.push({
      id: String(entry.id || stableWordId(category, danish, english)),
      danish,
      english,
      category: String(entry.category || category || "andre_udtryk"),
      gender: entry.gender === "en" || entry.gender === "et" ? entry.gender : null,
      difficulty: Math.min(5, Math.max(1, Number(entry.difficulty) || 2)),
      exampleDanish: String(entry.exampleDanish || entry.example?.danish || ""),
      exampleEnglish: String(entry.exampleEnglish || entry.example?.english || ""),
      source: entry.source || "import"
    });
  };
  if (Array.isArray(input)) {
    input.forEach((entry) => add(entry, entry?.category));
  } else if (input && typeof input === "object") {
    const categories = input.categories && typeof input.categories === "object" ? input.categories : input;
    Object.entries(categories).forEach(([category, entries]) => {
      if (Array.isArray(entries)) entries.forEach((entry) => add(entry, category));
    });
  }
  if (!result.length) {
    throw new Error("No usable vocabulary found. Import words with Danish and English fields, grouped by category or provided as a list.");
  }
  return result;
}

export async function saveVocabulary(input) {
  const wordsToSave = toWords(input);
  const db = await openDatabase();
  const transaction = db.transaction(["words", "progress"], "readwrite");
  const done = transactionDone(transaction);
  const words = transaction.objectStore("words");
  const progress = transaction.objectStore("progress");
  wordsToSave.forEach((word) => {
    words.put(word);
    const getProgress = progress.get(word.id);
    getProgress.onsuccess = () => {
      if (!getProgress.result) {
        progress.add({
          wordId: word.id,
          attempts: 0,
          correct: 0,
          wrong: 0,
          streak: 0,
          mastery: 0,
          lastSeen: null,
          nextReview: null,
          favorite: false,
          responseTimeTotal: 0
        });
      }
    };
  });
  await done;
  return wordsToSave.length;
}

export async function recordAttempt({ word, correct, mode, responseTime, answer }) {
  const db = await openDatabase();
  const transaction = db.transaction(["progress", "attempts", "profile"], "readwrite");
  const done = transactionDone(transaction);
  const progressStore = transaction.objectStore("progress");
  const existing = await requestResult(progressStore.get(word.id));
  const now = new Date();
  const attempts = (existing?.attempts || 0) + 1;
  const correctCount = (existing?.correct || 0) + (correct ? 1 : 0);
  const wrongCount = (existing?.wrong || 0) + (correct ? 0 : 1);
  const streak = correct ? (existing?.streak || 0) + 1 : 0;
  const mastery = Math.round((correctCount / attempts) * 100);
  const reviewDays = correct ? [1, 3, 7, 14, 30][Math.min(4, Math.max(0, streak - 1))] : 0;
  const nextReview = new Date(now.getTime() + reviewDays * 86400000).toISOString();
  progressStore.put({
    ...existing,
    wordId: word.id,
    attempts,
    correct: correctCount,
    wrong: wrongCount,
    streak,
    mastery,
    lastSeen: now.toISOString(),
    nextReview,
    responseTimeTotal: (existing?.responseTimeTotal || 0) + Math.max(0, responseTime || 0)
  });
  transaction.objectStore("attempts").add({
    wordId: word.id,
    category: word.category,
    mode,
    correct,
    answer: String(answer || ""),
    responseTime: Math.max(0, responseTime || 0),
    createdAt: now.toISOString()
  });
  const profileStore = transaction.objectStore("profile");
  const profile = await requestResult(profileStore.get("current")) || {
    id: "current",
    name: "Learner",
    created: now.toISOString(),
    xp: 0,
    daysActive: [],
    achievements: []
  };
  profile.xp = (profile.xp || 0) + (correct ? [1, 1, 3, 5, 5][Math.min(4, Math.max(0, word.difficulty - 1))] : 0);
  profile.daysActive = [...new Set([...(profile.daysActive || []), now.toISOString().slice(0, 10)])];
  profile.lastLogin = now.toISOString();
  profileStore.put(profile);
  await done;
  return { progress: { ...existing, attempts, correct: correctCount, wrong: wrongCount, streak, mastery, nextReview }, profile };
}

export async function saveSession(session) {
  const db = await openDatabase();
  const transaction = db.transaction("sessions", "readwrite");
  const done = transactionDone(transaction);
  const request = transaction.objectStore("sessions").add(session);
  const id = await requestResult(request);
  await done;
  return id;
}

export async function getSettings() {
  return (await getValue("settings", "current"))?.value || {};
}

export async function saveSettings(value) {
  await putValue("settings", { id: "current", value });
}

export async function saveProfile(value) {
  await putValue("profile", { ...value, id: "current" });
}

export async function clearProgress() {
  const db = await openDatabase();
  const transaction = db.transaction(["progress", "attempts", "sessions", "profile"], "readwrite");
  const done = transactionDone(transaction);
  transaction.objectStore("progress").clear();
  transaction.objectStore("attempts").clear();
  transaction.objectStore("sessions").clear();
  const profileStore = transaction.objectStore("profile");
  const request = profileStore.get("current");
  request.onsuccess = () => {
    const profile = request.result;
    if (profile) profileStore.put({ ...profile, xp: 0, daysActive: [], achievements: [] });
  };
  await done;
}
