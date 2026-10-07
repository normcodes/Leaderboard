-- Optional but recommended: run this in Supabase SQL Editor.
-- It lets the leaderboard associate a score with the browser/device token
-- used to create it, so renaming cannot bypass a device ban.

alter table public.leaderboard_runs
  add column if not exists device_token text;

create index if not exists leaderboard_runs_device_token_idx
  on public.leaderboard_runs (device_token);
