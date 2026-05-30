/**
 * Admin config writes — JWT + ADMIN_EMAILS + service_role.
 * POST JSON: { "table": "app_config", "id": "<config_key>", "patch": { "value": "..." } }
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const APP_CONFIG_PATCH = new Set(["value"]);

const CREDIT_APP_CONFIG_KEYS = new Set([
  "starter_credits",
  "credit_expiry_months",
  "referral_bonus_credits",
  "pivot_transition_until",
]);

function isCreditRelatedAppConfigKey(raw: string): boolean {
  const k = raw.trim().toLowerCase();
  if (!k) return false;
  if (CREDIT_APP_CONFIG_KEYS.has(k)) return true;
  if (k.includes("credit")) return true;
  return false;
}

type ConfigTable = "app_config";

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

function sanitizePatch(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (k === "config_key" || k === "updated_at") continue;
    if (!APP_CONFIG_PATCH.has(k)) continue;
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
  if (table !== "app_config") {
    return json(
      {
        error: {
          code: "BAD_REQUEST",
          message: "table must be app_config",
        },
      },
      400,
    );
  }

  const configKey = typeof body.id === "string" ? body.id.trim() : "";
  if (!configKey) {
    return json(
      { error: { code: "BAD_REQUEST", message: "id must be app_config.config_key" } },
      400,
    );
  }

  if (isCreditRelatedAppConfigKey(configKey)) {
    return json(
      {
        error: {
          code: "FORBIDDEN",
          message: "Credit/lượng app_config keys cannot be edited from admin.",
        },
      },
      403,
    );
  }

  const rawPatch = body.patch;
  if (!rawPatch || typeof rawPatch !== "object" || Array.isArray(rawPatch)) {
    return json(
      { error: { code: "BAD_REQUEST", message: "patch must be an object" } },
      400,
    );
  }

  const patch = sanitizePatch(rawPatch as Record<string, unknown>);
  if (Object.keys(patch).length === 0) {
    return json(
      {
        error: {
          code: "BAD_REQUEST",
          message: "patch must include value",
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
      .eq("config_key", configKey)
      .select()
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return json(
        {
          error: {
            code: "NOT_FOUND",
            message: "No row updated — check config_key",
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
