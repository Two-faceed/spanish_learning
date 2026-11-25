-- Phase 3: Pronunciation Coach (pron_attempts + Phase 2 lessons/errors sync tables)

create table if not exists public.pron_attempts (
  id uuid primary key default gen_random_uuid(),
  reference_text text not null,
  mode text not null default 'shadowing',
  engine text not null default 'azure-es-ES',
  overall numeric(5,2) not null default 0,
  accuracy numeric(5,2) not null default 0,
  fluency numeric(5,2) not null default 0,
  completeness numeric(5,2) not null default 0,
  words_phonemes jsonb not null default '[]'::jsonb,
  sound_scores jsonb not null default '{}'::jsonb,
  rhythm_tip text not null default '',
  audio_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_pron_attempts_created_at
  on public.pron_attempts (created_at desc);

alter table public.pron_attempts enable row level security;

create policy "Authenticated learner full access on pron_attempts"
  on public.pron_attempts
  for all
  to authenticated
  using (true)
  with check (true);
