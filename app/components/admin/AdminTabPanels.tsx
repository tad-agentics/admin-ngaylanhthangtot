import type { ReactNode } from "react";
import { Link } from "react-router";

import { ConfigRowsEditor } from "~/components/admin/ConfigRowsEditor";
import { SiteBannerAdminPanel } from "~/components/admin/SiteBannerAdminPanel";
import type { SiteBannerGetResponse } from "~/lib/admin-site-banner";
import {
  type AdminDashboardPayload,
  formatVnd,
} from "~/lib/admin-stats";

function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-admin-border-subtle bg-admin-card/80">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        {children}
      </table>
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th className="border-b border-admin-border-subtle bg-admin-canvas/60 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-admin-text-secondary">
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <td
      className={`border-b border-admin-border-subtle/80 px-3 py-2.5 text-foreground ${className}`}
    >
      {children}
    </td>
  );
}

type AdminTabPanelsProps = {
  activeNav: string;
  tabLoading: boolean;
  tabError: string | null;
  userEmail: string | null;
  appConfig: Record<string, unknown>[] | null;
  siteBanner: SiteBannerGetResponse | null;
  reportsStats: AdminDashboardPayload | null;
  onConfigSaved?: () => void;
};

export function AdminTabPanels({
  activeNav,
  tabLoading,
  tabError,
  userEmail,
  appConfig,
  siteBanner,
  reportsStats,
  onConfigSaved,
}: AdminTabPanelsProps) {
  if (
    activeNav === "overview" ||
    ![
      "users",
      "payments",
      "reports",
      "app-config",
      "site-banner",
      "roles",
      "settings",
    ].includes(activeNav)
  ) {
    return null;
  }

  if (tabLoading) {
    return (
      <p className="text-sm text-admin-text-secondary">Đang tải dữ liệu…</p>
    );
  }

  if (tabError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
        <p className="font-medium">Lỗi tab</p>
        <p className="mt-1">{tabError}</p>
        {tabError.includes("FORBIDDEN") ||
        tabError.toLowerCase().includes("not an admin") ? (
          <p className="mt-2 text-xs text-red-800/90 leading-relaxed">
            Thêm email đăng nhập vào secret{" "}
            <code className="rounded bg-red-100/80 px-1">ADMIN_EMAILS</code>
            . Hiện tại:{" "}
            <code className="rounded bg-red-100/80 px-1">{userEmail ?? "—"}</code>
            .
          </p>
        ) : null}
      </div>
    );
  }

  if (activeNav === "users") {
    return (
      <div className="rounded-2xl border border-admin-border-subtle bg-admin-card px-6 py-8 text-sm text-admin-text-secondary">
        Danh sách người dùng đã chuyển sang{" "}
        <Link to="/users" className="font-medium text-foreground underline">
          /users
        </Link>{" "}
        (tìm kiếm + entitlement qua{" "}
        <code className="rounded bg-admin-canvas px-1 text-[11px]">admin-users</code>
        ).
      </div>
    );
  }

  if (activeNav === "payments") {
    return (
      <div className="rounded-2xl border border-admin-border-subtle bg-admin-card px-6 py-8 text-sm text-admin-text-secondary">
        Đơn hàng đã chuyển sang{" "}
        <Link to="/orders" className="font-medium text-foreground underline">
          /orders
        </Link>{" "}
        (
        <code className="rounded bg-admin-canvas px-1 text-[11px]">admin-orders</code>
        ).
      </div>
    );
  }

  if (activeNav === "reports" && reportsStats) {
    const m = reportsStats.monthly;
    return (
      <div className="space-y-3">
        <p className="text-sm text-admin-text-secondary">
          Doanh thu theo tháng (12 tháng gần nhất), cùng nguồn với biểu đồ Tổng quan
          (Direction C: gói lịch / luận add-on / SKU lẻ).
        </p>
        <TableWrap>
          <thead>
            <tr>
              <Th>Tháng</Th>
              <Th>Gói lịch</Th>
              <Th>Luận add-on</Th>
              <Th>SKU lẻ</Th>
              <Th>Tổng</Th>
            </tr>
          </thead>
          <tbody>
            {m.map((row) => {
              const total =
                row.subscriptionRevenueVnd +
                row.addonRevenueVnd +
                row.legacyRevenueVnd;
              return (
                <tr key={row.key} className="hover:bg-black/[0.02]">
                  <Td className="font-medium">
                    {row.label} ({row.key})
                  </Td>
                  <Td className="tabular-nums">
                    {formatVnd(row.subscriptionRevenueVnd)}
                  </Td>
                  <Td className="tabular-nums">
                    {formatVnd(row.addonRevenueVnd)}
                  </Td>
                  <Td className="tabular-nums">
                    {formatVnd(row.legacyRevenueVnd)}
                  </Td>
                  <Td className="tabular-nums font-medium">{formatVnd(total)}</Td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      </div>
    );
  }

  if (activeNav === "app-config" && appConfig) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-admin-text-secondary">
          Chỉ hiển thị cấu hình Direction C (gói, checkout, banner JSON, …). Các key
          lượng/credits đã ẩn — sửa{" "}
          <code className="font-mono text-[11px]">value</code> (JSON nếu cần). Lưu qua{" "}
          <code className="rounded bg-admin-canvas px-1 text-[11px]">admin-config</code>
          .
        </p>
        <p className="text-xs text-amber-900/90">
          Banner sticky: nên chỉnh tab{" "}
          <strong className="font-medium">Banner đầu trang</strong> để tránh lệch JSON
          thủ công với app.
        </p>
        <ConfigRowsEditor
          table="app_config"
          rows={appConfig}
          onSaved={() => onConfigSaved?.()}
        />
      </div>
    );
  }

  if (activeNav === "site-banner" && siteBanner) {
    return (
      <SiteBannerAdminPanel
        initial={siteBanner}
        onSaved={() => onConfigSaved?.()}
      />
    );
  }

  if (activeNav === "roles") {
    return (
      <div className="rounded-2xl border border-dashed border-admin-border-subtle bg-admin-card/80 px-6 py-12 text-center text-sm text-admin-text-secondary">
        Dự án app chưa có bảng vai trò tách riêng trong Postgres — quyền hiện tại
        dựa trên cột{" "}
        <code className="rounded bg-admin-canvas px-1 text-[11px]">profiles</code>{" "}
        và Edge allowlist admin.
      </div>
    );
  }

  if (activeNav === "settings") {
    return (
      <div className="rounded-2xl border border-admin-border-subtle bg-admin-card/80 px-6 py-8 text-sm text-admin-text-secondary space-y-3">
        <p>
          Magic link và URL callback: xem biến{" "}
          <code className="rounded bg-admin-canvas px-1 text-[11px]">
            VITE_APP_URL
          </code>{" "}
          trên Vercel.
        </p>
        <p>
          Secrets:{" "}
          <code className="rounded bg-admin-canvas px-1 text-[11px]">
            ADMIN_EMAILS
          </code>{" "}
          (Supabase → Edge Functions) cho{" "}
          <code className="rounded bg-admin-canvas px-1 text-[11px]">
            admin-dashboard-stats
          </code>
          ,{" "}
          <code className="rounded bg-admin-canvas px-1 text-[11px]">admin-config</code>
          ,{" "}
          <code className="rounded bg-admin-canvas px-1 text-[11px]">
            admin-user-actions
          </code>
          ,{" "}
          <code className="rounded bg-admin-canvas px-1 text-[11px]">
            admin-site-banner
          </code>
          .
        </p>
      </div>
    );
  }

  return null;
}
