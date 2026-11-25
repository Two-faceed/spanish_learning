-- Español Fast — All-In-One Supabase Cloud Sync Schema
-- Paste this ENTIRE file once into Supabase -> SQL Editor -> Run.
-- Safe to re-run (uses IF NOT EXISTS). Matches all 13 Dexie offline tables 1:1.

create table if not exists public.notes (
  id text primary key,
  anki_guid text unique not null,
  word text not null,
  lemma text not null,
  meaning text not null,
  example_es text not null default '',
  cloze_es text not null default '',
  example_tr text not null default '',
  pos text,
  gender text,
  image_url text,
  audio_word_url text,
  audio_example_url text,
  deck_audio_word_url text,
  deck_audio_example_url text,
  audio_source text not null default 'deck',
  part smallint not null default 1,
  freq_rank integer not null default 999999,
  source text not null default 'deck',
  created_at timestamptz not null default now()
);

create index if not exists idx_notes_freq_rank on public.notes (part, freq_rank);
create index if not exists idx_notes_lemma on public.notes (lemma);

create table if not exists public.cards (
  id text primary key,
  note_id text not null,
  type text not null,
  due timestamptz not null default now(),
  stability double precision not null default 0,
  difficulty double precision not null default 0,
  elapsed_days integer not null default 0,
  scheduled_days integer not null default 0,
  reps integer not null default 0,
  lapses integer not null default 0,
  state smallint not null default 0,
  last_review timestamptz,
  suspended boolean not null default false
);

create index if not exists idx_cards_note_id on public.cards (note_id);
create index if not exists idx_cards_due_state on public.cards (state, due);

create table if not exists public.review_logs (
  id text primary key,
  card_id text not null,
  rating smallint not null,
  duration_ms integer not null default 0,
  reviewed_at timestamptz not null default now()
);

create table if not exists public.texts (
  id text primary key,
  title text not null,
  type text not null default 'article',
  content text not null,
  source_url text,
  topic text,
  target_words jsonb not null default '[]'::jsonb,
  current_page integer not null default 0,
  progress double precision not null default 0,
  comprehension_pct double precision not null default 0,
  word_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.word_status (
  lemma text primary key,
  status text not null default 'new',
  first_seen_text_id text,
  updated_at timestamptz not null default now()
);

create table if not exists public.lessons (
  id text primary key,
  week smallint not null,
  day smallint not null,
  city text not null default 'Madrid',
  topic text not null,
  explanation text not null default '',
  examples jsonb not null default '[]'::jsonb,
  new_words jsonb not null default '[]'::jsonb,
  exercises jsonb not null default '[]'::jsonb,
  completed_at timestamptz,
  score double precision
);

create table if not exists public.errors (
  id text primary key,
  source text not null default 'tutor',
  category text not null,
  wrong text not null,
  correct text not null,
  explanation text not null,
  card_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.pron_attempts (
  id text primary key,
  reference_text text not null,
  mode text not null default 'shadowing',
  engine text not null default 'gemini-es-ES',
  overall double precision not null default 0,
  accuracy double precision not null default 0,
  fluency double precision not null default 0,
  completeness double precision not null default 0,
  words_phonemes jsonb not null default '[]'::jsonb,
  sound_scores jsonb not null default '{}'::jsonb,
  rhythm_tip text not null default '',
  audio_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  date text primary key,
  minutes integer not null default 0,
  new_count integer not null default 0,
  review_count integer not null default 0,
  xp integer not null default 0,
  goal_met boolean not null default false,
  streak integer not null default 0,
  extra_batches integer not null default 0
);

create table if not exists public.journey (
  week integer primary key,
  city text not null,
  status text not null default 'locked',
  lessons_done integer not null default 0,
  words_target integer not null default 70,
  boss_score double precision,
  unlocked_at timestamptz
);

create table if not exists public.rewards (
  id text primary key,
  type text not null,
  key text unique not null,
  earned_at timestamptz not null default now()
);

create table if not exists public.quests (
  id text primary key,
  date text not null,
  key text not null default '',
  description text not null,
  target integer not null,
  progress integer not null default 0,
  done boolean not null default false
);

create table if not exists public.settings (
  id smallint primary key default 1,
  daily_minutes integer not null default 60,
  new_words_start integer not null default 10,
  weekly_increase integer not null default 10,
  new_words_max integer not null default 50,
  voice text not null default 'es-ES-AlvaroNeural',
  voice_minutes_cap integer not null default 15,
  start_date text not null default to_char(current_date, 'YYYY-MM-DD'),
  field_mappings jsonb not null default '{}'::jsonb
);

insert into public.settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.tts_cache (
  hash text primary key,
  text text not null,
  voice text not null,
  storage_path text not null,
  audio_url text not null,
  char_count integer not null default 0,
  created_at timestamptz not null default now()
);
