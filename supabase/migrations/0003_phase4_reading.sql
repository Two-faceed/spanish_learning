-- Phase 4: Reading (texts + word_status tables)

create table if not exists public.texts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null default 'article',
  content text not null,
  source_url text,
  topic text,
  target_words jsonb not null default '[]'::jsonb,
  progress numeric(5,2) not null default 0,
  comprehension_pct numeric(5,2) not null default 0,
  word_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.word_status (
  lemma text primary key,
  status text not null check (status in ('new', 'learning', 'known', 'ignored')),
  first_seen_text_id uuid references public.texts(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_texts_updated_at on public.texts (updated_at desc);
create index if not exists idx_word_status_status on public.word_status (status);

alter table public.texts enable row level security;
alter table public.word_status enable row level security;

create policy "Authenticated learner full access on texts"
  on public.texts for all to authenticated using (true) with check (true);

create policy "Authenticated learner full access on word_status"
  on public.word_status for all to authenticated using (true) with check (true);
