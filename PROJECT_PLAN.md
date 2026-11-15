# Danish Module 1 Trainer - Project Plan

## Project Overview
Building a comprehensive web application to help students prepare for the Danish Module 1 exam through vocabulary learning, listening comprehension, and progress tracking.

**Status**: Core application implemented; final validation in progress
**Total Tasks**: 43  
**Critical Tasks**: 11

The initial implementation now includes all practice modes, IndexedDB progress tracking, offline caching, and 1,309 categorized translations extracted from `Saadan_ordliste.pdf`. Browser-provided Danish speech synthesis is implemented; an offline Piper voice model is not bundled.

---

## Key Features

### 1. **8 Learning Modes**
- ✅ Multiple Choice (English → Danish)
- ✅ Translation (Danish → English)
- ✅ Typing Exercise (type what you hear)
- ✅ Spelling/Listening (transcribe audio)
- ✅ Flashcards (spaced repetition)
- ✅ Listening Exercise (audio comprehension)
- ✅ Mixed Challenge (random combination)
- ✅ Speed Round (60-second timer)

### 2. **Text-To-Speech (TTS)**
- Primary: Piper TTS (Danish da-DK model, offline capable)
- Fallback: Web Speech API (SpeechSynthesis)
- Controls: Slow/Normal speed, Repeat button
- Auto-reads: Danish word + example sentence

### 3. **Progress Tracking & Analytics**
- Track every attempt: attempts, correct, wrong, streak, mastery%
- Weak area detection (< 70% accuracy)
- Spaced repetition scheduling
- Charts: daily/weekly/monthly progress, accuracy trends
- Time spent tracking

### 4. **Gamification**
- XP System: Easy=1 XP, Medium=3 XP, Hard=5 XP
- Levels: Beginner → Explorer → Learner → Speaker → Advanced → Module 1 Master
- Achievements: 10 words learned, 100 correct answers, 7-day streak, etc.
- AI Coach: Weekly insights on performance

### 5. **Exam Preparation**
- Exam Simulator (20/30/50 question options)
- Performance analysis with weak category identification
- Module 1 specific preparation features

### 6. **Data Management**
- Vocabulary organized by category: substantiver, verber, adjektiver, adverbier, pronomener, praepositioner, konjunktioner, interjektioner, verbumsudtryk, andre_udtryk
- Offline-first with IndexedDB persistence
- Optional cloud synchronization (Firebase/Supabase)
- Import/Export functionality (JSON/CSV)

---

## Technical Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript (ES6)
- **Database**: IndexedDB (Dexie.js)
- **TTS**: Piper TTS + Web Speech API
- **Charts**: Chart.js
- **Storage**: LocalStorage for preferences, IndexedDB for data
- **No server required** - fully offline capable

---

## Implementation Phases

### 📦 Phase 1: Data Extraction & Preparation (3 tasks)
1. Extract vocabulary from PDF (Saadan_ordliste.pdf)
2. Create JSON vocabulary files by category
3. Create sample vocabulary.json for testing

**Dependencies**: None  
**Estimated time**: 4-6 hours  
**Critical**: YES

### 🏗️ Phase 2: Core Backend & Styling (3 tasks)
1. Create config.js (TTS settings, spaced repetition intervals, etc.)
2. Create comprehensive CSS (responsive, dark/light mode, Danish color scheme)
3. Create storage.js with Dexie.js IndexedDB schema

**Dependencies**: Phase 1 partially  
**Estimated time**: 6-8 hours  
**Critical**: YES

### ⚙️ Phase 3: Core Features (3 tasks)
1. User profile management (create/load profiles)
2. Vocabulary loading system (load JSON → IndexedDB)
3. Dashboard view (stats, progress overview)

**Dependencies**: Phase 2  
**Estimated time**: 5-6 hours  
**Critical**: YES

### 📚 Phase 4: Learning Modes & TTS (10 tasks)
1. Text-To-Speech system (Piper + Web Speech)
2. TTS control buttons (Slow/Normal/Repeat)
3. Multiple Choice mode
4. Danish→English translation mode
5. Typing Exercise mode
6. Spelling/Listening mode
7. Flashcard mode
8. Listening Exercise mode
9. Mixed Challenge mode
10. Speed Challenge mode (60-second timer)

**Dependencies**: Phase 3  
**Estimated time**: 12-16 hours  
**Critical**: YES (TTS and first 2 modes)

### 📊 Phase 5: Analytics & Tracking (5 tasks)
1. Progress tracking system
2. Weak area detection
3. Spaced repetition engine
4. Smart training modes (filter by failed/difficult/new words)
5. Statistics page with Chart.js

**Dependencies**: Phase 4  
**Estimated time**: 8-10 hours  
**Critical**: YES (tracking and weak area detection)

### 🎮 Phase 6: Gamification (4 tasks)
1. XP Points system
2. Achievement levels
3. Achievement system
4. AI Coach weekly insights

**Dependencies**: Phase 5  
**Estimated time**: 5-6 hours  
**Critical**: NO (nice-to-have enhancement)

