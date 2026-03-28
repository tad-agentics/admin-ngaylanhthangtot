import {
  useIsFetching,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Banknote, ShoppingBag, UserPlus } from "lucide-react";

import { AdminSidebar } from "~/components/admin/AdminSidebar";
import { AdminTabPanels } from "~/components/admin/AdminTabPanels";
import { AdminTopBar } from "~/components/admin/AdminTopBar";
import { RevenueTrendCard } from "~/components/admin/RevenueTrendCard";
import { StatCard } from "~/components/admin/StatCard";
import {
  type AdminLedgerRow,
  type AdminPaymentRow,
  type AdminProfileRow,
  fetchAdminTableRows,
} from "~/lib/admin-data";
import {
  fetchAppConfigRows,
  fetchFeatureCreditCostsRows,
} from "~/lib/admin-public-reads";
import {
  type AdminDashboardPayload,
  fetchAdminDashboardStats,
  formatVnd,
} from "~/lib/admin-stats";
import { useAuth } from "~/lib/auth";
import { adminKeys } from "~/lib/query-keys";

function EnvBanner({ ok }: { ok: boolean }) {
  if (ok) return null;
  return (
    <div className="rounded-xl border border-amber-200/80 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p className="font-medium">Chưa cấu hình Supabase</p>
      <p className="mt-1 text-amber-900/80">
        Tạo <code className="rounded bg-amber-100/80 px-1">.env.local</code> từ{" "}
        <code className="rounded bg-amber-100/80 px-1">.env.example</code>.
      </p>
    </div>
  );
}

const emptyStats: AdminDashboardPayload = {
  totals: {
    totalRevenueVnd: 0,
    paidOrdersCount: 0,
    profilesCount: 0,
    newProfilesLast30Days: 0,
    revenueMomPct: "—",
    ordersMomPct: "—",
    newUsersMomPct: "—",
  },
  monthly: [],
  chartScaleMaxM: 1,
};

