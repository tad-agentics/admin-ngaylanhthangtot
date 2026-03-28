import { useEffect, useState } from "react";
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
  type AdminDashboardPayload,
  fetchAdminDashboardStats,
  formatVnd,
} from "~/lib/admin-stats";
import { useAuth } from "~/lib/auth";
import { supabase } from "~/lib/supabase";

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
  const [activeNav, setActiveNav] = useState("overview");
  const [stats, setStats] = useState<AdminDashboardPayload | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [tabLoading, setTabLoading] = useState(false);
  const [tabError, setTabError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<AdminProfileRow[] | null>(null);
  const [payments, setPayments] = useState<AdminPaymentRow[] | null>(null);
  const [ledger, setLedger] = useState<AdminLedgerRow[] | null>(null);
  const [featureCosts, setFeatureCosts] = useState<
    Record<string, unknown>[] | null
  >(null);
  const [appConfig, setAppConfig] = useState<Record<string, unknown>[] | null>(
    null,
  );
  const [reportsStats, setReportsStats] = useState<AdminDashboardPayload | null>(
    null,
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/dang-nhap", { replace: true });
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user || !hasEnv || activeNav !== "overview") return;
    let cancelled = false;
    setStatsLoading(true);
    setStatsError(null);
    void fetchAdminDashboardStats()
      .then((data) => {
        if (!cancelled) {
          setStats(data);
          setStatsLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setStats(null);
          setStatsLoading(false);
          setStatsError(e instanceof Error ? e.message : "Không tải được số liệu");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user, hasEnv, activeNav]);

  useEffect(() => {
    if (!user || !hasEnv) return;
    const dataTabs = [
      "users",
      "payments",
      "ledger",
      "feature-costs",
      "app-config",
      "reports",
    ] as const;
    if (!dataTabs.includes(activeNav as (typeof dataTabs)[number])) {
      setTabLoading(false);
      setTabError(null);
      return;
    }

    let cancelled = false;
    setTabLoading(true);
    setTabError(null);

    void (async () => {
      try {
        if (activeNav === "users") {
          const rows = await fetchAdminTableRows<AdminProfileRow>("profiles");
          if (!cancelled) setProfiles(rows);
        } else if (activeNav === "payments") {
          const rows =
            await fetchAdminTableRows<AdminPaymentRow>("payment_orders");
          if (!cancelled) setPayments(rows);
        } else if (activeNav === "ledger") {
          const rows = await fetchAdminTableRows<AdminLedgerRow>("credit_ledger");
          if (!cancelled) setLedger(rows);
        } else if (activeNav === "feature-costs") {
          const { data, error } = await supabase
            .from("feature_credit_costs")
            .select("*");
          if (error) throw error;
          const list = [...(data ?? [])] as Record<string, unknown>[];
          list.sort((a, b) => {
            const ak = String(a.feature_key ?? a.id ?? "");
            const bk = String(b.feature_key ?? b.id ?? "");
            return ak.localeCompare(bk);
          });
          if (!cancelled) setFeatureCosts(list);
        } else if (activeNav === "app-config") {
          const { data, error } = await supabase.from("app_config").select("*");
          if (error) throw error;
          const list = [...(data ?? [])] as Record<string, unknown>[];
          list.sort((a, b) => {
            const ak = String(a.key ?? a.id ?? "");
            const bk = String(b.key ?? b.id ?? "");
            return ak.localeCompare(bk);
          });
          if (!cancelled) setAppConfig(list);
        } else if (activeNav === "reports") {
          const payload = await fetchAdminDashboardStats();
          if (!cancelled) setReportsStats(payload);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setTabError(e instanceof Error ? e.message : "Không tải được");
        }
      } finally {
        if (!cancelled) setTabLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, hasEnv, activeNav]);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-admin-canvas text-sm text-admin-text-secondary">
        Đang tải…
      </div>
    );
  }

  const display = stats ?? emptyStats;
  const chartMonthly = display.monthly.length ? display.monthly : emptyStats.monthly;

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
                profiles={profiles}
                payments={payments}
                ledger={ledger}
                featureCosts={featureCosts}
                appConfig={appConfig}
                reportsStats={reportsStats}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