### 🎓 Phase 7: Exam Mode (1 task)
1. Exam Mode Simulator (20/30/50 questions, performance analysis)

**Dependencies**: Phase 4  
**Estimated time**: 3-4 hours  
**Critical**: NO (high priority but not blocking)

### ⭐ Phase 8: Advanced Features (3 tasks)
1. Global search
2. Favorite words (star and train separately)
3. Import/Export system

**Dependencies**: Phase 3  
**Estimated time**: 4-5 hours  
**Critical**: NO

### 🎨 Phase 9: UI/UX & Polish (4 tasks)
1. Responsive design (desktop/tablet/mobile)
2. Dark/Light mode toggle
3. Modal components
4. Navigation system

**Dependencies**: Phase 2  
**Estimated time**: 6-8 hours  
**Critical**: NO (UI enhancement)

### 💾 Phase 10: Storage & Sync (2 tasks)
1. Local IndexedDB persistence
2. Optional cloud sync structure

**Dependencies**: Phase 2  
**Estimated time**: 3-4 hours  
**Critical**: YES (local storage)

### ✅ Phase 11: Testing & Data (3 tasks)
1. Populate 200-300 example vocabulary words
2. Unit tests (TTS, spaced repetition, scoring)
3. Browser compatibility testing

**Dependencies**: All phases  
**Estimated time**: 8-10 hours  
**Critical**: NO (quality assurance)

### 🚀 Phase 12: Deployment (2 tasks)
1. Final polish & bug fixes
2. Production build and testing

**Dependencies**: All previous phases  
**Estimated time**: 3-4 hours  
**Critical**: NO

---

## File Structure

```
Danish-Module-1-learning-platform/
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── app.js (main initialization)
│   ├── app-state.js (global state management)
│   ├── config.js (settings and constants)
│   ├── dom.js (DOM utilities)
│   ├── game.js (learning mode logic)
│   ├── profile.js (user management)
│   ├── scoring.js (analytics)
│   ├── speech.js (TTS integration)
│   └── storage.js (Dexie.js + IndexedDB)
├── data/
│   └── vocabulary.json (all categories)
├── tests/
│   └── test.html
└── README.md
```

---

## Database Schema (Dexie.js)

### Users Table
- userId (PK)
- name
- created
- lastLogin
- level
- xp
- preferences (JSON)

### Words Table
- wordId (PK)
- danish
- english
- category
- gender (en/et)
- difficulty (1-5)
- exampleSentence (Danish)
- exampleSentenceEN (English)
- audio (TTS URL or null)

### Progress Table
- progressId (PK)
- wordId (FK)
- userId (FK)
- attempts
- correct
- wrong
- streak
- lastSeen (timestamp)
- nextReview (timestamp)
- mastery (0-100%)

### Sessions Table
- sessionId (PK)
- userId (FK)
- mode (learning mode used)
- startTime
- endTime
- questionCount
- correctAnswers
- xpEarned

### Scores Table
- scoreId (PK)
- sessionId (FK)
- wordId (FK)
- isCorrect
- timeSpent
- userAnswer
- correctAnswer

### WeakAreas Table
- areaId (PK)
- userId (FK)
- category
- accuracyRate (%)
- failureCount
- lastUpdated

---

## Color Scheme (Danish Design)

- **Primary**: #C8102E (Danish Red)
- **Secondary**: #FFFFFF (White)
- **Accent**: #005B96 (Danish Blue)
- **Success**: #2ecc71 (Green)
- **Warning**: #f39c12 (Orange)
- **Error**: #e74c3c (Red)

---

## Success Criteria

✅ **MVP (Minimum Viable Product)**
- [ ] All 8 learning modes functional
- [ ] TTS working (Piper or Web Speech)
- [ ] Basic progress tracking
- [ ] IndexedDB persistence
- [ ] Responsive design

✅ **Full Feature Set**
- [ ] All analytics and statistics
- [ ] Weak area detection and smart training
- [ ] Gamification system complete
- [ ] Exam mode simulator
- [ ] Import/Export functionality
- [ ] Offline-first fully operational

---

## Known Requirements from Specification

- **PDF Processing**: Convert Saadan_ordliste.pdf to JSON format with Danish/English words
- **Gender Support**: Include en/et gender for Danish nouns
- **Typo Tolerance**: Levenshtein distance for typing exercises
- **Danish Characters**: Full support for Danish special characters (æ, ø, å)
- **Offline First**: Works without internet connection
- **Spaced Repetition**: Based on mastery levels
- **Mobile Friendly**: Must work on phones and tablets
- **No Backend Server**: All data stored locally in IndexedDB

---

## Next Steps

1. **Read PDF and extract vocabulary** (Phase 1)
2. **Create config.js and storage.js** (Phase 2)
3. **Build learning mode framework** (Phase 3-4)
4. **Implement TTS system** (Phase 4)
5. **Add analytics and tracking** (Phase 5)
6. **Testing and refinement** (Phase 11)

---

*Last Updated: 2024-11-15*  
*Project Lead: Lukasz Paszek*
