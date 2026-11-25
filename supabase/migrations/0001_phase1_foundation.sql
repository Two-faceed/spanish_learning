-- Español Fast — Phase 1 Foundation & Complete Data Model
-- Matches docs/SPEC.md section "Data model (Postgres)"

create extension if not exists "pgcrypto";

-- 1. notes
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  anki_guid text unique not null,
  word text not null,
  lemma text not null,
  meaning text not null,
  example_es text not null default '',
  cloze_es text not null default '',
  example_tr text not null default '',
  pos text,
  gender text check (gender in ('el', 'la', 'los', 'las', 'el/la') or gender is null),
  image_url text,
  audio_word_url text,
  audio_example_url text,
  deck_audio_word_url text,
  deck_audio_example_url text,
  audio_source text not null default 'deck' check (audio_source in ('deck', 'es-ES TTS')),
  part smallint not null default 1 check (part between 1 and 3),
  freq_rank integer not null default 999999,
  source text not null default 'deck' check (source in ('deck', 'reading', 'tutor', 'manual')),
  created_at timestamptz not null default now()
);

create index if not exists idx_notes_freq_rank on public.notes (part, freq_rank);
create index if not exists idx_notes_lemma on public.notes (lemma);

-- 2. cards (FSRS state per note x card type)
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  type text not null check (type in ('recognition', 'recall', 'listening', 'cloze', 'speak')),
  due timestamptz not null default now(),
  stability double precision not null default 0,
  difficulty double precision not null default 0,
  elapsed_days integer not null default 0,
  scheduled_days integer not null default 0,
  reps integer not null default 0,
  lapses integer not null default 0,
  state smallint not null default 0 check (state between 0 and 3), -- 0=New, 1=Learning, 2=Review, 3=Relearning
  last_review timestamptz,
  suspended boolean not null default false,
  created_at timestamptz not null default now(),
  unique (note_id, type)
);

create index if not exists idx_cards_due_state on public.cards (state, due) where suspended = false;
create index if not exists idx_cards_note_id on public.cards (note_id);

-- 3. review_logs
create table if not exists public.review_logs (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  rating smallint not null check (rating between 1 and 4), -- 1=Again, 2=Hard, 3=Good, 4=Easy
  duration_ms integer not null default 0,
  reviewed_at timestamptz not null default now()
);

create index if not exists idx_review_logs_reviewed_at on public.review_logs (reviewed_at);

-- 4. texts (Reading module - Phase 4)
create table if not exists public.texts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null check (type in ('book', 'article', 'generated')),
  content text not null,
  progress double precision not null default 0,
  comprehension_pct double precision not null default 0,
  created_at timestamptz not null default now()
);

