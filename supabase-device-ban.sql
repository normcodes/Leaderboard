-- Run this in Supabase SQL Editor after supabase-device-token.sql.
-- Device tokens are browser-generated identifiers, not IP addresses.

create table if not exists public.leaderboard_banned_devices (
  device_token text primary key,
  banned_until timestamptz not null,
  banned_by text,
  created_at timestamptz not null default now()
);

alter table public.leaderboard_banned_devices enable row level security;

create or replace function public.get_device_ban(p_device_token text)
returns timestamptz
language sql
security definer
set search_path = public
as $$
  select max(banned_until)
  from public.leaderboard_banned_devices
  where device_token = p_device_token
    and banned_until > now();
$$;

grant execute on function public.get_device_ban(text) to anon, authenticated;

create or replace function public.ban_device(
  p_device_token text,
  p_duration_minutes integer default 1440
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_until timestamptz := now() + make_interval(mins => greatest(1, p_duration_minutes));
  expires_at timestamptz;
begin
  if p_device_token is null or length(trim(p_device_token)) < 16 then
    raise exception 'A valid device token is required.';
  end if;

  insert into public.leaderboard_banned_devices(device_token, banned_until, banned_by)
  values (trim(p_device_token), requested_until, 'dev-mode')
  on conflict (device_token) do update
    set banned_until = case
      when public.leaderboard_banned_devices.banned_until > now()
        then public.leaderboard_banned_devices.banned_until
      else excluded.banned_until
    end,
    banned_by = excluded.banned_by;

  select banned_until into expires_at
  from public.leaderboard_banned_devices
  where device_token = trim(p_device_token);

  return expires_at;
end;
$$;

grant execute on function public.ban_device(text, integer) to anon, authenticated;
