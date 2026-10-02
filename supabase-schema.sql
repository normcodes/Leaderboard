-- Run this once in Supabase Dashboard > SQL Editor.
-- The browser uses the public publishable key, so these policies allow the leaderboard
-- to read and add runs without exposing your database password.

create table if not exists public.leaderboard_runs (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('In Order', 'Out of Order')),
  name text not null check (char_length(name) between 1 and 30),
  points integer not null check (points >= 0 and points <= 999999),
  unit integer not null check (unit between 1 and 15),
  time_ms integer not null check (time_ms > 0),
  date text not null,
  created_at timestamptz not null default now()
);

alter table public.leaderboard_runs enable row level security;

-- Keep an existing table created with the earlier 10-character rule compatible.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.leaderboard_runs'::regclass
      and conname = 'leaderboard_runs_name_check'
  ) then
    alter table public.leaderboard_runs drop constraint leaderboard_runs_name_check;
  end if;
end $$;

alter table public.leaderboard_runs
  add constraint leaderboard_runs_name_check check (char_length(name) between 1 and 30);

drop policy if exists "Anyone can read leaderboard runs" on public.leaderboard_runs;
drop policy if exists "Anyone can add leaderboard runs" on public.leaderboard_runs;
drop policy if exists "Anyone can edit leaderboard runs" on public.leaderboard_runs;
drop policy if exists "Anyone can clear leaderboard runs" on public.leaderboard_runs;

create policy "Anyone can read leaderboard runs"
on public.leaderboard_runs for select
using (true);

create policy "Anyone can add leaderboard runs"
on public.leaderboard_runs for insert
with check (true);

create policy "Anyone can edit leaderboard runs"
on public.leaderboard_runs for update
using (true)
with check (true);

create policy "Anyone can clear leaderboard runs"
on public.leaderboard_runs for delete
using (true);

create index if not exists leaderboard_runs_mode_unit_idx
on public.leaderboard_runs (mode, unit);
