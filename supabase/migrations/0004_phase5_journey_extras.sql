-- Phase 5: Journey Map, Rewards (Postcards / Badges / Streak Freezes), Daily Quests

create table if not exists public.journey (
  week integer primary key check (week between 1 and 12),
  city text not null,
  status text not null check (status in ('locked', 'current', 'done')),
  lessons_done integer not null default 0,
  words_target integer not null default 70,
  boss_score numeric(5,2),
  unlocked_at timestamptz
);

create table if not exists public.rewards (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('badge', 'postcard', 'streak_freeze')),
  key text not null unique,
  earned_at timestamptz not null default now()
);

create table if not exists public.quests (
  id text primary key,
  date date not null,
  key text not null,
  description text not null,
  target integer not null,
  progress integer not null default 0,
  done boolean not null default false
);

create index if not exists idx_quests_date on public.quests (date desc);

alter table public.journey enable row level security;
alter table public.rewards enable row level security;
alter table public.quests enable row level security;

create policy "Authenticated learner full access on journey"
  on public.journey for all to authenticated using (true) with check (true);

create policy "Authenticated learner full access on rewards"
  on public.rewards for all to authenticated using (true) with check (true);

create policy "Authenticated learner full access on quests"
  on public.quests for all to authenticated using (true) with check (true);
