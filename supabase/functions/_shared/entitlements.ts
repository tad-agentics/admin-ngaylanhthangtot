/** Direction C entitlement helpers — shared by bat-tu, generate-reading, payos-webhook. */

/** NLTT-only body flag on Tab Tra cứu `bat-tu` ops — REQ-NLTT-01; never forwarded upstream. */
export const BAT_TU_SOURCE_TRA_CUU = "tra_cuu";

export type ProfileEntitlements = {
  subscription_expires_at: string | null;
  bazi_reading_unlocked_at: string | null;
  tieu_van_reading_expires_at: string | null;
};

export type ProfileTrialEntitlements = ProfileEntitlements & {
  onboarding_trial_questions_used?: number | null;
};

/** Default when `app_config.onboarding_trial_questions_max` is unset. */
export const DEFAULT_ONBOARDING_TRIAL_QUESTIONS_MAX = 5;

/** Shared daily chat pool cap (luận ngày + tra cứu). */
export const MAX_DAILY_CHAT_TURNS = 10;

export function subscriptionActive(
  expires: string | null | undefined,
): boolean {
  if (!expires) return false;
  return new Date(expires) > new Date();
}

export function canUseCalendar(profile: ProfileEntitlements): boolean {
  return subscriptionActive(profile.subscription_expires_at);
}

/** Chưa từng đăng ký gói — cho phép đọc lịch teaser (không chặn 402 như hết hạn). */
export function isNeverSubscribedUser(
  profile: ProfileEntitlements | null | undefined,
): boolean {
  if (!profile) return false;
  return profile.subscription_expires_at == null;
}

export function onboardingTrialQuestionsUsed(
  profile: ProfileTrialEntitlements | null | undefined,
): number {
  const raw = profile?.onboarding_trial_questions_used ?? 0;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.floor(raw));
}

/** Min(daily remaining, trial remaining) for never-sub; else daily only. */
export function effectiveChatQuotaRemaining(
  profile: ProfileTrialEntitlements | null | undefined,
  dailyRemaining: number,
  max = DEFAULT_ONBOARDING_TRIAL_QUESTIONS_MAX,
): number {
  const daily = Math.max(0, dailyRemaining);
  if (!profile) return 0;
  const trialRem = onboardingTrialQuestionsRemaining(profile, max);
  if (isNeverSubscribedUser(profile)) {
    return trialRem > 0 ? Math.min(daily, trialRem) : 0;
  }
  return daily;
}

export function onboardingTrialQuestionsRemaining(
  profile: ProfileTrialEntitlements | null | undefined,
  max = DEFAULT_ONBOARDING_TRIAL_QUESTIONS_MAX,
): number {
  if (!profile || !isNeverSubscribedUser(profile)) return 0;
  const cap = max > 0 ? max : DEFAULT_ONBOARDING_TRIAL_QUESTIONS_MAX;
  return Math.max(0, cap - onboardingTrialQuestionsUsed(profile));
}

export function hasOnboardingTrialAccess(
  profile: ProfileTrialEntitlements | null | undefined,
  max = DEFAULT_ONBOARDING_TRIAL_QUESTIONS_MAX,
): boolean {
  return onboardingTrialQuestionsRemaining(profile, max) > 0;
}

export function canAccessPaidCalendar(
  profile: ProfileTrialEntitlements | null | undefined,
  max = DEFAULT_ONBOARDING_TRIAL_QUESTIONS_MAX,
): boolean {
  if (!profile) return false;
  return canUseCalendar(profile) || hasOnboardingTrialAccess(profile, max);
}

export function isTraCuuPickChonNgay(
  op: string,
  body: Record<string, unknown>,
): boolean {
  if (String(body.source ?? "").toLowerCase() !== BAT_TU_SOURCE_TRA_CUU) {
    return false;
  }
  return op === "chon-ngay" || op === "hop-tuoi";
}

export function canUseBaziReading(profile: ProfileEntitlements): boolean {
  if (subscriptionActive(profile.subscription_expires_at)) {
    const exp = profile.subscription_expires_at
      ? new Date(profile.subscription_expires_at)
      : null;
    if (exp) {
      const months =
        (exp.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30);
      if (months >= 11) return true;
    }
  }
  return profile.bazi_reading_unlocked_at != null;
}

export function canUseTieuVanReading(profile: ProfileEntitlements): boolean {
  if (subscriptionActive(profile.subscription_expires_at)) {
    const exp = profile.subscription_expires_at
      ? new Date(profile.subscription_expires_at)
      : null;
    if (exp) {
      const months =
        (exp.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30);
      if (months >= 11) return true;
    }
  }
  if (!profile.tieu_van_reading_expires_at) return false;
  return new Date(profile.tieu_van_reading_expires_at) > new Date();
}

/** Stack subscription months from max(now, current expiry). */
export function extendSubscriptionMonths(
  currentExpires: string | null,
  months: number,
): string {
  const now = new Date();
  const current = currentExpires ? new Date(currentExpires) : null;
  const base = current && current > now ? current : now;
  const next = new Date(base);
  next.setMonth(next.getMonth() + months);
  return next.toISOString();
}

export function applyYearlyBundleLuận(profile: ProfileEntitlements): {
  bazi_reading_unlocked_at: string;
  tieu_van_reading_expires_at: string;
} {
  const now = new Date().toISOString();
  const tieuBase = profile.tieu_van_reading_expires_at
    ? new Date(profile.tieu_van_reading_expires_at)
    : new Date();
  const tieuFrom = tieuBase > new Date() ? tieuBase : new Date();
  const tieuNext = new Date(tieuFrom);
  tieuNext.setFullYear(tieuNext.getFullYear() + 1);
  return {
    bazi_reading_unlocked_at: profile.bazi_reading_unlocked_at ?? now,
    tieu_van_reading_expires_at: tieuNext.toISOString(),
  };
}
