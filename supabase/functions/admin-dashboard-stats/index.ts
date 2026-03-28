/**
 * Admin dashboard aggregates — service_role + email allowlist (ADMIN_EMAILS).
 * Deploy: set secret ADMIN_EMAILS=comma-separated lowercased emails.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUB_SKUS = new Set(["goi_6thang", "goi_12thang"]);

type RowPay = {
  amount_vnd: number | null;
  created_at: string;
  package_sku: string;
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

async function fetchAllPaidOrders(
  admin: ReturnType<typeof createClient>,
): Promise<RowPay[]> {
  const out: RowPay[] = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from("payment_orders")
      .select("amount_vnd, created_at, package_sku")
      .eq("status", "paid")
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    out.push(...(data as RowPay[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : current < 0 ? -100 : 0;
  return ((current - previous) / previous) * 100;
}

function formatPct(p: number | null): string {
  if (p === null) return "—";
  const sign = p >= 0 ? "+" : "";
  return `${sign}${p.toFixed(1).replace(".", ",")}%`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return json(
      { error: { code: "METHOD_NOT_ALLOWED", message: "GET/POST only" } },
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
    console.error("admin-dashboard-stats: ADMIN_EMAILS empty");
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
    return json({ error: { code: "FORBIDDEN", message: "Not an admin" } }, 403);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const thirtyIso = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const sixtyIso = new Date(
      Date.now() - 60 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const [{ count: profilesCount, error: pErr }, paidOrders] = await Promise.all([
      admin.from("profiles").select("*", { count: "exact", head: true }),
      fetchAllPaidOrders(admin),
    ]);

    if (pErr) throw pErr;

    const { count: newProfilesLast30, error: n30Err } = await admin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gte("created_at", thirtyIso);
    if (n30Err) throw n30Err;

    const { count: newProfilesPrev30, error: nPrevErr } = await admin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gte("created_at", sixtyIso)
      .lt("created_at", thirtyIso);
    if (nPrevErr) throw nPrevErr;

    const totalRevenueVnd = paidOrders.reduce(
      (s, r) => s + (r.amount_vnd ?? 0),
      0,
    );
    const paidOrdersCount = paidOrders.length;

    const now = new Date();
    const cy = now.getFullYear();
    const cm = now.getMonth();
    const pm = cm === 0 ? 11 : cm - 1;
    const py = cm === 0 ? cy - 1 : cy;

    let revenueThisMonth = 0;
    let revenuePrevMonth = 0;
    let ordersThisMonth = 0;
    let ordersPrevMonth = 0;

    for (const r of paidOrders) {
      const d = new Date(r.created_at);
      const y = d.getFullYear();
      const m = d.getMonth();
      const v = r.amount_vnd ?? 0;
      if (y === cy && m === cm) {
        revenueThisMonth += v;
        ordersThisMonth += 1;
      } else if (y === py && m === pm) {
        revenuePrevMonth += v;
        ordersPrevMonth += 1;
      }
    }

    const monthKeys: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(cy, cm - i, 1);
      monthKeys.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      );
    }

    const buckets = new Map<string, { le: number; subscription: number }>();
    for (const k of monthKeys) {
      buckets.set(k, { le: 0, subscription: 0 });
    }

    for (const r of paidOrders) {
      const d = new Date(r.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!buckets.has(key)) continue;
      const b = buckets.get(key)!;
      const v = r.amount_vnd ?? 0;
      if (SUB_SKUS.has(r.package_sku)) {
        b.subscription += v;
      } else {
        b.le += v;
      }
    }

    const monthly = monthKeys.map((key) => {
      const b = buckets.get(key)!;
      const [y, m] = key.split("-").map(Number);
      const d = new Date(y, m - 1, 1);
      const label = d.toLocaleString("en-US", { month: "short" }).toUpperCase();
      return {
        key,
        label,
        leRevenueVnd: b.le,
        subscriptionRevenueVnd: b.subscription,
        leM: b.le / 1_000_000,
        subscriptionM: b.subscription / 1_000_000,
      };
    });

    const maxStackM = Math.max(
      0.000_001,
      ...monthly.map((m) => m.leM + m.subscriptionM),
    );

    const newU = newProfilesLast30 ?? 0;
    const newPrev = newProfilesPrev30 ?? 0;

    return json({
      totals: {
        totalRevenueVnd,
        paidOrdersCount,
        profilesCount: profilesCount ?? 0,
        newProfilesLast30Days: newU,
        revenueMomPct: formatPct(pctChange(revenueThisMonth, revenuePrevMonth)),
        ordersMomPct: formatPct(pctChange(ordersThisMonth, ordersPrevMonth)),
        newUsersMomPct: formatPct(pctChange(newU, newPrev)),
      },
      monthly,
      chartScaleMaxM: maxStackM,
    });
  } catch (e) {
    console.error("admin-dashboard-stats", e);
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
