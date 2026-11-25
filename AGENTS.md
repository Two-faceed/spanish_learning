# Rules for this project

- The product spec is @docs/SPEC.md. Read it before every task. If code and spec disagree, ask.
- Build only the phase named in the task. Do not start later phases.
- Stack is fixed: Next.js App Router, TypeScript strict, Tailwind, Supabase, ts-fsrs. Ask before adding other major libraries.
- All Spanish content, voices and speech locales are es-ES (Spain, Madrid accent).
- All explanations and UI text for the learner are in English.
- API keys only in server routes via env vars; never in client code or the repo.
- Keep running costs under $30/month: cache every TTS clip and AI word lookup, respect the voice-minutes cap.
- Mobile-first UI; every screen must work at 375px width.
- Write tests for the scheduler, the Anki importer and JSON parsing of AI output.
- Propose a plan first and wait for approval. Finish each phase with a short summary of what to test by hand.
- Auto-commit & push: After finishing every approved task and verifying `npm test && npm run lint` pass, commit all changes with a clear message and push to `origin main` (never commit `.env*` or `data/`).
