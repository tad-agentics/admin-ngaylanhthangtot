import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";

import {
  AdminForbiddenHint,
  AdminShell,
  EnvBanner,
} from "~/components/admin/AdminShell";
import { fetchAdminOrders } from "~/lib/admin-orders";
import { formatVnd } from "~/lib/admin-stats";
import { useAuth } from "~/lib/auth";
import { adminKeys } from "~/lib/query-keys";

const STATUS_OPTIONS = [
  "",
  "pending",
  "paid",
  "cancelled",
  "failed",
  "expired",
];

function formatDt(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("vi-VN", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function OrdersRoute() {
  const { user } = useAuth();
  const [status, setStatus] = useState("");
  const [packageSku, setPackageSku] = useState("");
  const [userId, setUserId] = useState("");
  const [filters, setFilters] = useState({
    status: "",
    package_sku: "",
    user_id: "",
  });

  const ordersQuery = useQuery({
    queryKey: adminKeys.ordersList(filters),
    queryFn: () =>
      fetchAdminOrders({
        status: filters.status || undefined,
        package_sku: filters.package_sku || undefined,
        user_id: filters.user_id || undefined,
        limit: 50,
        offset: 0,
      }),
    enabled: Boolean(user),
  });

  const displayName =
    user?.user_metadata?.full_name ??
    user?.email?.split("@")[0] ??
    "Admin";

  return (
    <AdminShell
      activeNav="payments"
      userName={displayName}
      onRefresh={() => void ordersQuery.refetch()}
      refreshing={ordersQuery.isFetching}
    >
      <EnvBanner />
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            Giao dịch & PayOS
          </h1>
          <p className="mt-1 text-sm text-admin-text-secondary">
            Lọc đơn từ{" "}
            <code className="rounded bg-admin-canvas px-1 text-[11px]">
              admin-orders
            </code>
            .
          </p>
        </div>

        <form
          className="flex flex-wrap items-end gap-3 rounded-2xl border border-admin-border-subtle bg-admin-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setFilters({
              status,
              package_sku: packageSku.trim(),
              user_id: userId.trim(),
            });
          }}
        >
          <div>
            <label className="block text-xs font-medium">Trạng thái</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 h-10 rounded-lg border border-admin-border-subtle bg-background px-2 text-sm"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s || "all"} value={s}>
                  {s || "Tất cả"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium">SKU</label>
            <input
              value={packageSku}
              onChange={(e) => setPackageSku(e.target.value)}
              placeholder="goi_12thang"
              className="mt-1 h-10 w-40 rounded-lg border border-admin-border-subtle bg-background px-2 text-sm font-mono"
            />
          </div>
          <div className="min-w-[200px] flex-1">
            <label className="block text-xs font-medium">User id</label>
            <input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="uuid"
              className="mt-1 h-10 w-full rounded-lg border border-admin-border-subtle bg-background px-2 text-sm font-mono"
            />
          </div>
          <button
            type="submit"
            className="h-10 rounded-lg bg-neutral-950 px-4 text-sm font-medium text-white"
          >
            Lọc
          </button>
        </form>

        <AdminForbiddenHint
          error={ordersQuery.error?.message ?? null}
          email={user?.email ?? null}
        />

        {ordersQuery.isLoading ? (
          <p className="text-sm text-admin-text-secondary">Đang tải…</p>
        ) : null}

        {ordersQuery.data ? (
          <>
            <p className="text-xs text-admin-text-secondary">
              Hiển thị {ordersQuery.data.orders.length} / {ordersQuery.data.total}{" "}
              đơn
            </p>
            <div className="overflow-x-auto rounded-2xl border border-admin-border-subtle bg-admin-card/80">
              <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
                <thead>
                  <tr>
                    {[
                      "Đơn / PayOS",
                      "User",
                      "SKU",
                      "Trạng thái",
                      "Số tiền",
                      "Coupon",
                      "Tạo",
                    ].map((h) => (
                      <th
                        key={h}
                        className="border-b border-admin-border-subtle bg-admin-canvas/60 px-3 py-2.5 text-xs font-semibold uppercase text-admin-text-secondary"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ordersQuery.data.orders.map((o) => (
                    <tr key={o.id} className="hover:bg-black/[0.02]">
                      <td className="border-b border-admin-border-subtle/80 px-3 py-2.5">
                        <p className="font-mono text-xs" title={o.id}>
                          {o.provider_order_code ?? o.id.slice(0, 8)}
                        </p>
                      </td>
                      <td className="border-b border-admin-border-subtle/80 px-3 py-2.5">
                        <p className="text-xs">{o.email ?? "—"}</p>
                        <Link
                          to={`/users/${o.user_id}`}
                          className="font-mono text-[11px] text-admin-text-secondary hover:text-foreground"
                        >
                          {o.user_id.slice(0, 8)}…
                        </Link>
                      </td>
                      <td className="border-b border-admin-border-subtle/80 px-3 py-2.5 font-mono text-xs">
                        {o.package_sku}
                      </td>
                      <td className="border-b border-admin-border-subtle/80 px-3 py-2.5">
                        <span
                          className={
                            o.status === "paid"
                              ? "rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900"
                              : "rounded bg-admin-canvas px-2 py-0.5 text-xs"
                          }
                        >
                          {o.status}
                        </span>
                      </td>
                      <td className="border-b border-admin-border-subtle/80 px-3 py-2.5 tabular-nums">
                        {o.amount_vnd != null ? formatVnd(o.amount_vnd) : "—"}
                      </td>
                      <td className="border-b border-admin-border-subtle/80 px-3 py-2.5 text-xs">
                        {o.coupon_code ?? "—"}
                      </td>
                      <td className="border-b border-admin-border-subtle/80 px-3 py-2.5 text-xs whitespace-nowrap">
                        {formatDt(o.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {ordersQuery.data.orders.length === 0 ? (
                <p className="px-4 py-6 text-sm text-admin-text-secondary">
                  Không có đơn phù hợp.
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </AdminShell>
  );
}
