/**
 * Admin user search + detail — JWT + ADMIN_EMAILS + service_role.
 *
 * GET ?q=&limit=20           → { users: [...] }
 * GET ?id=<uuid>             → { profile, flags, paymentOrders, referralRewards, creditLedger }
 * POST { "id": "<uuid>" }    → same as GET ?id= (for supabase.functions.invoke)
 * POST { "q": "...", "limit"?: number } → search
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeadersForRequest } from "../_shared/cors.ts";
import { adminJson, isUuid, requireAdmin } from "../_shared/admin-auth.ts";
import {
  canUseBaziReading,
  canUseTieuVanReading,
  isNeverSubscribedUser,
  subscriptionActive,
  type ProfileEntitlements,
} from "../_shared/entitlements.ts";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const PROFILE_LIST_COLS =
  "id, email, display_name, subscription_expires_at, bazi_reading_unlocked_at, tieu_van_reading_expires_at, referral_code, referred_by, referral_reward_total_vnd, credits_balance, la_so_recompute_status, birth_edit_count, birth_edit_window_start, onboarding_completed_at, ngay_sinh, gio_sinh, gioi_tinh, created_at, updated_at, bazi_luan_click_count, tieu_van_luan_click_count, day_luan_follow_up_click_count";

function detailColumns(includeLaSo: boolean): string {
  return includeLaSo ? `${PROFILE_LIST_COLS}, la_so` : PROFILE_LIST_COLS;
}

function parseIncludeLaSo(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

type ProfileRow = ProfileEntitlements & {
  id: string;
  email: string | null;
  display_name: string | null;
  referral_code: string | null;
  referred_by: string | null;
  referral_reward_total_vnd: number | null;
  credits_balance: number | null;
  la_so_recompute_status: string | null;
  birth_edit_count: number | null;
  birth_edit_window_start: string | null;
  onboarding_completed_at: string | null;
  ngay_sinh: string | null;
  gio_sinh: string | null;
  gioi_tinh: string | null;
  created_at: string;
  updated_at: string;
  bazi_luan_click_count: number | null;
  tieu_van_luan_click_count: number | null;
  day_luan_follow_up_click_count: number | null;
  la_so?: unknown;
};

function computeFlags(profile: ProfileEntitlements) {
  return {
    subscriptionActive: subscriptionActive(profile.subscription_expires_at),
    canUseBaziReading: canUseBaziReading(profile),
    canUseTieuVanReading: canUseTieuVanReading(profile),
    isNeverSubscribed: isNeverSubscribedUser(profile),
  };
}

function clampLimit(raw: string | null, fallback = DEFAULT_LIMIT): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(1, n), MAX_LIMIT);
}

async function loadDayLuanAskCounts(
  admin: ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2.49.1").createClient>,
  userIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (userIds.length === 0) return map;

  const { data, error } = await admin.rpc("admin_day_luan_ask_counts", {
    p_user_ids: userIds,
  });
  if (error) throw error;

  for (const row of data ?? []) {
    const r = row as { user_id: string; ask_count: number | string };
    const n = typeof r.ask_count === "number"
      ? r.ask_count
      : Number.parseInt(String(r.ask_count), 10);
    map.set(r.user_id, Number.isFinite(n) ? n : 0);
  }
  return map;
}

async function searchUsers(
  admin: ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2.49.1").createClient>,
  q: string,
  limit: number,
) {
  const trimmed = q.trim();
  let query = admin
    .from("profiles")
    .select(PROFILE_LIST_COLS)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (trimmed) {
    if (isUuid(trimmed)) {
      query = query.eq("id", trimmed);
    } else if (/^[a-z0-9_-]+$/iu.test(trimmed) && trimmed.length <= 32) {
      query = query.eq("referral_code", trimmed.toLowerCase());
    } else {
      query = query.ilike("email", `%${trimmed.replaceAll("%", "")}%`);
    }
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as ProfileRow[];
  const askCounts = await loadDayLuanAskCounts(
    admin,
    rows.map((r) => r.id),
  );

  const users = rows.map((row) => ({
    ...row,
    flags: computeFlags(row),
    bazi_luan_click_count: row.bazi_luan_click_count ?? 0,
    tieu_van_luan_click_count: row.tieu_van_luan_click_count ?? 0,
    day_luan_follow_up_click_count: row.day_luan_follow_up_click_count ?? 0,
    day_luan_ai_ask_count: askCounts.get(row.id) ?? 0,
  }));

  return { users };
}

async function userDetail(
  admin: ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2.49.1").createClient>,
  userId: string,
  includeLaSo: boolean,
) {
  const { data: profile, error: pErr } = await admin
    .from("profiles")
    .select(detailColumns(includeLaSo))
    .eq("id", userId)
    .maybeSingle();

  if (pErr) throw pErr;
  if (!profile) {
    return null;
  }

  const row = profile as ProfileRow;

  const [
    { data: paymentOrders, error: oErr },
    { data: referralRewards, error: rErr },
    { data: creditLedger, error: lErr },
    { data: referredByProfile },
  ] = await Promise.all([
    admin
      .from("payment_orders")
      .select(
        "id, status, package_sku, list_amount_vnd, amount_vnd, coupon_code, checkout_referral_code, provider_order_code, created_at, updated_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),
    admin
      .from("referral_reward_events")
      .select(
        "id, referee_profile_id, payment_order_id, package_sku, reward_vnd, checkout_referral_code, created_at",
      )
      .eq("referrer_profile_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),
    admin
      .from("credit_ledger")
      .select("id, delta, balance_after, reason, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),
    row.referred_by
      ? admin
        .from("profiles")
        .select("id, email, referral_code")
        .eq("id", row.referred_by)
        .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (oErr) throw oErr;
  if (rErr) throw rErr;
  if (lErr) throw lErr;

  const askCounts = await loadDayLuanAskCounts(admin, [userId]);

  return {
    profile: row,
    flags: computeFlags(row),
    referrer: referredByProfile ?? null,
    bazi_luan_click_count: row.bazi_luan_click_count ?? 0,
    tieu_van_luan_click_count: row.tieu_van_luan_click_count ?? 0,
    day_luan_follow_up_click_count: row.day_luan_follow_up_click_count ?? 0,
    day_luan_ai_ask_count: askCounts.get(userId) ?? 0,
    paymentOrders: paymentOrders ?? [],
    referralRewards: referralRewards ?? [],
    creditLedger: creditLedger ?? [],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        ...corsHeadersForRequest(req),
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      },
    });
  }

  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;
  const { admin, cors } = auth;

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const id = url.searchParams.get("id")?.trim();
      if (id) {
        if (!isUuid(id)) {
          return adminJson(
            cors,
            { error: { code: "BAD_REQUEST", message: "id must be a UUID" } },
            400,
          );
        }
        const includeLaSo = parseIncludeLaSo(
          url.searchParams.get("includeLaSo"),
        );
        const detail = await userDetail(admin, id, includeLaSo);
        if (!detail) {
          return adminJson(
            cors,
            { error: { code: "NOT_FOUND", message: "User not found" } },
            404,
          );
        }
        return adminJson(cors, detail);
      }

      const q = url.searchParams.get("q") ?? "";
      const limit = clampLimit(url.searchParams.get("limit"));
      return adminJson(cors, await searchUsers(admin, q, limit));
    }

    if (req.method === "POST") {
      let body: {
        id?: string;
        q?: string;
        limit?: number;
        includeLaSo?: boolean;
      };
      try {
        body = (await req.json()) as {
          id?: string;
          q?: string;
          limit?: number;
          includeLaSo?: boolean;
        };
      } catch {
        return adminJson(
          cors,
          { error: { code: "BAD_REQUEST", message: "Invalid JSON" } },
          400,
        );
      }

      if (body.id) {
        if (!isUuid(body.id)) {
          return adminJson(
            cors,
            { error: { code: "BAD_REQUEST", message: "id must be a UUID" } },
            400,
          );
        }
        const detail = await userDetail(
          admin,
          body.id,
          body.includeLaSo === true,
        );
        if (!detail) {
          return adminJson(
            cors,
            { error: { code: "NOT_FOUND", message: "User not found" } },
            404,
          );
        }
        return adminJson(cors, detail);
      }

      const limit = typeof body.limit === "number"
        ? Math.min(Math.max(1, Math.floor(body.limit)), MAX_LIMIT)
        : DEFAULT_LIMIT;
      return adminJson(
        cors,
        await searchUsers(admin, body.q ?? "", limit),
      );
    }

    return adminJson(
      cors,
      { error: { code: "METHOD_NOT_ALLOWED", message: "GET/POST only" } },
      405,
    );
  } catch (e) {
    console.error("admin-users", e);
    return adminJson(
      cors,
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
