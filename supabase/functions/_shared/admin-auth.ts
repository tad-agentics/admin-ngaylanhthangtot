/**
 * Shared admin JWT verification + service_role client for admin-* Edge Functions.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeadersForRequest } from "./cors.ts";

export type AdminAuthOk = {
  admin: SupabaseClient;
  email: string;
  userId: string;
  cors: Record<string, string>;
};

export function parseAdminEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[\s,;]+/u)
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.includes("@"));
}

export function adminJson(
  cors: Record<string, string>,
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** Per-isolate soft limit — reduces scrape abuse from allowlisted admins. */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 60;
const rateBuckets = new Map<string, number[]>();

export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

function allowAdminRate(email: string): boolean {
  const now = Date.now();
  const prev = rateBuckets.get(email) ?? [];
  const recent = prev.filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX_REQUESTS) return false;
  recent.push(now);
  rateBuckets.set(email, recent);
  return true;
}

export async function requireAdmin(
  req: Request,
): Promise<AdminAuthOk | Response> {
  const cors = {
    ...corsHeadersForRequest(req),
    "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, OPTIONS",
  };

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return adminJson(
      cors,
      { error: { code: "SERVER_CONFIG", message: "Missing Supabase env" } },
      500,
    );
  }

  const allow = parseAdminEmails(Deno.env.get("ADMIN_EMAILS"));
  if (allow.length === 0) {
    return adminJson(
      cors,
      {
        error: {
          code: "ADMIN_NOT_CONFIGURED",
          message: "Set Edge secret ADMIN_EMAILS (comma-separated admin emails).",
        },
      },
      503,
    );
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return adminJson(
      cors,
      { error: { code: "UNAUTHORIZED", message: "Missing JWT" } },
      401,
    );
  }
  const jwt = authHeader.slice(7);

  const verifyClient = createClient(supabaseUrl, anonKey);
  const { data: userData, error: authErr } =
    await verifyClient.auth.getUser(jwt);
  if (authErr || !userData.user?.email || !userData.user.id) {
    return adminJson(
      cors,
      { error: { code: "UNAUTHORIZED", message: "Invalid session" } },
      401,
    );
  }

  const email = userData.user.email.toLowerCase();
  if (!allow.includes(email)) {
    return adminJson(
      cors,
      {
        error: {
          code: "FORBIDDEN",
          message: `Not an admin (signed in as ${email}).`,
        },
      },
      403,
    );
  }

  if (!allowAdminRate(email)) {
    return adminJson(
      cors,
      {
        error: {
          code: "RATE_LIMITED",
          message: "Too many admin requests — try again in a minute.",
        },
      },
      429,
    );
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    admin,
    email,
    userId: userData.user.id,
    cors,
  };
}
