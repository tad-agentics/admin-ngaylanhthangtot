/** Direction C entitlement helpers — shared by bat-tu, generate-reading, payos-webhook. */

/** NLTT-only body flag on Tab Tra cứu `bat-tu` ops — REQ-NLTT-01; never forwarded upstream. */
export const BAT_TU_SOURCE_TRA_CUU = "tra_cuu";

export type ProfileEntitlements = {
  subscription_expires_at: string | null;
  bazi_reading_unlocked_at: string | null;
  tieu_van_reading_expires_at: string | null;
};

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
  profile: ProfileEntitlements,
): boolean {
  return profile.subscription_expires_at == null;
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
