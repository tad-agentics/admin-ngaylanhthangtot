import {
  adminFunctionGet,
  adminFunctionPost,
} from "~/lib/admin-functions";

export type AdminUserFlags = {
  subscriptionActive: boolean;
  canUseBaziReading: boolean;
  isNeverSubscribed: boolean;
  hasOnboardingTrialAccess: boolean;
  trialExhausted: boolean;
  canAccessPaidCalendar: boolean;
};

export type AdminUserQuotaSnapshot = {
  trialMax: number;
  trialUsed: number;
  trialRemaining: number;
  dailyMax: number;
  dailyCountToday: number;
  dailyRemainingToday: number;
  /** min(daily, trial) for never-sub; daily only when subscribed. */
  effectiveRemaining: number;
  vnDateToday: string;
};

export type AdminTraCuuThreadSummary = {
  id: string;
  session_key: string;
  follow_up_count: number;
  has_anchor_intro: boolean;
  anchor_intro_preview: string;
  created_at: string;
  updated_at: string;
};

export type AdminDayLuanThreadSummary = {
  id: string;
  day_iso: string;
  follow_up_count: number;
  created_at: string;
  updated_at: string;
};

export type AdminUserListItem = {
  id: string;
  email: string | null;
  display_name: string | null;
  subscription_expires_at: string | null;
  bazi_reading_unlocked_at: string | null;
  referral_code: string | null;
  referred_by: string | null;
  referral_reward_total_vnd: number | null;
  created_at: string;
  flags: AdminUserFlags;
  /** Tổng lifetime: mở luận la-so-chi-tiet (có quyền, không preview). */
  bazi_luan_click_count: number;
  /** Tổng lifetime: bấm CTA "Hỏi tiếp về ngày này". */
  day_luan_follow_up_click_count: number;
  /** Completed follow-up asks in luận ngày (day-luan-chat). */
  day_luan_ai_ask_count: number;
  onboarding_trial_questions_used?: number;
};

export type UserEngagementSort =
  | "created_at"
  | "bazi_luan"
  | "day_luan_follow_up";

export type UserSearchSortOrder = "asc" | "desc";

export type AdminUserSearchParams = {
  q?: string;
  limit?: number;
  offset?: number;
  sort?: UserEngagementSort;
  order?: UserSearchSortOrder;
};

export type AdminUserSearchResponse = {
  users: AdminUserListItem[];
  total: number;
  limit: number;
  offset: number;
};