export default function AdminDashboard() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const hasEnv = Boolean(url && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeNav, setActiveNav] = useState("overview");

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/dang-nhap", { replace: true });
    }
  }, [authLoading, user, navigate]);

  const dashboardStatsQuery = useQuery({
    queryKey: adminKeys.dashboardStats(),
    queryFn: fetchAdminDashboardStats,
    enabled:
      !!user &&
      hasEnv &&
      (activeNav === "overview" || activeNav === "reports"),
  });

  const profilesQuery = useQuery({
    queryKey: adminKeys.profiles(),
    queryFn: () => fetchAdminTableRows<AdminProfileRow>("profiles"),
    enabled: !!user && hasEnv && activeNav === "users",
  });

  const paymentsQuery = useQuery({
    queryKey: adminKeys.paymentOrders(),
    queryFn: () => fetchAdminTableRows<AdminPaymentRow>("payment_orders"),
    enabled: !!user && hasEnv && activeNav === "payments",
  });

  const ledgerQuery = useQuery({
    queryKey: adminKeys.creditLedger(),
    queryFn: () => fetchAdminTableRows<AdminLedgerRow>("credit_ledger"),
    enabled: !!user && hasEnv && activeNav === "ledger",
  });

  const featureCostsQuery = useQuery({
    queryKey: adminKeys.featureCosts(),
    queryFn: fetchFeatureCreditCostsRows,
    enabled: !!user && hasEnv && activeNav === "feature-costs",
  });

  const appConfigQuery = useQuery({
    queryKey: adminKeys.appConfig(),
    queryFn: fetchAppConfigRows,
    enabled: !!user && hasEnv && activeNav === "app-config",
  });

  const anyAdminFetching = useIsFetching({ queryKey: adminKeys.all });

  const handleRefresh = useCallback(() => {
    if (!hasEnv) return;
    switch (activeNav) {
      case "overview":
      case "reports":
        void queryClient.refetchQueries({ queryKey: adminKeys.dashboardStats() });
        break;
      case "users":
        void queryClient.refetchQueries({ queryKey: adminKeys.profiles() });
        break;
      case "payments":
        void queryClient.refetchQueries({ queryKey: adminKeys.paymentOrders() });
        break;
      case "ledger":
        void queryClient.refetchQueries({ queryKey: adminKeys.creditLedger() });
        break;
      case "feature-costs":
        void queryClient.refetchQueries({ queryKey: adminKeys.featureCosts() });
        break;
      case "app-config":
        void queryClient.refetchQueries({ queryKey: adminKeys.appConfig() });
        break;
      default:
        void queryClient.refetchQueries({ queryKey: adminKeys.all });
        break;
    }
  }, [activeNav, hasEnv, queryClient]);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-admin-canvas text-sm text-admin-text-secondary">
        Đang tải…
      </div>
    );
  }

  const display = dashboardStatsQuery.data ?? emptyStats;
  const chartMonthly = display.monthly.length ? display.monthly : emptyStats.monthly;
  const statsLoading = dashboardStatsQuery.isLoading;
  const statsError = dashboardStatsQuery.error?.message ?? null;

  const isRefreshing =
    activeNav === "overview" || activeNav === "reports"
      ? dashboardStatsQuery.isFetching
      : activeNav === "users"
        ? profilesQuery.isFetching
        : activeNav === "payments"
          ? paymentsQuery.isFetching
          : activeNav === "ledger"
            ? ledgerQuery.isFetching
            : activeNav === "feature-costs"
              ? featureCostsQuery.isFetching
              : activeNav === "app-config"
                ? appConfigQuery.isFetching
                : activeNav === "settings" || activeNav === "roles"
                  ? anyAdminFetching > 0
                  : false;

  const tabLoading =
    activeNav === "users"
      ? profilesQuery.isLoading
      : activeNav === "payments"
        ? paymentsQuery.isLoading
        : activeNav === "ledger"
          ? ledgerQuery.isLoading
          : activeNav === "feature-costs"
            ? featureCostsQuery.isLoading
            : activeNav === "app-config"
              ? appConfigQuery.isLoading
              : activeNav === "reports"
                ? dashboardStatsQuery.isLoading
                : false;

  const tabError =
    activeNav === "users"
      ? (profilesQuery.error?.message ?? null)
      : activeNav === "payments"
        ? (paymentsQuery.error?.message ?? null)
        : activeNav === "ledger"
          ? (ledgerQuery.error?.message ?? null)
          : activeNav === "feature-costs"
            ? (featureCostsQuery.error?.message ?? null)
            : activeNav === "app-config"
              ? (appConfigQuery.error?.message ?? null)
              : activeNav === "reports"
                ? (dashboardStatsQuery.error?.message ?? null)
                : null;

  return (
    <div className="flex min-h-dvh bg-admin-canvas text-foreground">
      <AdminSidebar
        activeId={activeNav}
        onNavigate={setActiveNav}
        onSignOut={signOut}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-6xl space-y-6">
            <AdminTopBar
              userName={
                user.user_metadata?.full_name ??
                user.email?.split("@")[0] ??
                "Admin"
              }
              onRefresh={hasEnv ? handleRefresh : undefined}
              refreshing={hasEnv && isRefreshing}
            />
            <EnvBanner ok={hasEnv} />

            {activeNav === "overview" && statsError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                <p className="font-medium">Lỗi dữ liệu</p>
                <p className="mt-1">{statsError}</p>
                {statsError.includes("FORBIDDEN") ||
                statsError.toLowerCase().includes("not an admin") ? (
                  <p className="mt-2 text-xs text-red-800/90 leading-relaxed">
                    Trong Supabase → <strong>Edge Functions</strong> →{" "}
                    <strong>Secrets</strong>, chỉnh{" "}
                    <code className="rounded bg-red-100/80 px-1">ADMIN_EMAILS</code> để{" "}
                    <strong>có đúng email bạn đang đăng nhập</strong> (có thể nhiều email,
                    cách nhau bằng dấu cách, phẩy hoặc xuống dòng). Email hiện tại:{" "}
                    <code className="rounded bg-red-100/80 px-1">{user.email ?? "—"}</code>
                    . Lưu secret xong chỉ cần tải lại trang — không cần deploy lại function.
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-red-800/90">
                    Kiểm tra Edge Function{" "}
                    <code className="rounded bg-red-100/80 px-1">admin-dashboard-stats</code>{" "}
                    và secret{" "}
                    <code className="rounded bg-red-100/80 px-1">ADMIN_EMAILS</code> trên
                    Supabase.
                  </p>
                )}
              </div>
            ) : null}

            {activeNav === "overview" ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <StatCard
                    label="Tổng nạp (PayOS, đã paid)"
                    value={
                      statsLoading
                        ? "…"
                        : formatVnd(display.totals.totalRevenueVnd)
                    }
                    delta={display.totals.revenueMomPct}
                    footnote="doanh thu tháng này vs tháng trước"
                    icon={<Banknote className="size-4" strokeWidth={1.75} />}
                  />
                  <StatCard
                    label="Đơn đã thanh toán"
                    value={
                      statsLoading
                        ? "…"
                        : String(display.totals.paidOrdersCount)
                    }
                    delta={display.totals.ordersMomPct}
                    footnote="số đơn paid — tháng này vs trước"
                    icon={<ShoppingBag className="size-4" strokeWidth={1.75} />}
                  />
                  <StatCard
                    label="Hồ sơ mới (30 ngày)"
                    value={
                      statsLoading
                        ? "…"
                        : String(display.totals.newProfilesLast30Days)
                    }
                    delta={display.totals.newUsersMomPct}
                    footnote="so với 30 ngày trước đó"
                    icon={<UserPlus className="size-4" strokeWidth={1.75} />}
                  />
                </div>
                <RevenueTrendCard
                  monthly={chartMonthly}
                  chartScaleMaxM={display.chartScaleMaxM}
                  totalRevenueVnd={display.totals.totalRevenueVnd}
                  loading={statsLoading}
                  error={null}
                />
                <p className="text-xs text-admin-text-secondary">
                  Người dùng đăng ký tổng:{" "}
                  <strong className="font-medium text-foreground">
                    {statsLoading ? "…" : display.totals.profilesCount}
                  </strong>
                  . Dữ liệu từ Edge Function{" "}
                  <code className="rounded bg-admin-canvas px-1 text-[11px]">
                    admin-dashboard-stats
                  </code>
                  .
                </p>
              </>
            ) : (
              <AdminTabPanels
                activeNav={activeNav}
                tabLoading={tabLoading}
                tabError={tabError}
                userEmail={user.email ?? null}
                profiles={
                  activeNav === "users" ? (profilesQuery.data ?? null) : null
                }
                payments={
                  activeNav === "payments"
                    ? (paymentsQuery.data ?? null)
                    : null
                }
                ledger={
                  activeNav === "ledger" ? (ledgerQuery.data ?? null) : null
                }
                featureCosts={
                  activeNav === "feature-costs"
                    ? (featureCostsQuery.data ?? null)
                    : null
                }
                appConfig={
                  activeNav === "app-config"
                    ? (appConfigQuery.data ?? null)
                    : null
                }
                reportsStats={
                  activeNav === "reports"
                    ? (dashboardStatsQuery.data ?? null)
                    : null
                }
                onConfigSaved={() => {
                  void queryClient.invalidateQueries({
                    queryKey: adminKeys.featureCosts(),
                  });
                  void queryClient.invalidateQueries({
                    queryKey: adminKeys.appConfig(),
                  });
                }}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
