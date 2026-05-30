import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router";

import {
  AdminForbiddenHint,
  AdminShell,
  EnvBanner,
} from "~/components/admin/AdminShell";
import { UserEntitlementsForm } from "~/components/admin/UserEntitlementsForm";
import { fetchAdminUserDetail } from "~/lib/admin-users";
import { formatVnd } from "~/lib/admin-stats";
import { useAuth } from "~/lib/auth";
import { adminKeys } from "~/lib/query-keys";

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

export default function UserDetailRoute() {
  const { id } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [includeLaSo, setIncludeLaSo] = useState(false);

  const detailQuery = useQuery({
    queryKey: adminKeys.userDetail(id ?? "", includeLaSo),
    queryFn: () => fetchAdminUserDetail(id!, { includeLaSo }),
    enabled: Boolean(user && id),
  });

  const displayName =
    user?.user_metadata?.full_name ??
    user?.email?.split("@")[0] ??
    "Admin";

  const data = detailQuery.data;

  return (
    <AdminShell
      activeNav="users"
      userName={displayName}
      onRefresh={() => void detailQuery.refetch()}
      refreshing={detailQuery.isFetching}
    >
      <EnvBanner />
      <div className="space-y-4">
        <p>
          <Link
            to="/users"
            className="text-sm font-medium text-admin-text-secondary hover:text-foreground"
          >
            ← Danh sách người dùng
          </Link>
        </p>

        <AdminForbiddenHint
          error={detailQuery.error?.message ?? null}
          email={user?.email ?? null}
        />

        {detailQuery.isLoading ? (
          <p className="text-sm text-admin-text-secondary">Đang tải…</p>
        ) : null}

        {data ? (
          <>
            <div className="rounded-2xl border border-admin-border-subtle bg-admin-card p-5 space-y-2">
              <h1 className="text-lg font-semibold">
                {data.profile.email ?? data.profile.id}
              </h1>
              {data.profile.display_name ? (
                <p className="text-sm text-admin-text-secondary">
                  {data.profile.display_name}
                </p>
              ) : null}
              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-admin-text-secondary">Gói lịch đến</dt>
                  <dd>{formatDt(data.profile.subscription_expires_at)}</dd>
                </div>
                <div>
                  <dt className="text-admin-text-secondary">Luận BT</dt>
                  <dd>
                    {data.profile.bazi_reading_unlocked_at
                      ? formatDt(data.profile.bazi_reading_unlocked_at)
                      : "Chưa mở"}
                  </dd>
                </div>
                <div>
                  <dt className="text-admin-text-secondary">Tiểu vận đến</dt>
                  <dd>{formatDt(data.profile.tieu_van_reading_expires_at)}</dd>
                </div>
                <div>
                  <dt className="text-admin-text-secondary">Mã GT / được GT bởi</dt>
                  <dd className="font-mono text-xs">
                    {data.profile.referral_code ?? "—"}
                    {data.referrer
                      ? ` · ${data.referrer.email ?? data.referrer.id}`
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-admin-text-secondary">Thưởng GT (VND)</dt>
                  <dd>
                    {formatVnd(data.profile.referral_reward_total_vnd ?? 0)}
                  </dd>
                </div>
                <div>
                  <dt className="text-admin-text-secondary">Lá số recompute</dt>
                  <dd>{data.profile.la_so_recompute_status ?? "—"}</dd>
                </div>
              </dl>
              <div className="mt-4 border-t border-admin-border-subtle pt-4">
                <button
                  type="button"
                  className="text-xs font-medium text-foreground underline-offset-2 hover:underline"
                  onClick={() => setIncludeLaSo(true)}
                  disabled={includeLaSo || detailQuery.isFetching}
                >
                  {includeLaSo
                    ? "Đã tải lá số (JSON)"
                    : "Tải lá số JSON (debug)"}
                </button>
                {includeLaSo && "la_so" in data.profile && data.profile.la_so ? (
                  <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-admin-canvas p-3 text-[11px] leading-relaxed">
                    {JSON.stringify(data.profile.la_so, null, 2)}
                  </pre>
                ) : null}
              </div>
            </div>

            <UserEntitlementsForm
              userId={data.profile.id}
              profile={data.profile}
              onSaved={() => {
                void queryClient.invalidateQueries({
                  queryKey: adminKeys.userDetail(data.profile.id),
                });
              }}
            />

            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Đơn gần đây</h2>
              <OrdersMiniTable
                rows={data.paymentOrders.map((o) => ({
                  id: o.id,
                  status: o.status,
                  sku: o.package_sku,
                  amount: o.amount_vnd,
                  at: o.created_at,
                }))}
              />
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Thưởng giới thiệu (là referrer)</h2>
              {data.referralRewards.length === 0 ? (
                <p className="text-sm text-admin-text-secondary">Chưa có.</p>
              ) : (
                <ul className="divide-y divide-admin-border-subtle rounded-xl border border-admin-border-subtle bg-admin-card text-sm">
                  {data.referralRewards.map((r) => (
                    <li key={r.id} className="flex justify-between gap-2 px-3 py-2">
                      <span className="font-mono text-xs">{r.package_sku}</span>
                      <span className="tabular-nums">{formatVnd(r.reward_vnd)}</span>
                      <span className="text-xs text-admin-text-secondary">
                        {formatDt(r.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : null}
      </div>
    </AdminShell>
  );
}

function OrdersMiniTable({
  rows,
}: {
  rows: {
    id: string;
    status: string;
    sku: string;
    amount: number | null;
    at: string;
  }[];
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-admin-text-secondary">Chưa có đơn.</p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-admin-border-subtle">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-admin-canvas/60 text-left text-xs uppercase text-admin-text-secondary">
            <th className="px-3 py-2">SKU</th>
            <th className="px-3 py-2">Trạng thái</th>
            <th className="px-3 py-2">Số tiền</th>
            <th className="px-3 py-2">Tạo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-admin-border-subtle/80">
              <td className="px-3 py-2 font-mono text-xs">{r.sku}</td>
              <td className="px-3 py-2">{r.status}</td>
              <td className="px-3 py-2 tabular-nums">
                {r.amount != null ? formatVnd(r.amount) : "—"}
              </td>
              <td className="px-3 py-2 text-xs whitespace-nowrap">
                {formatDt(r.at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
