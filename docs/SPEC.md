# Español Fast — App Spec

Version: 19 Oct 2026 · Owner: Raman

## Overview

Build a personal web app (PWA, works on phone and laptop) that takes one learner from beginner to a working B1 in Spanish in 12 weeks, with everything in one place: vocabulary, a daily AI tutor, pronunciation coaching, and reading.

**Target variety: Spain Spanish (Madrid).** All audio, TTS voices, speech scoring and tutor examples use `es-ES`: *vosotros*, the *θ/s* distinction (*cinco*, *gracias*), Peninsular vocabulary (*coche, móvil, ordenador, vale*).

**Who uses it:** one learner, a complete beginner, for personal use only. No sign-up flow, sharing or multi-user features; a single login protects the data. All explanations are in English.

**Product principles**

- One button to start the day. The app decides what to do; the learner just does it.
- Every module feeds the same word list. A word met in reading, a mistake in the tutor, a mispronounced word — all become cards in the same review queue.
- Speak every day. Pronunciation is scored by a machine, not guessed.
- Spain-first, real-life first: scenarios are things the learner actually does in Madrid (life, bank, gestoría, landlord, business meetings).

**Pace: start small, ramp up.** New words start at 10/day in week 1 and rise by 10 each week to 50/day from week 5. That plan alone adds about 3,500 words in 12 weeks, enough for most everyday Spanish; every "10 more words" batch the learner takes on a good day comes on top. Words are taught in the deck's frequency order; the rest of the 10,000 is the stretch goal after month 3. Expect 150–250 review cards/day once the queue fills; the daily plan caps this (see Daily loop).

## Daily loop

One "Start today" button runs a 60–90 minute session in fixed blocks; each block can also be opened on its own. The learner sets a daily time budget (30 / 60 / 90 min) and the app scales the blocks.

1. **Warm-up review (10–20 min)** — due vocabulary cards (FSRS). Every card plays its audio; every 5th card asks the learner to *say* the word and scores it.
2. **New words (10–15 min)** — today's new batch (10/day in week 1, +10 each week, 50/day from week 5; after the batch is done the app asks "Learn 10 more words?" and repeats as often as the learner says yes), next words from the deck in frequency order, plus words marked yesterday while reading.
3. **Grammar lesson with the AI tutor (15 min)** — today's topic from the 12-week curriculum: short explanation, 8–12 exercises, the tutor corrects and explains each mistake.
4. **Pronunciation (10 min)** — shadowing of 5 sentences from today's words, one minimal-pair drill, scored per sound.
5. **Speak (10 min)** — voice conversation with the tutor in a real-life scenario using today's grammar and words.
6. **Read / listen (15+ min)** — continue the current book or article; tap unknown words to mark them for tomorrow.
7. **Wrap-up (2 min)** — summary: words learned, accuracy, pronunciation score trend, mistakes saved to the error notebook, streak, journey-map progress.

**Review cap:** if due reviews exceed the time budget, the app reduces new words that day (never below 10) instead of letting the backlog explode.

## Modules and features

Four core modules plus six that close the gaps a fast learner usually hits: listening, speaking freely, conjugation, writing, remembering mistakes, and seeing progress.

### 1. Vocabulary (spaced repetition)

- Imports the Anki deck with audio, examples and all fields (see Anki deck import).
- Scheduler: **FSRS** (the modern Anki algorithm) via the `ts-fsrs` library. Ratings: Again / Hard / Good / Easy.
- Card types generated from each note: Spanish → meaning (recognition), meaning → Spanish (recall, typed or spoken), audio → meaning (listening), and optional cloze from the example sentence.
- Gender drill for nouns (*el/la*), shown as colour on the word.
- Speak-the-word mode: learner says the word, it is scored (Pronunciation module) and a low score adds a pronunciation review.
- Sources of new cards: the deck, words marked in reading, tutor mistakes, manual add. No duplicates: if a marked word already exists in the deck, it is moved to the front of the new-card queue.
- Leech handling: a card failed 6+ times is flagged; the tutor generates a mnemonic and 3 fresh example sentences.

### 2. AI tutor (grammar, every day)

