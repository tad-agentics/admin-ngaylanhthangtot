import { FunctionsHttpError } from "@supabase/supabase-js";

import { supabase } from "~/lib/supabase";

export type AdminMonthlyDatum = {
  key: string;
  label: string;
  leRevenueVnd: number;
  subscriptionRevenueVnd: number;
  leM: number;
  subscriptionM: number;
};

export type AdminDashboardPayload = {
  totals: {
    totalRevenueVnd: number;
    paidOrdersCount: number;
    profilesCount: number;
    newProfilesLast30Days: number;
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

  return data as AdminDashboardPayload;
}
