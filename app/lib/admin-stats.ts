import { adminFunctionGet } from "~/lib/admin-functions";

export type RevenueBucketVnd = {
  subscription: number;
  addon: number;
  legacy: number;
};

export type AdminMonthlyDatum = {
  key: string;
  label: string;
  subscriptionRevenueVnd: number;
  addonRevenueVnd: number;
  legacyRevenueVnd: number;
  subscriptionM: number;
  addonM: number;
  legacyM: number;
  /** @deprecated alias of legacyRevenueVnd */
  leRevenueVnd?: number;
  leM?: number;
};

export type AdminDashboardPayload = {
  totals: {
    totalRevenueVnd: number;
    paidOrdersCount: number;
    profilesCount: number;
    newProfilesLast30Days: number;
    activeSubscribers: number;
    expiredSubscribers: number;
    neverSubscribed: number;
    baziReadingUnlocked: number;
    onboardingTrialActive: number;
    onboardingTrialExhausted: number;
    traCuuThreadsLast30d: number;
    traCuuAnchorsLast30d: number;
    revenueByBucketVnd: RevenueBucketVnd;
    ordersBySku: Record<string, number>;
    revenueMomPct: string;
    ordersMomPct: string;
    newUsersMomPct: string;
  };
  monthly: AdminMonthlyDatum[];
  chartScaleMaxM: number;
};

export function formatVnd(amount: number) {
  return new Intl.NumberFormat("vi-VN").format(Math.round(amount)) + " ₫";
}

/** Map v1 API (2 buckets) → Direction C shape when deployed EF lags. */
function normalizeMonthly(
  monthly: AdminMonthlyDatum[],
): AdminMonthlyDatum[] {
  return monthly.map((row) => {
    const legacyVnd = row.legacyRevenueVnd ?? row.leRevenueVnd ?? 0;
    const subVnd = row.subscriptionRevenueVnd ?? 0;
    const addonVnd = row.addonRevenueVnd ?? 0;
    return {
      ...row,
      subscriptionRevenueVnd: subVnd,
      addonRevenueVnd: addonVnd,
      legacyRevenueVnd: legacyVnd,
      subscriptionM: row.subscriptionM ?? subVnd / 1_000_000,
      addonM: row.addonM ?? addonVnd / 1_000_000,
      legacyM: row.legacyM ?? row.leM ?? legacyVnd / 1_000_000,
    };
  });
}

export async function fetchAdminDashboardStats(
  accessToken?: string,
): Promise<AdminDashboardPayload> {
  const payload = await adminFunctionGet<AdminDashboardPayload>(
    "admin-dashboard-stats",
    undefined,
    accessToken,
  );

  if (!payload || typeof payload !== "object" || !("totals" in payload)) {
    throw new Error("Phản hồi không hợp lệ");
  }
  const totals = payload.totals;

  return {
    ...payload,
    monthly: normalizeMonthly(payload.monthly ?? []),
    totals: {
      ...totals,
      activeSubscribers: totals.activeSubscribers ?? 0,
      expiredSubscribers: totals.expiredSubscribers ?? 0,
      neverSubscribed: totals.neverSubscribed ?? 0,
      baziReadingUnlocked: totals.baziReadingUnlocked ?? 0,
      onboardingTrialActive: totals.onboardingTrialActive ?? 0,
      onboardingTrialExhausted: totals.onboardingTrialExhausted ?? 0,
      traCuuThreadsLast30d: totals.traCuuThreadsLast30d ?? 0,
      traCuuAnchorsLast30d: totals.traCuuAnchorsLast30d ?? 0,
      revenueByBucketVnd: totals.revenueByBucketVnd ?? {
        subscription: 0,
        addon: 0,
        legacy: 0,
      },
      ordersBySku: totals.ordersBySku ?? {},
    },
  };
}
