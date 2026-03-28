import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Banknote, ShoppingBag, UserPlus } from "lucide-react";

import { AdminSidebar } from "~/components/admin/AdminSidebar";
import { AdminTopBar } from "~/components/admin/AdminTopBar";
import { RevenueTrendCard } from "~/components/admin/RevenueTrendCard";
import { StatCard } from "~/components/admin/StatCard";
import {
  type AdminDashboardPayload,
  fetchAdminDashboardStats,
  formatVnd,
} from "~/lib/admin-stats";
import { useAuth } from "~/lib/auth";

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

            {statsError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                <p className="font-medium">Lỗi dữ liệu</p>
                <p className="mt-1">{statsError}</p>
                <p className="mt-2 text-xs text-red-800/90">
                  Kiểm tra đã deploy Edge Function{" "}
                  <code className="rounded bg-red-100/80 px-1">admin-dashboard-stats</code>{" "}
                  và secret{" "}
                  <code className="rounded bg-red-100/80 px-1">ADMIN_EMAILS</code> trên
                  Supabase (email admin, cách nhau bằng dấu phẩy).
                </p>
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
              <div className="rounded-2xl border border-dashed border-admin-border-subtle bg-admin-card/80 px-6 py-16 text-center">
                <p className="text-sm font-medium text-foreground">
                  Mục “
                  <span className="tabular-nums">{activeNav}</span>”
                </p>
                <p className="mt-2 text-sm text-admin-text-secondary">
                  Khung UI đã sẵn sàng — thêm route &amp; bảng dữ liệu cho mục này sau.
                </p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
