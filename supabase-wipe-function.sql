-- Run this entire script in Supabase Dashboard > SQL Editor.
-- The website calls wipe_leaderboard() for Clear all scores.
-- The second overload supports selected-name deletion.

-- Replace the original void-returning function so the RPC has a predictable JSON response.
drop function if exists public.wipe_leaderboard();

create or replace function public.wipe_leaderboard()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.leaderboard_runs;
  get diagnostics deleted_count = row_count;

  return jsonb_build_object(
    'success', true,
    'deleted', deleted_count,
    'cleared', '{{CLEAR}}'
  );
end;
$$;

grant execute on function public.wipe_leaderboard() to anon, authenticated;

-- Optional selected-name deletion RPC.
create or replace function public.wipe_leaderboard(users text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  if users is null or coalesce(array_length(users, 1), 0) = 0 then
    raise exception 'Provide at least one runner name.';
  end if;

  if coalesce(array_length(users, 1), 0) = 1 and users[1] = '{{CLEAR}}' then
    return public.wipe_leaderboard();
  end if;

  delete from public.leaderboard_runs
  where name = any(users);
  get diagnostics deleted_count = row_count;

  return jsonb_build_object(
    'success', true,
    'deleted', deleted_count,
    'cleared', to_jsonb(users)
  );
end;
$$;

grant execute on function public.wipe_leaderboard(text[]) to anon, authenticated;
