/**
 * Admin dashboard aggregates — service_role + ADMIN_EMAILS.
 * Uses admin_dashboard_stats_snapshot() RPC (single DB round-trip).
 * In-memory cache (60s) per edge isolate — dashboard stats are not real-time.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminJson, requireAdmin } from "../_shared/admin-auth.ts";
import { corsHeadersForRequest } from "../_shared/cors.ts";

const CACHE_TTL_MS = 60_000;

type CachedBody = Record<string, unknown>;
let statsCache: { at: number; body: CachedBody } | null = null;

function readCache(): CachedBody | null {
  if (!statsCache) return null;
  if (Date.now() - statsCache.at >= CACHE_TTL_MS) {
    statsCache = null;
    return null;
  }
  return statsCache.body;
}

function writeCache(body: CachedBody): void {
  statsCache = { at: Date.now(), body };
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

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function bucketVnd(raw: unknown): {
  subscription: number;
  addon: number;
  legacy: number;
} {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    subscription: num(o.subscription),
    addon: num(o.addon),
    legacy: num(o.legacy),
  };
}

function buildPayload(snap: Record<string, unknown>): CachedBody {
  const revenueByBucketVnd = bucketVnd(snap.revenueByBucketVnd);
  const ordersBySku =
    snap.ordersBySku && typeof snap.ordersBySku === "object"
      ? (snap.ordersBySku as Record<string, number>)
      : {};

  const newU = num(snap.newProfilesLast30Days);
  const newPrev = num(snap.newProfilesPrev30);

  return {
    totals: {
      totalRevenueVnd: num(snap.totalRevenueVnd),
      paidOrdersCount: num(snap.paidOrdersCount),
      profilesCount: num(snap.profilesCount),
      newProfilesLast30Days: newU,
      activeSubscribers: num(snap.activeSubscribers),
      expiredSubscribers: num(snap.expiredSubscribers),
      neverSubscribed: num(snap.neverSubscribed),
      baziReadingUnlocked: num(snap.baziReadingUnlocked),
      tieuVanReadingActive: num(snap.tieuVanReadingActive),
      revenueByBucketVnd,
      ordersBySku,
      revenueMomPct: formatPct(
        pctChange(num(snap.revenueThisMonth), num(snap.revenuePrevMonth)),
      ),
      ordersMomPct: formatPct(
        pctChange(num(snap.ordersThisMonth), num(snap.ordersPrevMonth)),
      ),
      newUsersMomPct: formatPct(pctChange(newU, newPrev)),
    },
    monthly: Array.isArray(snap.monthly) ? snap.monthly : [],
    chartScaleMaxM: num(snap.chartScaleMaxM) || 0.000_001,
  };
}

function corsFor(req: Request): Record<string, string> {
  return {
    ...corsHeadersForRequest(req),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

Deno.serve(async (req) => {
  const cors = corsFor(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return adminJson(
      cors,
      { error: { code: "METHOD_NOT_ALLOWED", message: "GET/POST only" } },
      405,
    );
  }

  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;
  const { admin, cors: authCors } = auth;

  const cached = readCache();
  if (cached) {
    return adminJson(authCors, cached, 200, {
      "Cache-Control": "private, max-age=60",
    });
  }

  try {
    const { data: snap, error: rpcErr } = await admin.rpc(
      "admin_dashboard_stats_snapshot",
    );
    if (rpcErr) throw rpcErr;
    if (!snap || typeof snap !== "object") {
      throw new Error(
        "admin_dashboard_stats_snapshot missing — apply migration 20260531220000",
      );
    }

    const body = buildPayload(snap as Record<string, unknown>);
    writeCache(body);
    return adminJson(authCors, body, 200, {
      "Cache-Control": "private, max-age=60",
    });
  } catch (e) {
    console.error("admin-dashboard-stats", e);
    return adminJson(
      authCors,
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