- Follows a fixed 12-week curriculum (table below); one lesson per day, 6 days a week, day 7 = review test (the city "boss test", see Gamification).
- Lesson format: explanation in English with Spain-Spanish examples using words the learner already knows → 8–12 exercises (fill-in, transform, translate, build a sentence) → instant correction with the *why*.
- Free chat with the tutor at any time (text or voice). The tutor knows the learner's level, known words, and error history.
- Every corrected mistake goes to the **error notebook** and becomes a card.
- Explanations in English; Spanish-only mode unlocks from week 7. Week 1 assumes a complete beginner: alphabet and sounds, greetings, numbers, ser/estar.

| Week | Grammar focus |
| --- | --- |
| 1 | Pronunciation & spelling rules, *ser/estar* basics, articles, gender & plural |
| 2 | Present tense regular verbs, questions, negation, *hay* |
| 3 | Stem-changing & irregular present (*tener, ir, hacer, poder, querer*) |
| 4 | *Gustar*-type verbs, direct/indirect object pronouns |
| 5 | Near future (*ir a*), reflexive verbs, daily routine |
| 6 | Preterite (regular + key irregulars) |
| 7 | Imperfect; preterite vs imperfect |
| 8 | Present perfect (*he hecho* — very common in Spain), *por/para* |
| 9 | Future & conditional, comparatives |
| 10 | Imperative (*tú/usted/vosotros*), polite requests |
| 11 | Present subjunctive: wishes, recommendations, *cuando + subj.* |
| 12 | Subjunctive consolidation, connectors, final B1 mock test |

### 3. Pronunciation coach

- **Scoring engine:** Azure AI Speech Pronunciation Assessment, locale `es-ES`, phoneme granularity — scores accuracy, fluency, completeness per sentence, word and sound.
- Known limits: prosody (intonation) scoring is English-only, and very short phrases can score too generously — so score full sentences, and let the AI tutor comment on rhythm from the transcript.
- Exercises: shadowing (listen → repeat → compare waveform and score), minimal pairs (*pero/perro*, *casa/caza* with θ), word stress, linking (*los otros*), reading a paragraph aloud.
- Spain-specific sound set to track: rr (trill), single r (tap), θ (*z/ce/ci*), j/g (*jamón*), ll/y, pure vowels, b/v softening between vowels.
- Weak-sound tracker: per-sound average score over time; the daily drill targets the 2 weakest sounds.
- Record-and-compare: learner hears native audio and own recording back-to-back.

### 4. Reading

- Upload: EPUB, PDF (text-based), TXT, or paste text / a URL (article text extracted).
- Reader view: every word coloured by status — new (blue), learning (yellow), known (no colour). Tap a word → lemma, meaning in context, audio, conjugation if a verb → buttons *Add to tomorrow* / *Known* / *Ignore*.
- Marked words become cards with the original sentence as the example (sentence mining).
- Each text shows a comprehension estimate (% of words known). Recommended range: 90–98%.
- **Graded reader generator:** the AI writes a short story or article at the learner's level, about 95% known words plus 5–10 target words; topics chosen by the learner.
- Read-aloud with es-ES TTS, sentence by sentence, with tap-to-repeat.
- Starter library: graded readers and news written for learners (learner supplies the files).

### 5. Extra modules

- **Speaking scenarios (voice roleplay):** real-time voice chat with the tutor via Gemini Live API. Scenarios tied to the learner's life in Madrid: opening a bank account, NIE/TIE appointment, calling a gestoría, renting a flat, café and restaurant, doctor, and business — pitching a powerbank station to a bar owner, negotiating with a supplier, a meeting with a lawyer. After each call: transcript, corrected version, 3 phrases to learn (→ cards).
- **Listening:** dictation (hear a sentence, type it, character-level diff), tutor-generated mini-podcasts at the learner's level, and importing audio/video transcripts to read along.
- **Conjugation trainer:** fast drill of verb × tense × person, focused on tenses taught so far; includes *vosotros*.
- **Writing journal:** 5–10 sentences a day on a prompt; tutor returns a corrected version with changes highlighted; recurring errors go to the error notebook.
- **Error notebook:** every mistake from tutor, writing, speaking and pronunciation in one list, grouped by type (gender, ser/estar, tense choice, sounds); reviewed weekly as a drill.
- **Progress dashboard:** words known (target line to day 90), review accuracy, daily minutes, streak, pronunciation score per sound over time, grammar unit completion, a level-check test every 4 weeks (CEFR estimate).

## Gamification: the journey map

