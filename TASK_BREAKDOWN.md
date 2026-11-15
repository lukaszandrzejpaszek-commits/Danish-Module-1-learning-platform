# DANISH MODULE 1 TRAINER - PROJECT BREAKDOWN

## 📋 Complete Task List (43 Tasks)

### IMPLEMENTATION STATUS
Core app and PDF vocabulary import are implemented. The checkboxes below distinguish implemented tasks from follow-up validation and optional cloud sync.

---

## 🎯 CRITICAL PATH (What to build first)

### PHASE 1: DATA EXTRACTION
**Status**: 🔴 TODO  
**Time**: 4-6 hours  
**Dependencies**: None  
**Tasks**:
- [x] 1-pdf-extract: Extract vocabulary from Saadan_ordliste.pdf
- [x] 1-json-structure: Organize into JSON files by category
- [x] 1-sample-data: Create vocabulary.json sample data

**Output**: `data/vocabulary.json` with all word categories

---

### PHASE 2: CORE BACKEND & STYLING  
**Status**: 🔴 TODO  
**Time**: 6-8 hours  
**Dependencies**: Phase 1 (partial)  
**Tasks**:
- [x] 2-config-file: Create `js/config.js`
- [x] 2-css-styles: Create `css/styles.css` (responsive + dark mode)
- [x] 2-storage-db: Create `js/storage.js` (native IndexedDB, no network dependency)

**Output**: Complete backend infrastructure and styling system

---

### PHASE 3: CORE FEATURES
**Status**: 🔴 TODO  
**Time**: 5-6 hours  
**Dependencies**: Phase 2  
**Tasks**:
- [x] 3-user-auth: Local user profile, XP, and achievements
- [x] 3-vocab-loader: Load JSON → IndexedDB
- [x] 3-dashboard: Dashboard UI with stats

**Output**: Application can load data and display it

---

### PHASE 4: LEARNING MODES & TTS
**Status**: 🔴 TODO  
**Time**: 12-16 hours  
**Dependencies**: Phase 3  
**Tasks**:
- [x] 4-tts-system: Browser Danish speech synthesis (`da-DK`); Piper model not bundled
- [x] 4-tts-controls: Normal/slow/repeat playback
- [x] 4-mode-multichoice: Multiple Choice mode
- [x] 4-mode-translate: Danish→English mode
- [x] 4-mode-typing: Bidirectional typing with typo tolerance
- [x] 4-mode-spelling: Spelling/Listening mode
- [x] 4-mode-flashcard: Flashcard mode with review ratings
- [x] 4-mode-listening: Listening Exercise mode
- [x] 4-mode-mixed: Mixed Challenge mode
- [x] 4-mode-speed: Speed Round mode (60s timer)

**Output**: MVP learning application with 8 practice modes

---

### PHASE 5: ANALYTICS & TRACKING
**Status**: 🔴 TODO  
**Time**: 8-10 hours  
**Dependencies**: Phase 4  
**Tasks**:
- [x] 5-progress-tracking: Track attempts, correct/wrong, streak, mastery, and response time
- [x] 5-weak-area-detection: Identify weak categories, missed words, and slow responses
- [x] 5-spaced-repetition: Schedule reviews by correct-answer streak
- [x] 5-stats-page: Dashboard with daily and category charts (native canvas)
- [x] 5-smart-training: Filter by failed/difficult/new/due/favorite words and category

**Output**: Advanced analytics and smart learning features

---

### PHASE 6: GAMIFICATION (Optional enhancement)
**Status**: 🔴 TODO  
**Time**: 5-6 hours  
**Dependencies**: Phase 5  
**Tasks**:
- [x] 6-xp-system: XP tracking (Easy=1, Medium=3, Hard=5)
- [x] 6-levels: Achievement levels system
- [x] 6-achievements: Badge/achievement tracking
- [x] 6-ai-coach: Local weekly study insights (no external AI service)

**Output**: Gamification system complete

---

### PHASE 7: EXAM MODE
**Status**: 🔴 TODO  
**Time**: 3-4 hours  
**Dependencies**: Phase 4  
**Tasks**:
- [x] 7-exam-mode: Exam simulator (20/30/50 questions)

**Output**: Exam preparation feature

---

