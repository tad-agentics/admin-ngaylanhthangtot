/**
 * Admin user ops — JWT + ADMIN_EMAILS + service_role.
 * POST JSON: { "action": "delete_user", "userId": "<uuid>" }
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseAdminEmails(raw: string | undefined): string[] {
  const s = raw ?? "";
  return s
    .split(/[\s,;]+/u)
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.includes("@"));
}

function requireUuid(id: unknown, label: string): string | Response {
  if (typeof id !== "string" || !UUID_RE.test(id.trim())) {
    return json(
      { error: { code: "BAD_REQUEST", message: `${label} must be a UUID` } },
      400,
    );
  }
  return id.trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(
      { error: { code: "METHOD_NOT_ALLOWED", message: "POST only" } },
      405,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json(
      { error: { code: "SERVER_CONFIG", message: "Missing Supabase env" } },
      500,
    );
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: { code: "UNAUTHORIZED", message: "Missing JWT" } }, 401);
  }
  const jwt = authHeader.slice(7);

  const allow = parseAdminEmails(Deno.env.get("ADMIN_EMAILS"));
  if (allow.length === 0) {
    console.error("admin-user-actions: ADMIN_EMAILS empty");
    return json(
      {
        error: {
          code: "ADMIN_NOT_CONFIGURED",
          message: "Set Edge secret ADMIN_EMAILS (comma-separated admin emails).",
        },
      },
      503,
    );
  }

  const verifyClient = createClient(supabaseUrl, anonKey);
  const { data: userData, error: authErr } =
    await verifyClient.auth.getUser(jwt);
  if (authErr || !userData.user?.email || !userData.user.id) {
    return json({ error: { code: "UNAUTHORIZED", message: "Invalid session" } }, 401);
  }
  const email = userData.user.email.toLowerCase();
  if (!allow.includes(email)) {
    return json(
      {
        error: {
          code: "FORBIDDEN",
          message: `Not an admin (signed in as ${email}). Add this exact address to Edge secret ADMIN_EMAILS.`,
        },
      },
      403,
    );
  }

  const callerId = userData.user.id;

  let body: { action?: string; userId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: { code: "BAD_REQUEST", message: "Invalid JSON" } }, 400);
  }

  if (body.action !== "delete_user") {
    return json(
      {
        error: {
          code: "BAD_REQUEST",
          message: "action must be delete_user",
        },
      },
      400,
    );
  }

  const userIdRes = requireUuid(body.userId, "userId");
  if (userIdRes instanceof Response) return userIdRes;
  const userId = userIdRes;

  if (userId === callerId) {
    return json(
      {
        error: {
          code: "BAD_REQUEST",
          message: "Cannot delete the account you are signed in with.",
        },
      },
      400,
    );
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) throw delErr;
    return json({ ok: true, action: "delete_user", userId });
  } catch (e) {
    console.error("admin-user-actions", e);
    return json(
      {
        error: {
          code: "INTERNAL",
          message: e instanceof Error ? e.message : "Operation failed",
        },
      },
      500,
    );
  }
});