The 12 weeks are a trip around Spain: one city per week, starting and ending in Madrid. A city unlocks only when the week's real work is done, so the game rewards effort, never shortcuts.

**Journey map (home screen).** A snake-shaped route of 12 numbered city stops, 4 per row:

```
Row 1 (left → right):  1 Madrid → 2 Toledo → 3 Segovia → 4 Salamanca
                                                              ↓
Row 2 (right → left):  8 Zaragoza ← 7 Bilbao ← 6 Santiago ← 5 León
                         ↓
Row 3 (left → right):  9 Barcelona → 10 Valencia → 11 Granada → 12 Sevilla
                                                                   ↓
Finish:                            Back in Madrid: B1 (3,500+ words, 12 postcards)
```

Each stop shows its week number, city name and grammar topic. States: finished (shows its postcard), current (highlighted with "You are here" and a progress ring toward its unlock), locked (greyed out).

| Week | City | Grammar unlocked | Boss roleplay (voice) | Words by end of week |
| --- | --- | --- | --- | --- |
| 1 | Madrid | Sounds, ser/estar, articles | Order a coffee and a tostada | 70 |
| 2 | Toledo | Present tense | Ask for directions in the old town | 210 |
| 3 | Segovia | Irregular present | Buy food at a market | 420 |
| 4 | Salamanca | Gustar, pronouns | Meet a student, talk about likes | 700 |
| 5 | León | Ir a, reflexive verbs | Check in at a hostel, describe your day | 1,050 |
| 6 | Santiago de Compostela | Preterite | Tell a pilgrim what you did yesterday | 1,400 |
| 7 | Bilbao | Imperfect | Tell a story about your childhood | 1,750 |
| 8 | Zaragoza | Present perfect, por/para | Open a bank account | 2,100 |
| 9 | Barcelona | Future, conditional | Business meeting about plans | 2,450 |
| 10 | Valencia | Imperative | Rent a flat from a landlord | 2,800 |
| 11 | Granada | Subjunctive | Doctor's appointment | 3,150 |
| 12 | Sevilla | Subjunctive review | Pitch a powerbank station to a bar owner | 3,500 |
| Finish | Madrid | B1 mock test | Free conversation, 10 minutes | 3,500+ |

**Unlock rule for each city:** the week's 6 lessons done + the word target reached + the boss test (written quiz + voice roleplay with a local character) passed at 80% or more. Finishing early moves the learner on early; falling behind shows a "catch-up day" instead of the next city.

**Other game mechanics**

- **Postcards:** each city gives a collectible postcard (illustration, one local fact, one phrase heard there). The map fills with them.
- **XP and daily goal ring:** review = 1 XP, new word = 2, pronunciation sentence scored 80+ = 5, lesson = 20, roleplay = 30, 100 words read = 1. The ring closes at the day's goal.
- **Streak with freezes:** hitting the goal 5 days in a week earns 1 streak freeze (max 2 saved).
- **Daily quests:** 3 small, random quests a day, e.g. "say 10 words with a score of 80+", "read 500 words", "mark 5 new words in a text".
- **Badges:** word milestones (100, 500, 1,000, 2,000, 3,500), sound medals (rr, θ, j, ll/y — earned at an 85+ average over 20 attempts), first book finished, 30-day streak.
- **Weekly postcard recap:** each Sunday, a summary screen: words learned, best and weakest sounds, minutes, mistakes fixed.
- **Guardrail:** no XP for skipping reviews, and no "10 more words" until today's reviews are done.

## Anki deck import

The import must keep every field, all audio, and the deck's 3-part order, and it must not require Anki desktop.