-- 5. word_status
create table if not exists public.word_status (
  lemma text primary key,
  status text not null default 'new' check (status in ('new', 'learning', 'known', 'ignored')),
  first_seen_text_id uuid references public.texts(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- 6. lessons (AI Tutor - Phase 2)
create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  week smallint not null check (week between 1 and 12),
  day smallint not null check (day between 1 and 7),
  topic text not null,
  explanation text not null default '',
  exercises jsonb not null default '[]'::jsonb,
  completed_at timestamptz,
  score double precision,
  unique (week, day)
);

-- 7. errors (Error notebook - Phase 2+)
create table if not exists public.errors (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('tutor', 'writing', 'speaking', 'pronunciation')),
  category text not null,
  wrong text not null,
  correct text not null,
  explanation text not null,
  card_id uuid references public.cards(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 8. pron_attempts (Pronunciation coach - Phase 3)
create table if not exists public.pron_attempts (
  id uuid primary key default gen_random_uuid(),
  reference_text text not null,
  overall double precision not null,
  accuracy double precision not null,
  fluency double precision not null,
  completeness double precision not null,
  words_phonemes jsonb not null default '[]'::jsonb,
  audio_url text,
  created_at timestamptz not null default now()
);

-- 9. sessions (Daily activity & streak tracker)
create table if not exists public.sessions (
  date date primary key default current_date,
  minutes integer not null default 0,
  new_count integer not null default 0,
  review_count integer not null default 0,
  xp integer not null default 0,
  goal_met boolean not null default false,
  streak integer not null default 0,
  extra_batches integer not null default 0
);

-- 10. journey (12-week Spain map - Phase 5)
create table if not exists public.journey (
  week smallint primary key check (week between 1 and 13),
  city text not null,
  status text not null default 'locked' check (status in ('locked', 'current', 'done')),
  lessons_done smallint not null default 0,
  words_target integer not null,
  boss_score double precision,
  unlocked_at timestamptz
);

-- 11. rewards (Badges, postcards, streak freezes - Phase 5)
create table if not exists public.rewards (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('badge', 'postcard', 'streak_freeze')),
  key text unique not null,
  earned_at timestamptz not null default now()
);

-- 12. quests (Daily quests - Phase 5)
create table if not exists public.quests (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  description text not null,
  target integer not null,
  progress integer not null default 0,
  done boolean not null default false
);

-- 13. settings (Single learner configuration)
create table if not exists public.settings (
  id smallint primary key default 1 check (id = 1),
  daily_minutes integer not null default 60 check (daily_minutes in (30, 60, 90)),
  new_words_start integer not null default 10,
  weekly_increase integer not null default 10,
  new_words_max integer not null default 50,
  voice text not null default 'es-ES-AlvaroNeural',
  voice_minutes_cap integer not null default 15,
  start_date date not null default current_date,
  field_mappings jsonb not null default '{}'::jsonb
);

insert into public.settings (id) values (1) on conflict (id) do nothing;

-- 14. tts_cache (Cost guardrail: cache every es-ES TTS clip so nothing is synthesized twice)
create table if not exists public.tts_cache (
  hash text primary key,
  text text not null,
  voice text not null,
  storage_path text not null,
  audio_url text not null,
  char_count integer not null default 0,
  created_at timestamptz not null default now()
);

-- Row Level Security (Single-user personal app: authenticated users have full access)
alter table public.notes enable row level security;
alter table public.cards enable row level security;
alter table public.review_logs enable row level security;
alter table public.texts enable row level security;
alter table public.word_status enable row level security;
alter table public.lessons enable row level security;
alter table public.errors enable row level security;
alter table public.pron_attempts enable row level security;
alter table public.sessions enable row level security;
alter table public.journey enable row level security;
alter table public.rewards enable row level security;
alter table public.quests enable row level security;
alter table public.settings enable row level security;
alter table public.tts_cache enable row level security;

create policy "Authenticated full access on notes" on public.notes for all to authenticated using (true) with check (true);
create policy "Authenticated full access on cards" on public.cards for all to authenticated using (true) with check (true);
create policy "Authenticated full access on review_logs" on public.review_logs for all to authenticated using (true) with check (true);
create policy "Authenticated full access on texts" on public.texts for all to authenticated using (true) with check (true);
create policy "Authenticated full access on word_status" on public.word_status for all to authenticated using (true) with check (true);
create policy "Authenticated full access on lessons" on public.lessons for all to authenticated using (true) with check (true);
create policy "Authenticated full access on errors" on public.errors for all to authenticated using (true) with check (true);
create policy "Authenticated full access on pron_attempts" on public.pron_attempts for all to authenticated using (true) with check (true);
create policy "Authenticated full access on sessions" on public.sessions for all to authenticated using (true) with check (true);
create policy "Authenticated full access on journey" on public.journey for all to authenticated using (true) with check (true);
create policy "Authenticated full access on rewards" on public.rewards for all to authenticated using (true) with check (true);
create policy "Authenticated full access on quests" on public.quests for all to authenticated using (true) with check (true);
create policy "Authenticated full access on settings" on public.settings for all to authenticated using (true) with check (true);
create policy "Authenticated full access on tts_cache" on public.tts_cache for all to authenticated using (true) with check (true);

-- Storage bucket for transcoded Opus deck audio and cached es-ES TTS clips
insert into storage.buckets (id, name, public)
values ('deck-audio', 'deck-audio', true)
on conflict (id) do nothing;