export type AdminPaymentOrderSummary = {
  id: string;
  status: string;
  package_sku: string;
  list_amount_vnd: number | null;
  amount_vnd: number | null;
  coupon_code: string | null;
  checkout_referral_code: string | null;
  provider_order_code: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminUserDetailResponse = {
  profile: AdminUserListItem & {
    la_so_recompute_status: string | null;
    birth_edit_count: number | null;
    birth_edit_window_start: string | null;
    onboarding_completed_at: string | null;
    onboarding_trial_questions_used: number | null;
    ngay_sinh: string | null;
    gio_sinh: string | null;
    gioi_tinh: string | null;
    updated_at: string;
    la_so?: unknown;
  };
  flags: AdminUserFlags;
  quota: AdminUserQuotaSnapshot;
  bazi_luan_click_count: number;
  day_luan_follow_up_click_count: number;
  day_luan_ai_ask_count: number;
  tra_cuu_ai_ask_count: number;
  traCuuThreads: AdminTraCuuThreadSummary[];
  dayLuanThreads: AdminDayLuanThreadSummary[];
  referrer: { id: string; email: string | null; referral_code: string | null } | null;
  paymentOrders: AdminPaymentOrderSummary[];
  referralRewards: {
    id: string;
    referee_profile_id: string;
    payment_order_id: string;
    package_sku: string;
    reward_vnd: number;
    checkout_referral_code: string | null;
    created_at: string;
  }[];
};

function normalizeFlags(raw: Partial<AdminUserFlags> | undefined): AdminUserFlags {
  return {
    subscriptionActive: raw?.subscriptionActive ?? false,
    canUseBaziReading: raw?.canUseBaziReading ?? false,
    isNeverSubscribed: raw?.isNeverSubscribed ?? false,
    hasOnboardingTrialAccess: raw?.hasOnboardingTrialAccess ?? false,
    trialExhausted: raw?.trialExhausted ?? false,
    canAccessPaidCalendar: raw?.canAccessPaidCalendar ?? false,
  };
}

export async function searchAdminUsers(
  params: AdminUserSearchParams,
): Promise<AdminUserSearchResponse> {
  const limit = params.limit ?? 20;
  const offset = params.offset ?? 0;
  const payload = await adminFunctionGet<AdminUserSearchResponse>(
    "admin-users",
    {
      q: params.q?.trim() ?? "",
      limit,
      offset,
      sort: params.sort ?? "created_at",
      order: params.order ?? "desc",
    },
  );

  if (!payload?.users || !Array.isArray(payload.users)) {
    throw new Error("Phản hồi không hợp lệ");
  }

  return {
    users: payload.users.map((u) => ({
      ...u,
      flags: normalizeFlags(u.flags),
    })),
    total:
      typeof payload.total === "number" && Number.isFinite(payload.total)
        ? payload.total
        : payload.users.length,
    limit:
      typeof payload.limit === "number" && Number.isFinite(payload.limit)
        ? payload.limit
        : limit,
    offset:
      typeof payload.offset === "number" && Number.isFinite(payload.offset)
        ? payload.offset
        : offset,
  };
}

function normalizeUserDetail(
  raw: AdminUserDetailResponse,
): AdminUserDetailResponse {
  const trialUsed = Math.max(
    0,
    Math.floor(raw.profile.onboarding_trial_questions_used ?? 0),
  );
  const trialMax = raw.quota?.trialMax ?? 5;
  const trialRemaining = Math.max(0, trialMax - trialUsed);
  const dailyMax = raw.quota?.dailyMax ?? 10;
  const dailyRemainingToday = raw.quota?.dailyRemainingToday ?? dailyMax;
  const isNeverSub = raw.flags?.isNeverSubscribed ?? false;
  const effectiveRemaining =
    raw.quota?.effectiveRemaining ??
    (isNeverSub && trialRemaining > 0
      ? Math.min(dailyRemainingToday, trialRemaining)
      : isNeverSub
        ? 0
        : dailyRemainingToday);
  const vnDateToday =
    raw.quota?.vnDateToday ??
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  return {
    ...raw,
    flags: normalizeFlags(raw.flags),
    quota: {
      trialMax: raw.quota?.trialMax ?? trialMax,
      trialUsed: raw.quota?.trialUsed ?? trialUsed,
      trialRemaining: raw.quota?.trialRemaining ?? trialRemaining,
      dailyMax: raw.quota?.dailyMax ?? dailyMax,
      dailyCountToday: raw.quota?.dailyCountToday ?? 0,
      dailyRemainingToday: raw.quota?.dailyRemainingToday ?? dailyRemainingToday,
      effectiveRemaining,
      vnDateToday,
    },
    tra_cuu_ai_ask_count: raw.tra_cuu_ai_ask_count ?? 0,
    traCuuThreads: raw.traCuuThreads ?? [],
    dayLuanThreads: raw.dayLuanThreads ?? [],
  };
}

export async function fetchAdminUserDetail(
  userId: string,
  options?: { includeLaSo?: boolean },
): Promise<AdminUserDetailResponse> {
  const raw = await adminFunctionGet<AdminUserDetailResponse>("admin-users", {
    id: userId,
    ...(options?.includeLaSo ? { includeLaSo: "1" } : {}),
  });
  return normalizeUserDetail(raw);
}

export type PatchEntitlementsBody = {
  userId: string;
  subscriptionExpiresAt?: string | null;
  baziReadingUnlock?: boolean;
  adminNote: string;
};

export type PatchEntitlementsResponse = {
  ok: true;
  profile: {
    id: string;
    email: string | null;
    subscription_expires_at: string | null;
    bazi_reading_unlocked_at: string | null;
  };
  auditedBy: string;
};

export async function patchAdminUserEntitlements(
  body: PatchEntitlementsBody,
): Promise<PatchEntitlementsResponse> {
  return adminFunctionPost<PatchEntitlementsResponse>(
    "admin-user-entitlements",
    body,
    "POST",
  );
}