**The deck:** [10,000 Spanish Vocabulary](https://ankiweb.net/shared/info/343733812) by Natural Language Journey, words ranked from beginner to advanced, taken from SpanishDict word lists.

| Fact | Value | What the app does with it |
| --- | --- | --- |
| Packaging | 3 separate shared decks (Part 1, 2, 3 of 3) | Importer accepts several .apkg files and merges them into one deck, ranked continuously 1–10,000 |
| Size (Part 1) | 240 MB, 7,241 audio files | Roughly 700 MB of audio for all 3 parts — import part by part, upload media in the background with a progress bar |
| Audio | Word audio and example-sentence audio | Both play on cards; sentence audio is also the shadowing source |
| Fields seen | `Spanish` (word with article, e.g. *la amenaza*), `Spanish Sentence` (e.g. *Recibió una amenaza por teléfono.*), plus English meaning and audio fields | Pre-fill the field mapping with these names |
| Gender | Article is part of the word (*el collar*, *la amenaza*) | Parse *el/la/los/las* into a `gender` field and strip it for lemma lookup |
| Card types | Recognition (Spanish + sentence → English) and recall | Map to the app's recognition and recall card types; add listening, cloze and speak types on top |
| Images | Empty image field for own pictures | Keep the field; optional "add image" button on leech cards |

**Spain (Madrid) pronunciation everywhere.** After importing Part 1, run an accent check: play *cinco, gracias, zapato, hacer*. A "th" sound on z/c means the deck audio is Spain Spanish and is used as-is. An "s" sound means Latin American audio: the importer then regenerates every word and sentence clip with an `es-ES` neural voice (Madrid accent), keeps the original only as an optional "other accents" listening track, and caches the new files. One-time cost for about 20,000 clips is about $1–3.

**Getting the files:** download each part from AnkiWeb (or export from AnkiDroid: Deck menu → Export → *Anki deck package (.apkg)* with *Include media* on). If the import fails on the new format, re-export with *Support older Anki versions* checked.

**What an .apkg is** — a ZIP containing:

- `collection.anki21b` (newer, zstd-compressed SQLite) or `collection.anki21` / `collection.anki2` (older, plain SQLite)
- `media` — a map from numbered file names (`0`, `1`, …) to real names (`hola.mp3`); JSON in old exports, zstd-compressed protobuf in new ones
- the media files themselves, named `0`, `1`, `2`, …

**Import steps**

1. Unzip in the browser (`fflate`); decompress zstd if needed (`fzstd`); open SQLite with `sql.js`.
2. Read note types (field names) from the `notetypes`/`fields` tables (new) or the `models` JSON in `col` (old).
3. Read `notes`: fields are one string split by the `\x1f` character; keep the HTML, strip it for search.
4. Read `cards` + `decks`: each part comes as its own .apkg, so tag notes Part 1 / 2 / 3 by file, and keep each card's original `due` order as the frequency order.
5. Extract audio references written as `[sound:file.mp3]` and images as `<img src="…">`; transcode audio to Opus, upload to storage and rewrite the references.
6. **Field-mapping screen:** pre-filled for this deck's field names and shown on the first 5 notes; the learner confirms or maps each field to Word / Meaning / Example (ES) / Example translation / Audio word / Audio example / Part of speech / Gender / Ignore. Save the mapping per note type.
7. Ignore Anki's review history by default (fresh FSRS start); optional checkbox to import it.
8. Re-import is idempotent: match on the Anki note `guid`, update fields, never duplicate or reset progress.

**Acceptance:** 10,000 notes import in under 2 minutes on a laptop (media upload may continue in the background); every card with audio in Anki plays audio in the app; Part 1 words are introduced first.

## Tech stack and architecture

A Next.js PWA on Supabase, with Gemini for the tutor and Azure Speech for pronunciation scoring; all API keys stay on the server.

**Architecture**

```
[ Web app (PWA) ]                                    [ Supabase: Postgres · Auth · Storage ]
  Vocabulary · Tutor · Reading       HTTPS           [ Gemini API: daily lessons, corrections ]
  Pronunciation · Speaking   ───────────────▶ [ Server routes ] ──▶ [ Gemini Live API: voice roleplay ]
  Offline cache (IndexedDB)                    (Next.js API,      [ Azure Speech es-ES: scores, TTS ]
  Anki import (in browser)                      holds all keys)
        │                                                              ▲
        └──── voice: direct WebSocket with a short-lived token from the server ────┘ (Gemini Live)
```

The browser parses the Anki deck and caches today's cards; every AI and speech call goes through server routes, except live voice, which streams directly with a short-lived token.

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | Next.js (App Router) + TypeScript + Tailwind, installable PWA | Works on phone and laptop, one codebase |
| Offline | IndexedDB (Dexie) cache of today's cards + audio; sync on reconnect | Reviews on the metro without signal |
| Backend | Next.js server routes | Keeps Gemini/Azure keys off the client |
| Database & auth | Supabase (Postgres + Auth + Storage) | Postgres + file storage in one; deck audio transcoded to Opus (about 4× smaller) to fit the free tier |
| Scheduler | `ts-fsrs` | Same algorithm family as modern Anki |
| Anki parsing | `fflate`, `fzstd`, `sql.js` | Runs fully in the browser |
| AI tutor (text) | Gemini API, current Flash model; model name in an env var | Fast and cheap for daily lessons and corrections |
| AI voice tutor | Gemini Live API (`gemini-3.1-flash-live-preview` at time of writing) over WebSocket, ephemeral tokens from the server | Real-time spoken conversation |
| Pronunciation scoring | Azure AI Speech, Pronunciation Assessment, `es-ES`, phoneme level, JS Speech SDK | Per-sound scores the AI cannot give reliably |
| TTS | Azure Neural TTS `es-ES` voices | Spain accent; cache every generated file |
| Reading import | `epub.js` / `pdfjs-dist` / Mozilla Readability for URLs | EPUB, PDF and articles |
| Spanish lemmas | AI lookup cached per word in the database | Maps *fuimos* → *ir* so words aren't duplicated |

### Data model (Postgres)

| Table | Key fields |
| --- | --- |
| `notes` | id, anki_guid, word, lemma, meaning, example_es, example_tr, pos, gender, audio_word_url, audio_example_url, audio_source (deck / es-ES TTS), part (1–3), freq_rank, source (deck / reading / tutor / manual) |
| `cards` | id, note_id, type (recognition / recall / listening / cloze / speak), fsrs fields (due, stability, difficulty, reps, lapses, state), suspended |
| `review_logs` | card_id, rating, duration_ms, reviewed_at |
| `word_status` | lemma, status (new / learning / known / ignored), first_seen_text_id |
| `texts` | id, title, type (book / article / generated), content, progress, comprehension_pct |
| `lessons` | week, day, topic, explanation, exercises (JSON), completed_at, score |
| `errors` | id, source (tutor / writing / speaking / pronunciation), category, wrong, correct, explanation, card_id |
| `pron_attempts` | reference_text, overall, accuracy, fluency, completeness, words_phonemes (JSON), audio_url, created_at |
| `sessions` | date, minutes, new_count, review_count, xp, goal_met, streak |
| `journey` | week, city, status (locked / current / done), lessons_done, words_target, boss_score, unlocked_at |
| `rewards` | type (badge / postcard / streak_freeze), key, earned_at |
| `quests` | date, description, target, progress, done |
| `settings` | daily_minutes, new_words_start (10), weekly_increase (10), new_words_max (50), voice, voice_minutes_cap (15) |

### AI tutor rules (system prompt core)

- You are a patient Spanish tutor from Madrid. Teach **Spain Spanish** (es-ES): use *vosotros*, Peninsular vocabulary, present perfect for today's events.
- Learner level: {cefr}. Current grammar topic: {topic}. Known words: {known_lemmas_sample}. Recent errors: {last_20_errors}.
- Explain in English; examples in Spanish. Keep explanations under 120 words.
- Use mostly known words; introduce at most 5 new words per lesson and list them.
- When correcting: show the corrected sentence, name the rule in one line, and return the error as JSON `{category, wrong, correct, explanation}` so the app can save it.
- Exercises are returned as JSON matching the app's exercise schema; never free-form when an exercise is requested.
- In voice roleplay: stay in character, speak at the learner's level, slow down if asked, and at the end give 3 corrections and 3 useful phrases.

## Running costs (cap: $30/month)

Expected spend is about $10–16/month, well under the $30 cap; voice conversation is the only meaningful cost. Prices are list rates checked October 2026 and are approximate.

| Service | Assumed use | Approx. $/month |
| --- | --- | --- |
| Gemini Live (voice tutor) | 10 min/day, about 300 min; about $0.023 per minute of two-way audio | 7–10 |
| Gemini Flash (lessons, corrections, word lookups) | about 50k tokens/day | 1–3 |
| Azure Speech (pronunciation scoring) | about 10 min/day ≈ 5 audio hours; 5 h/month free, then about $1/hour | 0–3 |
| Azure Neural TTS | Under the 0.5M characters/month free tier; every clip cached (one-time deck re-voicing, if needed, about $1–3) | 0 |
| Supabase | Free tier; deck audio transcoded to Opus (about 200 MB) | 0 |
| Hosting (Vercel Hobby) | One user | 0 |
| **Total** | | **about 10–16** |

**Guardrails**

- Budget alerts at $20 and a hard limit at $30 in both Google Cloud billing and Azure cost management.
- In-app limit: voice roleplay capped at 15 min/day (setting); a cost meter in Settings shows this month's estimated spend.
- Supabase free projects pause after a week without use; daily use avoids it, and a paused project is restored from the dashboard.

## Build phases

Build in 5 phases, one Antigravity task each, so the vocabulary review works from the first weekend and learning starts before the app is finished.

| Phase | Scope | Done when |
| --- | --- | --- |
| 1. Foundation + vocabulary | Project setup, Supabase, login, Anki import (3 files, field mapping, accent check, Opus transcoding), FSRS reviews (4 card types), audio playback, new-word ramp + "Learn 10 more words?", offline cache | The real deck imports; 50 reviews done on the phone with audio, also offline |
| 2. AI tutor | 12-week curriculum, daily lesson + JSON exercises, free text chat, error notebook → cards | A full week-1 lesson runs; every corrected mistake appears in the error notebook and the queue |
| 3. Pronunciation | Azure assessment, speak-the-word in reviews, shadowing, minimal pairs, per-sound tracker, record-and-compare | A sentence gets word- and sound-level scores; the weakest 2 sounds drive the daily drill |
| 4. Reading | EPUB/PDF/TXT/URL import, coloured reader, tap-to-lookup, add-to-tomorrow, comprehension %, graded reader generator, read-aloud | Marking a word in a book makes it tomorrow's new card with the book sentence as example |
| 5. Daily plan + extras | "Start today" flow, journey map with XP, streaks, quests, postcards and badges, voice roleplay (Gemini Live) incl. boss tests, dictation, conjugation trainer, writing journal, dashboard, level tests, cost meter | One button runs the whole daily loop inside the chosen time budget; finishing week 1 unlocks Toledo |

### Setup in Antigravity

1. Put this file in the project as `docs/SPEC.md` and `AGENTS.md` in the project root (Antigravity reads `AGENTS.md` as workspace rules).
2. Put keys in `.env.local` yourself: `GEMINI_API_KEY`, `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, Supabase URL and keys. Never paste keys into the agent chat.
3. Copy the 3 deck files to `data/` (git-ignored) so the agent can test the importer on the real deck.
4. Start each phase with the prompt below, review the plan the agent proposes, then let it build. Test on your phone before starting the next phase.

**Prompt to start each phase**

```text
Read docs/SPEC.md and AGENTS.md. Build Phase 1 (Foundation + vocabulary) exactly as specified.
First give me a plan: files, database migrations, libraries, and how you will test the importer
with the deck files in data/. Wait for my OK before writing code.
```

## Decisions

- [x] Explanations in English.
- [x] Starting level: complete beginner; week 1 starts from zero, first level check at the end of week 4.
- [x] New words: 10/day, +10 each week up to 50/day, with a "Learn 10 more words?" button after each batch.
- [x] Personal use only.
- [x] Budget: hard cap $30/month (see Running costs).
- [x] Pronunciation model: Spain (Madrid) for all audio, TTS, tutor voice and scoring (`es-ES`). If the deck audio turns out Latin American, it is regenerated with es-ES voices at import.

## Sources

- [AnkiWeb — 10,000 Spanish Vocabulary (Part 1 of 3)](https://ankiweb.net/shared/info/343733812)
- [Natural Language Journey — How to Learn Spanish with Anki](https://naturallanguagejourney.com/how-to-learn-spanish-with-anki/)
- [Antigravity docs — Rules](https://www.antigravity.google/docs/ide/rules)
- [Antigravity reads AGENTS.md](https://thepromptshelf.dev/blog/google-antigravity-agents-md-rules-guide-2026)
- [Azure Speech — Pronunciation assessment](https://docs.azure.cn/en-us/ai-services/speech-service/how-to-pronunciation-assessment)
- [Gemini 3.1 Flash Live pricing](https://blog.laozhang.ai/en/posts/gemini-3-1-flash-live-api)
- [Azure Speech pricing and free tier](https://azure.microsoft.com/en-gb/pricing/details/cognitive-services/speech-services/)
- [Supabase free tier limits](https://automationatlas.io/answers/supabase-free-tier-limits-2026/)
