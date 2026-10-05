import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CLEAR_TOKEN = "{{CLEAR}}";

type WipeRequest = {
  users?: string[] | string;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST required" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: WipeRequest;
  try {
    body = await req.json();
  } catch (_) {
    return new Response(JSON.stringify({ error: "Request body must be JSON." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const users = body.users;
  const wipeAll = users === CLEAR_TOKEN;
  const names = Array.isArray(users)
    ? [...new Set(users.map((name) => String(name).trim()).filter(Boolean))]
    : [];

  if (!wipeAll && (!Array.isArray(users) || names.length === 0)) {
    return new Response(JSON.stringify({ error: `Send users as an array of names or use users: "${CLEAR_TOKEN}".` }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const query = supabase.from("leaderboard_runs").delete();
  const { error } = wipeAll
    ? await query.not("id", "is", null)
    : await query.in("name", names);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({
    success: true,
    cleared: wipeAll ? CLEAR_TOKEN : names,
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
