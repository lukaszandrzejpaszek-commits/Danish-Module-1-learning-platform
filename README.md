# Danish Module 1 Trainer

An offline-first vocabulary and listening practice app built with HTML, CSS, and vanilla JavaScript. Study a categorized Danish vocabulary set, practice eight exercise modes, and keep progress locally in IndexedDB.

## Run locally

The app uses JavaScript modules, IndexedDB, and a service worker, so serve the folder from localhost rather than opening `index.html` directly.

From the project folder run:

```powershell
python -m http.server 8000
```

Then open <http://localhost:8000>. After the first successful load, the app shell and vocabulary list are cached for offline use. Speech uses the Danish Piper neural voice by default; choose the installed browser voice in Settings if preferred.

To run the topic-section checks, open <http://localhost:8000/tests/test_sections.html> while the server is running.
Dictionary search and browser-voice checks are available at <http://localhost:8000/tests/test_dictionary.html>.
Speaking answer checks are available at <http://localhost:8000/tests/test_speaking.html>.

## Included features

- Vocabulary grouped by grammar category, extracted from the supplied source PDF.
- Noun topics such as family, food, animals, and days of the week are separate sections, without duplicating words or progress. The source list has six weekdays and no month names.
- Danish cardinal numbers from 0 to 100, included as an additional practice category.
- Multiple choice, Danish-to-English, typing, spelling/listening, flashcards, listening comprehension, speaking, mixed practice, and 60-second challenge.
- Choose a practice-type icon at the top of Lessons; hover over an icon for its description. Section sessions use the selected type throughout.
- In lesson translation and listening exercises, English choices come from the same section where possible; small sections use other vocabulary to fill distinct choices.
- Answer feedback counts down before advancing automatically (five seconds by default); change the delay in Settings or use Next word immediately. Speed rounds continue immediately.
- Per-answer history, accuracy, streak, response time, XP, mastery, and review scheduling in IndexedDB.
- Dashboard, section progress, weak-area recommendations, exam practice, search, favorites, and JSON backup/restore.
- The Dictionary searches Danish and English vocabulary, including imported words. Flagged play buttons identify each language: Danish audio uses the selected voice; English audio uses an available browser voice.
- Import JSON or CSV vocabulary in Settings. CSV files need `danish` and `english` columns; `category` and `gender` are optional.
- Select Piper or browser speech in Settings. Piper generates speech locally with the `da_DK-talesyntese-medium` model.
- Speaking practice compares recognized Danish text with the displayed word. You can retry an unrecognized or mismatched response; a mismatch is counted only if you choose to record it. After three tries, you can skip the word without recording an answer.
- Switch the interface between English and Danish using the UK and Danish flag buttons; the choice is saved on the device.
- Responsive layout, dark mode, and local-first service-worker caching.

## Speech voices

Piper is the default voice. On first use, the browser downloads the Piper runtime files and the Danish medium voice model (about 63 MB); the model is cached in the browser and speech is generated on-device. An internet connection is needed to load the runtime and download the model. The selected browser voice is an alternative and depends on the operating system/browser. TTS pitch applies to browser speech; the speed setting applies to both.

Speaking practice uses the browser's speech recognition, which needs microphone permission and browser support for Danish. It may require an internet connection and send audio to the browser's recognition service. The app does not save audio; recorded answers store the recognized text in local practice history. Recognition checks the text heard, not pronunciation quality, and can make mistakes.

## Backups

Use **Profile → Export backup** to save the profile, all vocabulary (including imported words), favorites and other word progress, answers, sessions, and settings. **Restore backup** replaces the current local data after confirmation; export a backup first if you want to keep it. Finish any active practice session before restoring.

Older version 1 backups can also be restored, but they do not contain sessions or settings. Restoring one clears session history and keeps the current settings.

On the next app start, missing standard number words are added automatically. If a restored backup has no words, the default vocabulary is loaded.

## Vocabulary source and regeneration

`data/vocabulary.json` was generated from the supplied PDF, which is not included in this repository. To regenerate it, place the source document at `Saadan_ordliste.pdf` in the project folder and run:

```powershell
python tools\extract_vocabulary.py
```

The extractor uses Python's standard library. It preserves noun gender where it appears in the source and skips entries whose English translation could not be paired confidently.

## Notes

- Progress and imported vocabulary remain in this browser's IndexedDB. Export a backup before clearing site data or changing browsers.
- The Piper model is not bundled in the repository. Review the [Danish voice model card](https://huggingface.co/rhasspy/piper-voices/tree/main/da/da_DK/talesyntese/medium) before redistributing it or using it commercially.
- The [Danish number list](data/numbers.json) follows the [Danish numbers and time reference](https://www.settemilalingue.com/en/languages/da/grammar/numbers-and-time). Compound numbers place the unit before the tens and are written as one word.
