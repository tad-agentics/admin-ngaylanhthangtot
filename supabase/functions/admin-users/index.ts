/**
 * Admin user search + detail — JWT + ADMIN_EMAILS + service_role.
 *
 * GET ?q=&limit=20&offset=0&sort=created_at&order=desc
 *   → { users, total, limit, offset }
 * GET ?id=<uuid>             → { profile, flags, quota, paymentOrders, referralRewards, chat debug }
 * POST { "id": "<uuid>" }    → same as GET ?id= (for supabase.functions.invoke)
 * POST { "q": "...", "limit"?: number } → search
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { readOnboardingTrialQuestionsMax } from "../_shared/app-config-read.ts";
import { corsHeadersForRequest } from "../_shared/cors.ts";
import { adminJson, isUuid, requireAdmin } from "../_shared/admin-auth.ts";
import {
  canAccessPaidCalendar,
  canUseBaziReading,
  effectiveChatQuotaRemaining,
  hasOnboardingTrialAccess,
  isNeverSubscribedUser,
  MAX_DAILY_CHAT_TURNS,
  onboardingTrialQuestionsRemaining,
  onboardingTrialQuestionsUsed,
  subscriptionActive,
  type ProfileEntitlements,
  type ProfileTrialEntitlements,
} from "../_shared/entitlements.ts";
import { todayIsoVietnam } from "../_shared/vn-dates.ts";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const PROFILE_LIST_COLS =
  "id, email, display_name, subscription_expires_at, bazi_reading_unlocked_at, referral_code, referred_by, referral_reward_total_vnd, credits_balance, onboarding_trial_questions_used, la_so_recompute_status, birth_edit_count, birth_edit_window_start, onboarding_completed_at, ngay_sinh, gio_sinh, gioi_tinh, created_at, updated_at, bazi_luan_click_count, day_luan_follow_up_click_count";

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
  day_luan_follow_up_click_count: number | null;
  onboarding_trial_questions_used: number | null;
  la_so?: unknown;
};

function computeFlags(profile: ProfileTrialEntitlements, trialMax: number) {
  const neverSub = isNeverSubscribedUser(profile);
  const trialRemaining = onboardingTrialQuestionsRemaining(profile, trialMax);
  return {
    subscriptionActive: subscriptionActive(profile.subscription_expires_at),
    canUseBaziReading: canUseBaziReading(profile),
    isNeverSubscribed: neverSub,
    hasOnboardingTrialAccess: hasOnboardingTrialAccess(profile, trialMax),
    trialExhausted: neverSub && trialRemaining === 0,
    canAccessPaidCalendar: canAccessPaidCalendar(profile, trialMax),
  };
}

function buildQuotaSnapshot(
  profile: ProfileTrialEntitlements,
  trialMax: number,
  dailyCountToday: number,
) {
  const trialUsed = onboardingTrialQuestionsUsed(profile);
  const trialRemaining = onboardingTrialQuestionsRemaining(profile, trialMax);
  const dailyCount = Math.max(0, Math.min(MAX_DAILY_CHAT_TURNS, dailyCountToday));
  const dailyRemainingToday = Math.max(0, MAX_DAILY_CHAT_TURNS - dailyCount);
  return {
    trialMax,
    trialUsed,
    trialRemaining,
    dailyMax: MAX_DAILY_CHAT_TURNS,
    dailyCountToday: dailyCount,
    dailyRemainingToday,
    effectiveRemaining: effectiveChatQuotaRemaining(
      profile,
      dailyRemainingToday,
      trialMax,
    ),
    vnDateToday: todayIsoVietnam(),
  };
}

function clampLimit(raw: string | null, fallback = DEFAULT_LIMIT): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(1, n), MAX_LIMIT);
}

function clampOffset(raw: string | null): number {
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 50_000);
}

type SortField =
  | "created_at"
  | "bazi_luan"
  | "day_luan_follow_up"
  | "onboarding_trial";

const SORT_COLUMNS: Record<SortField, string> = {
  created_at: "created_at",
  bazi_luan: "bazi_luan_click_count",
  day_luan_follow_up: "day_luan_follow_up_click_count",
  onboarding_trial: "onboarding_trial_questions_used",
};

function parseSort(raw: string | null | undefined): SortField {
  const v = raw?.trim().toLowerCase();
  if (v === "bazi_luan" || v === "bazi" || v === "bazi_luan_click_count") {
    return "bazi_luan";
  }
  if (
    v === "day_luan_follow_up" || v === "day_luan" ||
    v === "day_luan_follow_up_click_count"
  ) {
    return "day_luan_follow_up";
  }
  if (
    v === "onboarding_trial" || v === "trial" ||
    v === "onboarding_trial_questions_used"
  ) {
    return "onboarding_trial";
  }
  return "created_at";
}

function parseAscending(raw: string | null | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  if (v === "asc") return true;
  if (v === "desc") return false;
  return false;
}

type SearchOpts = {
  q: string;
  limit: number;
  offset: number;
  sort: SortField;
  ascending: boolean;
};

async function loadTraCuuAskCount(
  admin: ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2.49.1").createClient>,
  userId: string,
): Promise<number> {
  const { count, error } = await admin
    .from("tra_cuu_results_ask_idempotency")
    .select("id, tra_cuu_results_threads!inner(user_id)", {
      count: "exact",
      head: true,
    })
    .eq("status", "done")
    .eq("tra_cuu_results_threads.user_id", userId);
  if (error) throw error;
  return count ?? 0;
}

async function loadDailyCountToday(
  admin: ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2.49.1").createClient>,
  userId: string,
  vnDate: string,
): Promise<number> {
  const { data, error } = await admin.rpc("get_day_luan_daily_count", {
    p_user: userId,
    p_vn_date: vnDate,
  });
  if (error) throw error;
  const n = typeof data === "number" ? data : Number.parseInt(String(data ?? 0), 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
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
  opts: SearchOpts,
) {
  const trimmed = opts.q.trim();
  const sortCol = SORT_COLUMNS[opts.sort];

  let query = admin.from("profiles").select(PROFILE_LIST_COLS, {
    count: "exact",
  });

  if (opts.sort === "created_at") {
    query = query.order("created_at", { ascending: opts.ascending });
  } else {
    query = query
      .order(sortCol, { ascending: opts.ascending })
      .order("created_at", { ascending: false });
  }

  if (trimmed) {
    if (isUuid(trimmed)) {
      query = query.eq("id", trimmed);
    } else if (/^[a-z0-9_-]+$/iu.test(trimmed) && trimmed.length <= 32) {
      query = query.eq("referral_code", trimmed.toLowerCase());
    } else {
      const escaped = trimmed
        .replaceAll("\\", "\\\\")
        .replaceAll("%", "\\%")
        .replaceAll("_", "\\_");
      query = query.ilike("email", `%${escaped}%`);
    }
  }

  const { data, error, count } = await query.range(
    opts.offset,
    opts.offset + opts.limit - 1,
  );
  if (error) throw error;

  const rows = (data ?? []) as ProfileRow[];
  const [askCounts, trialMax] = await Promise.all([
    loadDayLuanAskCounts(admin, rows.map((r) => r.id)),
    readOnboardingTrialQuestionsMax(admin),
  ]);

  const users = rows.map((row) => ({
    ...row,
    flags: computeFlags(row, trialMax),
    quota: {
      trialMax,
      trialUsed: onboardingTrialQuestionsUsed(row),
      trialRemaining: onboardingTrialQuestionsRemaining(row, trialMax),
    },
    bazi_luan_click_count: row.bazi_luan_click_count ?? 0,
    day_luan_follow_up_click_count: row.day_luan_follow_up_click_count ?? 0,
    day_luan_ai_ask_count: askCounts.get(row.id) ?? 0,
  }));

  return {
    users,
    total: count ?? users.length,
    limit: opts.limit,
    offset: opts.offset,
  };
}

function searchOptsFromQuery(
  q: string,
  limitRaw: string | null,
  offsetRaw: string | null,
  sortRaw: string | null,
  orderRaw: string | null,
): SearchOpts {
  const sort = parseSort(sortRaw);
  return {
    q,
    limit: clampLimit(limitRaw),
    offset: clampOffset(offsetRaw),
    sort,
    ascending: parseAscending(orderRaw),
  };
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
  const vnToday = todayIsoVietnam();

  const [
    trialMax,
    { data: paymentOrders, error: oErr },
    { data: referralRewards, error: rErr },
    { data: referredByProfile },
    { data: traCuuThreads, error: tcErr },
    { data: dayLuanThreads, error: dlErr },
    { data: trialEvents, error: teErr },
    dailyCountToday,
    traCuuAskCount,
    askCounts,
  ] = await Promise.all([
    readOnboardingTrialQuestionsMax(admin),
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
    row.referred_by
      ? admin
        .from("profiles")
        .select("id, email, referral_code")
        .eq("id", row.referred_by)
        .maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from("tra_cuu_results_threads")
      .select(
        "id, session_key, follow_up_count, anchor_intro, created_at, updated_at",
      )
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(15),
    admin
      .from("day_luan_threads")
      .select("id, day_iso, follow_up_count, created_at, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(15),
    admin
      .from("onboarding_trial_question_events")
      .select("id, source, context, turn_number, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(25),
    loadDailyCountToday(admin, userId, vnToday),
    loadTraCuuAskCount(admin, userId),
    loadDayLuanAskCounts(admin, [userId]),
  ]);

  if (oErr) throw oErr;
  if (rErr) throw rErr;
  if (tcErr) throw tcErr;
  if (dlErr) throw dlErr;
  if (teErr) throw teErr;

  const traCuuThreadsOut = (traCuuThreads ?? []).map((t) => {
    const rec = t as {
      id: string;
      session_key: string;
      follow_up_count: number;
      anchor_intro: string;
      created_at: string;
      updated_at: string;
    };
    const intro = String(rec.anchor_intro ?? "");
    return {
      id: rec.id,
      session_key: rec.session_key,
      follow_up_count: rec.follow_up_count ?? 0,
      has_anchor_intro: intro.trim().length > 0,
      anchor_intro_preview: intro.trim().slice(0, 120),
      created_at: rec.created_at,
      updated_at: rec.updated_at,
    };
  });

  return {
    profile: row,
    flags: computeFlags(row, trialMax),
    quota: buildQuotaSnapshot(row, trialMax, dailyCountToday),
    referrer: referredByProfile ?? null,
    bazi_luan_click_count: row.bazi_luan_click_count ?? 0,
    day_luan_follow_up_click_count: row.day_luan_follow_up_click_count ?? 0,
    day_luan_ai_ask_count: askCounts.get(userId) ?? 0,
    tra_cuu_ai_ask_count: traCuuAskCount,
    traCuuThreads: traCuuThreadsOut,
    dayLuanThreads: dayLuanThreads ?? [],
    trialEvents: (trialEvents ?? []).map((e) => {
      const rec = e as {
        id: string;
        source: string;
        context: Record<string, unknown> | null;
        turn_number: number;
        created_at: string;
      };
      return {
        id: rec.id,
        source: rec.source,
        context: rec.context,
        turn_number: rec.turn_number,
        created_at: rec.created_at,
      };
    }),
    paymentOrders: paymentOrders ?? [],
    referralRewards: referralRewards ?? [],
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
      const opts = searchOptsFromQuery(
        q,
        url.searchParams.get("limit"),
        url.searchParams.get("offset"),
        url.searchParams.get("sort"),
        url.searchParams.get("order"),
      );
      return adminJson(cors, await searchUsers(admin, opts));
    }

    if (req.method === "POST") {
      let body: {
        id?: string;
        q?: string;
        limit?: number;
        offset?: number;
        sort?: string;
        order?: string;
        includeLaSo?: boolean;
      };
      try {
        body = (await req.json()) as {
          id?: string;
          q?: string;
          limit?: number;
          offset?: number;
          sort?: string;
          order?: string;
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

      const sort = parseSort(body.sort);
      const opts: SearchOpts = {
        q: body.q ?? "",
        limit: typeof body.limit === "number"
          ? Math.min(Math.max(1, Math.floor(body.limit)), MAX_LIMIT)
          : DEFAULT_LIMIT,
        offset: typeof body.offset === "number" && body.offset >= 0
          ? Math.floor(body.offset)
          : 0,
        sort,
        ascending: parseAscending(body.order),
      };
      return adminJson(cors, await searchUsers(admin, opts));
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
