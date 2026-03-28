/**
 * Admin config writes — JWT + ADMIN_EMAILS + service_role.
 * POST JSON: { "table": "feature_credit_costs" | "app_config", "id": "<uuid>", "patch": { ... } }
 * Only allowlisted columns are applied; id cannot be changed here.
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

/** Columns admins may change on feature_credit_costs (add to match your schema). */
const FEATURE_CREDIT_COSTS_PATCH = new Set([
  "feature_key",
  "credit_cost",
  "credits_cost",
  "credits",
  "label",
  "name",
  "description",
  "is_active",
  "active",
  "sort_order",
  "display_order",
  "metadata",
]);

/** Columns admins may change on app_config. */
const APP_CONFIG_PATCH = new Set([
  "key",
  "value",
  "description",
  "label",
  "is_active",
]);

type ConfigTable = "feature_credit_costs" | "app_config";

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

function sanitizePatch(
  table: ConfigTable,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const allowed =
    table === "feature_credit_costs"
      ? FEATURE_CREDIT_COSTS_PATCH
      : APP_CONFIG_PATCH;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (k === "id" || k === "created_at" || k === "updated_at") continue;
    if (!allowed.has(k)) continue;
    out[k] = v;
  }
  return out;
}

async function requireAdmin(
  req: Request,
  supabaseUrl: string,
  anonKey: string,
): Promise<{ email: string } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: { code: "UNAUTHORIZED", message: "Missing JWT" } }, 401);
  }
  const jwt = authHeader.slice(7);

  const allow = parseAdminEmails(Deno.env.get("ADMIN_EMAILS"));
  if (allow.length === 0) {
    console.error("admin-config: ADMIN_EMAILS empty");
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
  if (authErr || !userData.user?.email) {
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
  return { email };
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

  const auth = await requireAdmin(req, supabaseUrl, anonKey);
  if (auth instanceof Response) return auth;

  let body: {
    table?: string;
    id?: string;
    patch?: Record<string, unknown>;
  };
  try {
    body = (await req.json()) as {
      table?: string;
      id?: string;
      patch?: Record<string, unknown>;
    };
  } catch {
    return json({ error: { code: "BAD_REQUEST", message: "Invalid JSON" } }, 400);
  }

  const table = body.table as ConfigTable;
  const tables: ConfigTable[] = ["feature_credit_costs", "app_config"];
  if (!table || !tables.includes(table)) {
    return json(
      {
        error: {
          code: "BAD_REQUEST",
          message: `table must be one of: ${tables.join(", ")}`,
        },
      },
      400,
    );
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id || !UUID_RE.test(id)) {
    return json(
      { error: { code: "BAD_REQUEST", message: "id must be a UUID" } },
      400,
    );
  }

  const rawPatch = body.patch;
  if (!rawPatch || typeof rawPatch !== "object" || Array.isArray(rawPatch)) {
    return json(
      { error: { code: "BAD_REQUEST", message: "patch must be an object" } },
      400,
    );
  }

  const patch = sanitizePatch(table, rawPatch as Record<string, unknown>);
  if (Object.keys(patch).length === 0) {
    return json(
      {
        error: {
          code: "BAD_REQUEST",
          message: "patch is empty after allowlist — no updatable fields matched",
        },
      },
      400,
    );
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data, error } = await admin
      .from(table)
      .update(patch)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return json(
        {
          error: {
            code: "NOT_FOUND",
            message: "No row updated — check id or RLS/table name",
          },
        },
        404,
      );
    }

    return json({ row: data });
  } catch (e) {
    console.error("admin-config", e);
    return json(
      {
        error: {
          code: "INTERNAL",
          message: e instanceof Error ? e.message : "Update failed",
        },
      },
      500,
    );
  }
});