### PHASE 8: ADVANCED FEATURES
**Status**: 🔴 TODO  
**Time**: 4-5 hours  
**Dependencies**: Phase 3, 5  
**Tasks**:
- [x] 8-search: Global search by word/category/translation
- [x] 8-favorites: Star/favorite words
- [x] 8-import-export: Import JSON/CSV, export and restore backups

**Output**: Advanced user features

---

### PHASE 9: UI/UX POLISH
**Status**: 🔴 TODO  
**Time**: 6-8 hours  
**Dependencies**: Phase 2  
**Tasks**:
- [x] 9-responsive-design: Mobile/tablet/desktop layouts
- [x] 9-theme-system: Dark/light mode toggle
- [x] 9-modal-dialogs: Settings/profile/sync modals
- [x] 9-navigation: Navigation and view switching

**Output**: Professional UI/UX complete

---

### PHASE 10: STORAGE & SYNC
**Status**: 🔴 TODO  
**Time**: 3-4 hours  
**Dependencies**: Phase 2  
**Tasks**:
- [x] 10-local-storage: IndexedDB persistence verification
- [ ] 10-cloud-sync: Optional cloud sync structure (Firebase/Supabase)

**Output**: Data persistence infrastructure

---

### PHASE 11: TESTING & DATA
**Status**: 🔴 TODO  
**Time**: 8-10 hours  
**Dependencies**: All phases  
**Tasks**:
- [x] 11-example-words: Populate from the supplied PDF (1,309 translated entries)
- [x] 11-test-suite: Vocabulary extraction and data-shape tests
- [ ] 11-browser-compat: Browser compatibility testing

**Output**: Full test coverage and production vocabulary data

---

### PHASE 12: DEPLOYMENT
**Status**: 🔴 TODO  
**Time**: 3-4 hours  
**Dependencies**: All phases  
**Tasks**:
- [ ] 12-final-polish: Final bugfixes and refinement
- [ ] 12-deploy: Production build and deployment

**Output**: Production-ready application

---

## 📊 TASK SUMMARY BY CATEGORY

| Category | Count | Priority |
|----------|-------|----------|
| Learning Modes | 8 | CRITICAL |
| Frontend | 6 | HIGH |
| Backend | 6 | CRITICAL |
| Features | 10 | MEDIUM |
| Analytics | 2 | CRITICAL |
| Gamification | 3 | MEDIUM |
| Data | 4 | CRITICAL |
| Testing | 2 | MEDIUM |
| Deployment | 1 | MEDIUM |
| QA | 1 | MEDIUM |

---

## 🔧 TECHNICAL SPECIFICATIONS

### Database Schema (Dexie.js)

**Users Table**
- userId (PK), name, created, lastLogin, level, xp, preferences

**Words Table**
- wordId (PK), danish, english, category, gender (en/et), difficulty (1-5), exampleSentence, audio

**Progress Table**
- progressId (PK), wordId (FK), userId (FK), attempts, correct, wrong, streak, lastSeen, nextReview, mastery%

**Sessions Table**
- sessionId (PK), userId (FK), mode, startTime, endTime, questionCount, correctAnswers, xpEarned

**Scores Table**
- scoreId (PK), sessionId (FK), wordId (FK), isCorrect, timeSpent, userAnswer, correctAnswer

**WeakAreas Table**
- areaId (PK), userId (FK), category, accuracyRate%, failureCount, lastUpdated

---

### Learning Mode Requirements

| Mode | Input | Display | Answer | Tracking |
|------|-------|---------|--------|----------|
| Multiple Choice | English word | Word + 3 Danish options | Select 1 | ✓ |
| Danish→English | Danish word | Word + 3 English options | Select 1 | ✓ |
| Typing | English word | Word | Type Danish | ✓ Levenshtein |
| Spelling | Audio (Danish) | "Write what you hear" | Type Danish | ✓ |
| Flashcard | Front (Danish) | Flip to English | Rate (1-4) | ✓ Spaced Rep |
| Listening | Audio + question | Question + 3-4 options | Select 1 | ✓ |
| Mixed | Varies | Random mode | Varies | ✓ |
| Speed | Timed (60s) | Words rapidly | Correct/Incorrect | ✓ XP |

---

### TTS Configuration

- **Preferred**: Piper TTS (da-DK model, offline, high quality)
- **Fallback**: Web Speech API with SpeechSynthesis
- **Speed Range**: 0.5x - 2.0x (default 1.0x)
- **Pitch Range**: 0.5 - 2.0 (default 1.0)
- **Auto-read**: Danish word + example sentence after answer

