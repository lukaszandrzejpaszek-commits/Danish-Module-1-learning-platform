# Danish Module 1 Trainer

An offline-first vocabulary and listening practice app built with HTML, CSS, and vanilla JavaScript. Study a categorized Danish vocabulary set, practice eight exercise modes, and keep progress locally in IndexedDB.

## Run locally

The app uses JavaScript modules, IndexedDB, and a service worker, so serve the folder from localhost rather than opening `index.html` directly.

From the project folder run:

```powershell
python -m http.server 8000
```

Then open <http://localhost:8000>. After the first successful load, the app shell and vocabulary list are cached for offline use. Speech playback uses the browser's Danish (`da-DK`) speech synthesis voice when available.

## Included features

- Vocabulary grouped by grammar category, extracted from the supplied source PDF.
- Multiple choice, Danish-to-English, typing, spelling/listening, flashcards, listening comprehension, mixed practice, and 60-second challenge.
- Per-answer history, accuracy, streak, response time, XP, mastery, and review scheduling in IndexedDB.
- Dashboard, section progress, weak-area recommendations, exam practice, search, favorites, and JSON backup/restore.
- CSV import with `danish` and `english` columns; `category` and `gender` are optional.
- Responsive layout, dark mode, and local-first service-worker caching.

## Vocabulary source and regeneration

`data/vocabulary.json` was generated from the supplied PDF, which is not included in this repository. To regenerate it, place the source document at `Saadan_ordliste.pdf` in the project folder and run:

```powershell
python tools\extract_vocabulary.py
```

The extractor uses Python's standard library. It preserves noun gender where it appears in the source and skips entries whose English translation could not be paired confidently.

## Notes

- Progress and imported vocabulary remain in this browser's IndexedDB. Export a backup before clearing site data or changing browsers.
- Cloud synchronization is not configured; the sync button explains local storage and backup options.
- TTS quality and voice availability depend on the operating system/browser. An offline Piper voice model is not bundled.
