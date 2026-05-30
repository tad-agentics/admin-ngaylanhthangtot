import {
  useIsFetching,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Banknote, BookOpen, CalendarDays, ShoppingBag, UserPlus } from "lucide-react";

import { AdminShell, EnvBanner, AdminForbiddenHint } from "~/components/admin/AdminShell";
import { AdminTabPanels } from "~/components/admin/AdminTabPanels";
import { OrdersBySkuCard } from "~/components/admin/OrdersBySkuCard";
import { RevenueTrendCard } from "~/components/admin/RevenueTrendCard";
import { StatCard } from "~/components/admin/StatCard";
import { type AdminLedgerRow, fetchAdminTableRows } from "~/lib/admin-data";
import {
  fetchAppConfigRows,
  fetchFeatureCreditCostsRows,
} from "~/lib/admin-public-reads";
import { fetchAdminSiteBanner } from "~/lib/admin-site-banner";
import {
  type AdminDashboardPayload,
  fetchAdminDashboardStats,
  formatVnd,
} from "~/lib/admin-stats";
import { useAuth } from "~/lib/auth";
import { adminKeys } from "~/lib/query-keys";

const emptyStats: AdminDashboardPayload = {
  totals: {
    totalRevenueVnd: 0,
    paidOrdersCount: 0,
    profilesCount: 0,
    newProfilesLast30Days: 0,
    activeSubscribers: 0,
    expiredSubscribers: 0,
    neverSubscribed: 0,
    baziReadingUnlocked: 0,
    tieuVanReadingActive: 0,
    revenueByBucketVnd: { subscription: 0, addon: 0, legacy: 0 },
    ordersBySku: {},
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
  const [searchParams] = useSearchParams();
  const navParam = searchParams.get("nav");
  const [activeNav, setActiveNav] = useState(navParam ?? "overview");

  useEffect(() => {
    if (navParam === "users") {
      navigate("/users", { replace: true });
      return;
    }
    if (navParam === "payments") {
      navigate("/orders", { replace: true });
      return;
    }
    if (navParam) setActiveNav(navParam);
  }, [navParam, navigate]);

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

  const siteBannerQuery = useQuery({
    queryKey: adminKeys.siteBanner(),
    queryFn: fetchAdminSiteBanner,
    enabled: !!user && hasEnv && activeNav === "site-banner",
  });

  const anyAdminFetching = useIsFetching({ queryKey: adminKeys.all });

  const handleRefresh = useCallback(() => {
    if (!hasEnv) return;
    switch (activeNav) {
      case "overview":
      case "reports":
        void queryClient.refetchQueries({ queryKey: adminKeys.dashboardStats() });
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
      case "site-banner":
        void queryClient.refetchQueries({ queryKey: adminKeys.siteBanner() });
        break;
      default:
        void queryClient.refetchQueries({ queryKey: adminKeys.all });
        break;
    }
  }, [activeNav, hasEnv, queryClient]);

  const display = dashboardStatsQuery.data ?? emptyStats;
  const chartMonthly = display.monthly.length ? display.monthly : emptyStats.monthly;
  const statsLoading = dashboardStatsQuery.isLoading;
  const statsError = dashboardStatsQuery.error?.message ?? null;

  const isRefreshing =
    activeNav === "overview" || activeNav === "reports"
      ? dashboardStatsQuery.isFetching
      : activeNav === "ledger"
            ? ledgerQuery.isFetching
            : activeNav === "feature-costs"
              ? featureCostsQuery.isFetching
              : activeNav === "app-config"
                ? appConfigQuery.isFetching
                : activeNav === "site-banner"
                  ? siteBannerQuery.isFetching
                  : activeNav === "settings" || activeNav === "roles"
                    ? anyAdminFetching > 0
                    : false;

  const tabLoading =
    activeNav === "ledger"
          ? ledgerQuery.isLoading
          : activeNav === "feature-costs"
            ? featureCostsQuery.isLoading
            : activeNav === "app-config"
              ? appConfigQuery.isLoading
              : activeNav === "site-banner"
                ? siteBannerQuery.isLoading
                : activeNav === "reports"
                  ? dashboardStatsQuery.isLoading
                  : false;

  const tabError =
    activeNav === "ledger"
          ? (ledgerQuery.error?.message ?? null)
          : activeNav === "feature-costs"
            ? (featureCostsQuery.error?.message ?? null)
            : activeNav === "app-config"
              ? (appConfigQuery.error?.message ?? null)
              : activeNav === "site-banner"
                ? (siteBannerQuery.error?.message ?? null)
                : activeNav === "reports"
                  ? (dashboardStatsQuery.error?.message ?? null)
                  : null;

  const userName =
    user?.user_metadata?.full_name ??
    user?.email?.split("@")[0] ??
    "Admin";

  return (
    <AdminShell
      activeNav={activeNav}
      userName={userName}
      onRefresh={hasEnv ? handleRefresh : undefined}
      refreshing={hasEnv && isRefreshing}
    >
      <EnvBanner />

      {activeNav === "overview" ? (
        <AdminForbiddenHint error={statsError} email={user?.email ?? null} />
      ) : null}

      {activeNav === "overview" ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <StatCard
                    label="Doanh thu PayOS (đã paid)"
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
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <StatCard
                    label="Gói lịch đang active"
                    value={
                      statsLoading
                        ? "…"
                        : String(display.totals.activeSubscribers)
                    }
                    footnote={`hết hạn: ${statsLoading ? "…" : display.totals.expiredSubscribers} · chưa mua: ${statsLoading ? "…" : display.totals.neverSubscribed}`}
                    icon={<CalendarDays className="size-4" strokeWidth={1.75} />}
                  />
                  <StatCard
                    label="Luận Bát tự (đã mở)"
                    value={
                      statsLoading
                        ? "…"
                        : String(display.totals.baziReadingUnlocked)
                    }
                    footnote="bazi_reading_unlocked_at"
                    icon={<BookOpen className="size-4" strokeWidth={1.75} />}
                  />
                  <StatCard
                    label="Tiểu vận đang active"
                    value={
                      statsLoading
                        ? "…"
                        : String(display.totals.tieuVanReadingActive)
                    }
                    footnote="tieu_van_reading_expires_at > now"
                    icon={<BookOpen className="size-4" strokeWidth={1.75} />}
                  />
                </div>
                <RevenueTrendCard
                  monthly={chartMonthly}
                  chartScaleMaxM={display.chartScaleMaxM}
                  totalRevenueVnd={display.totals.totalRevenueVnd}
                  loading={statsLoading}
                  error={null}
                />
                <OrdersBySkuCard
                  ordersBySku={display.totals.ordersBySku}
                  revenueByBucketVnd={display.totals.revenueByBucketVnd}
                  loading={statsLoading}
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
                userEmail={user?.email ?? null}
                profiles={null}
                payments={null}
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
                siteBanner={
                  activeNav === "site-banner"
                    ? (siteBannerQuery.data ?? null)
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
                  void queryClient.invalidateQueries({
                    queryKey: adminKeys.siteBanner(),
                  });
                }}
                currentUserId={user?.id ?? ""}
                onUsersMutated={() => {
                  void queryClient.invalidateQueries({
                    queryKey: adminKeys.creditLedger(),
                  });
                  void queryClient.invalidateQueries({
                    queryKey: adminKeys.dashboardStats(),
                  });
                }}
              />
            )}
    </AdminShell>
  );
}
