import { FunctionsHttpError } from "@supabase/supabase-js";

import { supabase } from "~/lib/supabase";

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
    tieuVanReadingActive: number;
    revenueByBucketVnd: RevenueBucketVnd;
    ordersBySku: Record<string, number>;
    revenueMomPct: string;
    ordersMomPct: string;
    newUsersMomPct: string;
  };
  monthly: AdminMonthlyDatum[];
  chartScaleMaxM: number;
};

type ErrorBody = { error?: { code?: string; message?: string } };

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

async function describeFunctionsError(err: unknown): Promise<string> {
  if (err instanceof FunctionsHttpError) {
    const res = err.context as Response;
    const status = res.status;
    let server = "";
    try {
      const j = (await res.clone().json()) as ErrorBody;
      const code = j?.error?.code;
      const msg = j?.error?.message;
      if (code && msg) server = `${code}: ${msg}`;
      else if (msg) server = msg;
    } catch {
      try {
        const t = (await res.clone().text()).trim();
        if (t) server = t.slice(0, 280);
      } catch {
        /* ignore */
      }
    }

    if (server) return `HTTP ${status} — ${server}`;

    switch (status) {
      case 401:
        return "HTTP 401 — Phiên đăng nhập hết hạn hoặc thiếu JWT. Thử đăng xuất và đăng nhập lại.";
      case 403:
        return "HTTP 403 — Email chưa nằm trong secret ADMIN_EMAILS (Supabase Edge).";
      case 404:
        return "HTTP 404 — Không thấy function admin-dashboard-stats (sai project hoặc chưa deploy).";
      case 503:
        return "HTTP 503 — Chưa set secret ADMIN_EMAILS trên Edge Functions.";
      default:
        return `HTTP ${status} — Edge Function trả lỗi (xem Logs trên Supabase).`;
    }
  }

  if (err instanceof Error) return err.message;
  return String(err);
}

export async function fetchAdminDashboardStats(): Promise<AdminDashboardPayload> {
  const { data, error } =
    await supabase.functions.invoke<AdminDashboardPayload | ErrorBody>(
      "admin-dashboard-stats",
      { method: "POST", body: {} },
    );

  if (data && typeof data === "object" && "error" in data) {
    const err = data as ErrorBody;
    if (err.error?.message) {
      throw new Error(err.error.message);
    }
  }

  if (error) {
    throw new Error(await describeFunctionsError(error));
  }

  if (!data || typeof data !== "object" || !("totals" in data)) {
    throw new Error("Phản hồi không hợp lệ");
  }

  const payload = data as AdminDashboardPayload;
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
      tieuVanReadingActive: totals.tieuVanReadingActive ?? 0,
      revenueByBucketVnd: totals.revenueByBucketVnd ?? {
        subscription: 0,
        addon: 0,
        legacy: 0,
      },
      ordersBySku: totals.ordersBySku ?? {},
    },
  };
}
