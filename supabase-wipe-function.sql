-- Run this in Supabase Dashboard > SQL Editor.
-- Accepts either an array of runner names or ARRAY['{{CLEAR}}'].

create or replace function public.wipe_leaderboard(users text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
  clear_all boolean := coalesce(array_length(users, 1), 0) = 1 and users[1] = '{{CLEAR}}';
begin
  if clear_all then
    delete from public.leaderboard_runs;
  else
    if users is null or coalesce(array_length(users, 1), 0) = 0 then
      raise exception 'Provide runner names or use ARRAY[''{{CLEAR}}'']';
    end if;

    delete from public.leaderboard_runs
    where name = any(users);
  end if;

  get diagnostics deleted_count = row_count;

  return jsonb_build_object(
    'success', true,
    'deleted', deleted_count,
    'cleared', case when clear_all then '{{CLEAR}}' else to_jsonb(users)::text end
  );
end;
$$;

grant execute on function public.wipe_leaderboard(text[]) to anon, authenticated;
