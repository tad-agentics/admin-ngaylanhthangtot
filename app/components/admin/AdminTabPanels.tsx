import type { ReactNode } from "react";

import { ConfigRowsEditor } from "~/components/admin/ConfigRowsEditor";
import type {
  AdminLedgerRow,
  AdminPaymentRow,
  AdminProfileRow,
} from "~/lib/admin-data";
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
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <td
      title={title}
      className={`border-b border-admin-border-subtle/80 px-3 py-2.5 text-foreground ${className}`}
    >
      {children}
    </td>
  );
}

function shortId(id: string) {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…`;
}

function formatDt(iso: string) {
  try {
    return new Date(iso).toLocaleString("vi-VN", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

type AdminTabPanelsProps = {
  activeNav: string;
  tabLoading: boolean;
  tabError: string | null;
  userEmail: string | null;
  profiles: AdminProfileRow[] | null;
  payments: AdminPaymentRow[] | null;
  ledger: AdminLedgerRow[] | null;
  featureCosts: Record<string, unknown>[] | null;
  appConfig: Record<string, unknown>[] | null;
  reportsStats: AdminDashboardPayload | null;
  onConfigSaved?: () => void;
};

export function AdminTabPanels({
  activeNav,
  tabLoading,
  tabError,
  userEmail,
  profiles,
  payments,
  ledger,
  featureCosts,
  appConfig,
  reportsStats,
  onConfigSaved,
}: AdminTabPanelsProps) {
  const edgeHint = (
    <p className="mt-4 text-xs text-admin-text-secondary">
      Dữ liệu nhạy cảm qua Edge Function{" "}
      <code className="rounded bg-admin-canvas px-1 text-[11px]">admin-data</code>
      . Cần deploy function này cùng secret{" "}
      <code className="rounded bg-admin-canvas px-1 text-[11px]">ADMIN_EMAILS</code>{" "}
      như Tổng quan.
    </p>
  );

  if (
    activeNav === "overview" ||
    ![
      "users",
      "payments",
      "reports",
      "ledger",
      "feature-costs",
      "app-config",
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

  if (activeNav === "users" && profiles) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-admin-text-secondary">
          Tối đa 100 hồ sơ mới nhất (sắp xếp theo ngày tạo).
        </p>
        <TableWrap>
          <thead>
            <tr>
              <Th>Hồ sơ</Th>
              <Th>Email</Th>
              <Th>Tên</Th>
              <Th>Lượng</Th>
              <Th>Gói đến</Th>
              <Th>Tạo</Th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id} className="hover:bg-black/[0.02]">
                <Td className="font-mono text-xs" title={p.id}>
                  {shortId(p.id)}
                </Td>
                <Td>{p.email ?? "—"}</Td>
                <Td>{p.display_name ?? "—"}</Td>
                <Td className="tabular-nums">{p.credits_balance ?? "—"}</Td>
                <Td className="text-xs">
                  {p.subscription_expires_at
                    ? formatDt(p.subscription_expires_at)
                    : "—"}
                </Td>
                <Td className="whitespace-nowrap text-xs">
                  {formatDt(p.created_at)}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        {profiles.length === 0 ? (
          <p className="text-sm text-admin-text-secondary">Chưa có người dùng.</p>
        ) : null}
        {edgeHint}
      </div>
    );
  }

  if (activeNav === "payments" && payments) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-admin-text-secondary">
          100 đơn gần nhất (mọi trạng thái).
        </p>
        <TableWrap>
          <thead>
            <tr>
              <Th>Đơn</Th>
              <Th>User</Th>
              <Th>Trạng thái</Th>
              <Th>SKU</Th>
              <Th>Số tiền</Th>
              <Th>Tạo</Th>
            </tr>
          </thead>
          <tbody>
            {payments.map((o) => (
              <tr key={o.id} className="hover:bg-black/[0.02]">
                <Td className="font-mono text-xs" title={o.id}>
                  {shortId(o.id)}
                </Td>
                <Td className="font-mono text-xs" title={o.user_id}>
                  {shortId(o.user_id)}
                </Td>
                <Td>
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                      o.status === "paid"
                        ? "bg-emerald-100 text-emerald-900"
                        : "bg-admin-canvas text-admin-text-secondary"
                    }`}
                  >
                    {o.status}
                  </span>
                </Td>
                <Td className="font-mono text-xs">{o.package_sku}</Td>
                <Td className="tabular-nums">
                  {o.amount_vnd != null ? formatVnd(o.amount_vnd) : "—"}
                </Td>
                <Td className="whitespace-nowrap text-xs">
                  {formatDt(o.created_at)}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        {payments.length === 0 ? (
          <p className="text-sm text-admin-text-secondary">Chưa có đơn.</p>
        ) : null}
        {edgeHint}
      </div>
    );
  }

  if (activeNav === "ledger" && ledger) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-admin-text-secondary">
          100 bút toán gần nhất trên{" "}
          <code className="rounded bg-admin-canvas px-1 text-[11px]">
            credit_ledger
          </code>
          .
        </p>
        <TableWrap>
          <thead>
            <tr>
              <Th>Bản ghi</Th>
              <Th>User</Th>
              <Th>Δ</Th>
              <Th>Số dư sau</Th>
              <Th>Lý do</Th>
              <Th>Thời điểm</Th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((r) => (
              <tr key={r.id} className="hover:bg-black/[0.02]">
                <Td className="font-mono text-xs" title={r.id}>
                  {shortId(r.id)}
                </Td>
                <Td className="font-mono text-xs" title={r.user_id}>
                  {shortId(r.user_id)}
                </Td>
                <Td
                  className={`tabular-nums font-medium ${
                    r.delta >= 0 ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  {r.delta >= 0 ? "+" : ""}
                  {r.delta}
                </Td>
                <Td className="tabular-nums">{r.balance_after ?? "—"}</Td>
                <Td className="max-w-[200px] truncate text-xs" title={r.reason ?? ""}>
                  {r.reason ?? "—"}
                </Td>
                <Td className="whitespace-nowrap text-xs">
                  {formatDt(r.created_at)}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        {ledger.length === 0 ? (
          <p className="text-sm text-admin-text-secondary">Chưa có bút toán.</p>
        ) : null}
        {edgeHint}
      </div>
    );
  }

  if (activeNav === "reports" && reportsStats) {
    const m = reportsStats.monthly;
    return (
      <div className="space-y-3">
        <p className="text-sm text-admin-text-secondary">
          Doanh thu theo tháng (12 tháng gần nhất), cùng nguồn với biểu đồ Tổng quan.
        </p>
        <TableWrap>
          <thead>
            <tr>
              <Th>Tháng</Th>
              <Th>Gói lẻ</Th>
              <Th>Gói thời hạn</Th>
              <Th>Tổng</Th>
            </tr>
          </thead>
          <tbody>
            {m.map((row) => {
              const total = row.leRevenueVnd + row.subscriptionRevenueVnd;
              return (
                <tr key={row.key} className="hover:bg-black/[0.02]">
                  <Td className="font-medium">
                    {row.label} ({row.key})
                  </Td>
                  <Td className="tabular-nums">{formatVnd(row.leRevenueVnd)}</Td>
                  <Td className="tabular-nums">
                    {formatVnd(row.subscriptionRevenueVnd)}
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

  if (activeNav === "feature-costs" && featureCosts) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-admin-text-secondary">
          Sửa từng dòng rồi bấm <strong className="font-medium">Lưu thay đổi</strong>.
          Ghi xuống DB qua Edge Function{" "}
          <code className="rounded bg-admin-canvas px-1 text-[11px]">admin-config</code>{" "}
          (JWT + <code className="rounded bg-admin-canvas px-1 text-[11px]">ADMIN_EMAILS</code>
          ). Chỉ các cột trong allowlist trên function mới được cập nhật — nếu thiếu cột,
          bổ sung trong{" "}
          <code className="rounded bg-admin-canvas px-1 text-[11px]">
            supabase/functions/admin-config/index.ts
          </code>
          .
        </p>
        <ConfigRowsEditor
          table="feature_credit_costs"
          rows={featureCosts}
          onSaved={() => onConfigSaved?.()}
        />
      </div>
    );
  }

  if (activeNav === "app-config" && appConfig) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-admin-text-secondary">
          Cấu hình key/value (và mô tả). Cột <code className="font-mono text-[11px]">value</code>{" "}
          kiểu JSON có thể sửa trong ô JSON. Lưu qua{" "}
          <code className="rounded bg-admin-canvas px-1 text-[11px]">admin-config</code>.
        </p>
        <ConfigRowsEditor
          table="app_config"
          rows={appConfig}
          onSaved={() => onConfigSaved?.()}
        />
      </div>
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
          </code>{" "}
          ,{" "}
          <code className="rounded bg-admin-canvas px-1 text-[11px]">admin-data</code>{" "}
          và{" "}
          <code className="rounded bg-admin-canvas px-1 text-[11px]">admin-config</code>
          .
        </p>
      </div>
    );
  }

  return null;
}
