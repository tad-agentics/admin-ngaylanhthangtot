/**
 * Admin tabular reads — service_role + same JWT + ADMIN_EMAILS allowlist as admin-dashboard-stats.
 * POST JSON: { "resource": "profiles" | "payment_orders" | "credit_ledger", "limit"?: number }
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 100;

type Resource = "profiles" | "payment_orders" | "credit_ledger";

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

function clampLimit(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(Math.max(1, Math.floor(n)), MAX_LIMIT);
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
    console.error("admin-data: ADMIN_EMAILS empty");
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

  let body: { resource?: string; limit?: number };
  try {
    body = (await req.json()) as { resource?: string; limit?: number };
  } catch {
    return json({ error: { code: "BAD_REQUEST", message: "Invalid JSON" } }, 400);
  }

  const resource = body.resource as Resource;
  const allowed: Resource[] = ["profiles", "payment_orders", "credit_ledger"];
  if (!resource || !allowed.includes(resource)) {
    return json(
      {
        error: {
          code: "BAD_REQUEST",
          message: `resource must be one of: ${allowed.join(", ")}`,
        },
      },
      400,
    );
  }

  const limit = clampLimit(body.limit);
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    if (resource === "profiles") {
      const { data, error } = await admin
        .from("profiles")
        .select(
          "id, email, display_name, credits_balance, subscription_expires_at, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return json({ rows: data ?? [] });
    }

    if (resource === "payment_orders") {
      const { data, error } = await admin
        .from("payment_orders")
        .select(
          "id, user_id, status, package_sku, amount_vnd, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return json({ rows: data ?? [] });
    }

    const { data, error } = await admin
      .from("credit_ledger")
      .select("id, user_id, delta, balance_after, reason, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return json({ rows: data ?? [] });
  } catch (e) {
    console.error("admin-data", e);
    return json(
      {
        error: {
          code: "INTERNAL",
          message: e instanceof Error ? e.message : "Query failed",
        },
      },
      500,
    );
  }
});
