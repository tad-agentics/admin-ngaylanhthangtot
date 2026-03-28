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
    throw new Error(error.message ?? "Không gọi được admin-dashboard-stats");
  }

  if (!data || typeof data !== "object" || !("totals" in data)) {
    throw new Error("Phản hồi không hợp lệ");
  }

  return data as AdminDashboardPayload;
}
