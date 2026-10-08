-- Run this in Supabase SQL Editor after supabase-device-ban.sql.

create or replace function public.unban_device(p_device_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.leaderboard_banned_devices
  where device_token = trim(p_device_token);
  return true;
end;
$$;

grant execute on function public.unban_device(text) to anon, authenticated;
