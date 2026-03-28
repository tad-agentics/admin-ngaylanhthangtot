/**
 * Admin user ops — JWT + ADMIN_EMAILS + service_role.
 * POST JSON:
 *  { "action": "add_credits", "userId": "<uuid>", "delta": <positive int>, "reason"?: string }
 *     → RPC public.admin_grant_credits (atomic: profiles + credit_ledger). Cần migration SQL.
 *  { "action": "delete_user", "userId": "<uuid>" }
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

const MAX_CREDIT_GRANT = 1_000_000;

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

  let body: {
    action?: string;
    userId?: string;
    delta?: number;
    reason?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: { code: "BAD_REQUEST", message: "Invalid JSON" } }, 400);
  }

  const action = body.action;
  if (action !== "add_credits" && action !== "delete_user") {
    return json(
      {
        error: {
          code: "BAD_REQUEST",
          message: "action must be add_credits or delete_user",
        },
      },
      400,
    );
  }

  const userIdRes = requireUuid(body.userId, "userId");
  if (userIdRes instanceof Response) return userIdRes;
  const userId = userIdRes;

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    if (action === "delete_user") {
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

      const { error: delErr } = await admin.auth.admin.deleteUser(userId);
      if (delErr) throw delErr;
      return json({ ok: true, action: "delete_user", userId });
    }

    const deltaRaw = body.delta;
    if (typeof deltaRaw !== "number" || !Number.isInteger(deltaRaw)) {
      return json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "delta must be a positive integer",
          },
        },
        400,
      );
    }
    const delta = deltaRaw;
    if (delta <= 0 || delta > MAX_CREDIT_GRANT) {
      return json(
        {
          error: {
            code: "BAD_REQUEST",
            message: `delta must be between 1 and ${MAX_CREDIT_GRANT}`,
          },
        },
        400,
      );
    }

    const reason =
      typeof body.reason === "string" && body.reason.trim().length > 0
        ? body.reason.trim().slice(0, 200)
        : "admin_credit_grant";

    /* Một transaction DB: tránh race khi nhiều admin cùng nạp (admin_grant_credits). */
    const { data: newBalRaw, error: rpcErr } = await admin.rpc(
      "admin_grant_credits",
      {
        p_user_id: userId,
        p_delta: delta,
        p_reason: reason,
      },
    );

    if (rpcErr) {
      const msg = rpcErr.message ?? "";
      if (/profile_not_found/i.test(msg)) {
        return json(
          { error: { code: "NOT_FOUND", message: "Profile not found for userId" } },
          404,
        );
      }
      if (/invalid_delta/i.test(msg)) {
        return json(
          {
            error: {
              code: "BAD_REQUEST",
              message: `delta must be between 1 and ${MAX_CREDIT_GRANT}`,
            },
          },
          400,
        );
      }
      console.error("admin-user-actions: admin_grant_credits RPC failed", rpcErr);
      return json(
        {
          error: {
            code: "INTERNAL",
            message:
              `${msg || "admin_grant_credits failed"}. ` +
              `Apply migration supabase/migrations/20260328120000_admin_grant_credits.sql if missing.`,
          },
        },
        500,
      );
    }

    if (newBalRaw === null || newBalRaw === undefined) {
      return json(
        {
          error: {
            code: "INTERNAL",
            message: "admin_grant_credits returned no balance",
          },
        },
        500,
      );
    }

    const credits_balance =
      typeof newBalRaw === "bigint"
        ? Number(newBalRaw)
        : typeof newBalRaw === "number"
          ? newBalRaw
          : Number(String(newBalRaw));

    if (!Number.isFinite(credits_balance)) {
      return json(
        {
          error: {
            code: "INTERNAL",
            message: "Invalid balance returned from admin_grant_credits",
          },
        },
        500,
      );
    }

    return json({
      ok: true,
      action: "add_credits",
      userId,
      delta,
      credits_balance,
    });
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