---

### Color Scheme (Danish Design)

```
Primary:    #C8102E (Danish Red)
Secondary:  #FFFFFF (White)
Accent:     #005B96 (Danish Blue)
Success:    #2ecc71 (Green)
Warning:    #f39c12 (Orange)
Error:      #e74c3c (Red)
```

---

### File Structure

```
Danish-Module-1-learning-platform/
├── index.html                    (already created)
├── README.md
├── css/
│   └── styles.css               (Phase 2)
├── js/
│   ├── app.js                   (Phase 3)
│   ├── app-state.js             (Phase 2)
│   ├── config.js                (Phase 2)
│   ├── dom.js                   (Phase 3)
│   ├── game.js                  (Phase 4)
│   ├── profile.js               (Phase 3)
│   ├── scoring.js               (Phase 5)
│   ├── speech.js                (Phase 4)
│   └── storage.js               (Phase 2)
├── data/
│   └── vocabulary.json          (Phase 1)
└── tests/
    └── test.html
```

---

## 📈 MVP vs FULL FEATURE

### MVP (Phases 1-5)
- ✅ 8 learning modes
- ✅ TTS system (Piper + fallback)
- ✅ Progress tracking
- ✅ Weak area detection
- ✅ IndexedDB persistence
- ✅ Responsive design
- ~30-40 hours work

### FULL FEATURE SET (All 12 Phases)
- ✅ Everything in MVP +
- ✅ Gamification (XP, levels, achievements)
- ✅ Exam mode simulator
- ✅ Advanced search/favorites/import-export
- ✅ Analytics dashboard with charts
- ✅ Optional cloud sync
- ✅ Full test coverage
- ~50-60 hours work total

---

## ⚡ QUICK START ORDER

1. **Extract PDF vocabulary** → JSON files
2. **Create config.js** → TTS and learning mode settings
3. **Create storage.js** → IndexedDB schema
4. **Build TTS system** → Piper + fallback
5. **Create first 3 learning modes** → Multiple choice, translation, typing
6. **Add progress tracking** → Record attempts and calculate mastery
7. **Build weak area detection** → Identify < 70% accuracy words
8. **Test and refine MVP** → 8 learning modes working

Then continue with gamification, exam mode, and advanced features.

---

## ✨ KEY FEATURES SUMMARY

✅ **8 Learning Modes**: Multiple choice, translation, typing, spelling, flashcards, listening, mixed, speed  
✅ **TTS System**: Piper (offline) + Web Speech API fallback  
✅ **Progress Tracking**: Attempts, accuracy, streak, mastery% for each word  
✅ **Weak Area Detection**: Auto-identify categories with < 70% accuracy  
✅ **Spaced Repetition**: SM-2 algorithm for optimal review scheduling  
✅ **Gamification**: XP, levels, achievements, daily streaks  
✅ **Exam Mode**: 20/30/50 question simulations  
✅ **Analytics**: Charts for daily/weekly/monthly progress  
✅ **Offline-First**: Full IndexedDB persistence  
✅ **Responsive Design**: Mobile, tablet, desktop support  
✅ **Dark Mode**: Theme switcher with preference storage  
✅ **Search & Favorites**: Global search + word favoriting  

---

## 🎓 Module 1 Vocabulary Categories

1. **Substantiver** (Nouns)
2. **Verber** (Verbs)
3. **Adjektiver** (Adjectives)
4. **Adverbier** (Adverbs)
5. **Pronomener** (Pronouns)
6. **Praepositioner** (Prepositions)
7. **Konjunktioner** (Conjunctions)
8. **Interjektioner** (Interjections)
9. **Verbumsudtryk** (Verb expressions)
10. **Andre_udtryk** (Other expressions)

---

## 📝 NOTES

- **No server required** - works entirely offline
- **Dexie.js** for IndexedDB abstraction (simpler than raw IndexedDB)
- **Chart.js** for analytics visualization
- **Vanilla JavaScript** - no frameworks/libraries except those listed
- **Typo tolerance** using Levenshtein distance for typing exercises
- **Danish character support** (æ, ø, å)
- **Spaced repetition** based on accuracy and time intervals

---

**Project Status**: ✅ **PLANNING COMPLETE**  
**Ready to implement Phase 1**: PDF extraction and vocabulary JSON creation

*Generated: 2024-11-15*
