/**
 * Read / update sticky site banner (`app_config.site_banner` JSON).
 * Admin only: Bearer user JWT + ADMIN_EMAILS allowlist (same as admin-dashboard-stats).
 *
 * GET/PUT — invoke with Authorization: Bearer <access_token>.
 * PUT body: { "enabled": boolean, "message": string, "href": string | null }
 *
 * Deploy: supabase secrets set ADMIN_EMAILS=you@domain.com,other@domain.com
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const CONFIG_KEY = "site_banner";
const MAX_MESSAGE_LEN = 600;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type SiteBannerPayload = {
  enabled: boolean;
  message: string;
  href: string | null;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseAdminEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const DEFAULT_BANNER: SiteBannerPayload = {
  enabled: false,
  message: "",
  href: null,
};

function parseBannerValue(raw: string | null | undefined): SiteBannerPayload {
  if (!raw?.trim()) return { ...DEFAULT_BANNER };
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const enabled = Boolean(o.enabled);
    const message = typeof o.message === "string" ? o.message : "";
    const href =
      o.href === null || o.href === undefined
        ? null
        : typeof o.href === "string"
          ? o.href.trim() || null
          : null;
    return { enabled, message, href };
  } catch {
    return { ...DEFAULT_BANNER };
  }
}

function isAllowedHref(href: string | null): boolean {
  if (href === null || href === "") return true;
  if (href.length > 2048) return false;
  if (href.startsWith("/") && !href.startsWith("//")) {
    return !/[\s<>"']/.test(href);
  }
  try {
    const u = new URL(href);
    if (u.protocol === "https:") return true;
    if (
      u.protocol === "http:" &&
      (u.hostname === "localhost" || u.hostname === "127.0.0.1")
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function requireAdmin(
  req: Request,
  supabaseUrl: string,
  anonKey: string,
): Promise<
  | { admin: ReturnType<typeof createClient>; email: string }
  | Response
> {
  const allow = parseAdminEmails(Deno.env.get("ADMIN_EMAILS"));
  if (allow.length === 0) {
    console.error("admin-site-banner: ADMIN_EMAILS empty");
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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: { code: "UNAUTHORIZED", message: "Missing JWT" } }, 401);
  }
  const jwt = authHeader.slice(7);

  const verifyClient = createClient(supabaseUrl, anonKey);
  const { data: userData, error: authErr } =
    await verifyClient.auth.getUser(jwt);
  if (authErr || !userData.user?.email) {
    return json(
      { error: { code: "UNAUTHORIZED", message: "Invalid session" } },
      401,
    );
  }
  const email = userData.user.email.toLowerCase();
  if (!allow.includes(email)) {
    return json({ error: { code: "FORBIDDEN", message: "Not an admin" } }, 403);
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) {
    return json(
      { error: { code: "SERVER_CONFIG", message: "Missing service role" } },
      500,
    );
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return { admin, email };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !anonKey) {
    return json(
      { error: { code: "SERVER_CONFIG", message: "Missing Supabase env" } },
      500,
    );
  }

  if (req.method === "GET") {
    const gate = await requireAdmin(req, supabaseUrl, anonKey);
    if (gate instanceof Response) return gate;
    const { admin } = gate;

    const { data, error } = await admin
      .from("app_config")
      .select("value, updated_at")
      .eq("config_key", CONFIG_KEY)
      .maybeSingle();

    if (error) {
      console.error("admin-site-banner get", error);
      return json(
        { error: { code: "DB_ERROR", message: error.message } },
        500,
      );
    }

    const banner = parseBannerValue(data?.value ?? null);
    return json({
      banner,
      updated_at: data?.updated_at ?? null,
    });
  }

  if (req.method === "PUT") {
    const gate = await requireAdmin(req, supabaseUrl, anonKey);
    if (gate instanceof Response) return gate;
    const { admin, email } = gate;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: { code: "BAD_JSON", message: "Invalid JSON" } }, 400);
    }

    if (!body || typeof body !== "object") {
      return json({ error: { code: "BAD_BODY", message: "Object body required" } }, 400);
    }

    const o = body as Record<string, unknown>;
    const enabled = Boolean(o.enabled);
    const message =
      typeof o.message === "string" ? o.message.trim() : "";
    const hrefRaw = o.href;
    const href =
      hrefRaw === null || hrefRaw === undefined
        ? null
        : typeof hrefRaw === "string"
          ? hrefRaw.trim() || null
          : null;

    if (message.length > MAX_MESSAGE_LEN) {
      return json(
        {
          error: {
            code: "VALIDATION",
            message: `message max ${MAX_MESSAGE_LEN} characters`,
          },
        },
        422,
      );
    }

    if (!isAllowedHref(href)) {
      return json(
        {
          error: {
            code: "VALIDATION",
            message:
              "href must be empty, a relative path starting with /, or http(s) URL",
          },
        },
        422,
      );
    }

    if (enabled && !message) {
      return json(
        {
          error: {
            code: "VALIDATION",
            message: "message required when enabled is true",
          },
        },
        422,
      );
    }

    const banner: SiteBannerPayload = enabled
      ? { enabled: true, message, href }
      : { enabled: false, message: "", href: null };

    const value = JSON.stringify(banner);
    const { error: upErr } = await admin.from("app_config").upsert(
      {
        config_key: CONFIG_KEY,
        value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "config_key" },
    );

    if (upErr) {
      console.error("admin-site-banner put", upErr);
      return json(
        { error: { code: "DB_ERROR", message: upErr.message } },
        500,
      );
    }

    return json({
      ok: true,
      banner,
      updated_by: email,
    });
  }

  return json({ error: { code: "METHOD_NOT_ALLOWED", message: "GET/PUT only" } }, 405);
});
