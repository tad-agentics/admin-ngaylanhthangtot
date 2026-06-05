import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import {
  AdminForbiddenHint,
  AdminShell,
  EnvBanner,
} from "~/components/admin/AdminShell";
import { UserEntitlementsForm } from "~/components/admin/UserEntitlementsForm";
import { fetchReferralLinks } from "~/lib/admin-referrals";
import { adminDeleteUser } from "~/lib/admin-user-actions";
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
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [includeLaSo, setIncludeLaSo] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: adminKeys.userDetail(id ?? "", includeLaSo),
    queryFn: () => fetchAdminUserDetail(id!, { includeLaSo }),
    enabled: Boolean(user && id),
  });

  const refereesQuery = useQuery({
    queryKey: adminKeys.referralLinks({ referrer_id: id ?? "" }),
    queryFn: () => fetchReferralLinks({ referrer_id: id!, limit: 20 }),
    enabled: Boolean(user && id && detailQuery.data),
  });

  const displayName =
    user?.user_metadata?.full_name ??
    user?.email?.split("@")[0] ??
    "Admin";

  const data = detailQuery.data;
  const isSelf = Boolean(user?.id && data?.profile.id === user.id);

  async function handleDeleteUser() {
    if (!data) return;
    setDeleteError(null);
    const ok = window.confirm(
      `Xoá vĩnh viễn tài khoản Auth và dữ liệu gắn với:\n${data.profile.email ?? data.profile.id}\n\nKhông hoàn tác.`,
    );
    if (!ok) return;
    setDeleteBusy(true);
    try {
      await adminDeleteUser(data.profile.id);
      void queryClient.invalidateQueries({ queryKey: adminKeys.all });
      navigate("/users", { replace: true });
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleteBusy(false);
    }
  }

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
                  <dt className="text-admin-text-secondary">Đăng ký</dt>
                  <dd>{formatDt(data.profile.created_at)}</dd>
                </div>
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
                  <dt className="text-admin-text-secondary">Mã giới thiệu</dt>
                  <dd className="font-mono text-xs">
                    {data.profile.referral_code ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-admin-text-secondary">Được GT bởi</dt>
                  <dd className="text-xs">
                    {data.referrer ? (
                      <Link
                        to={`/users/${data.referrer.id}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {data.referrer.email ?? data.referrer.id}
                      </Link>
                    ) : (
                      "—"
                    )}
                    {data.referrer?.referral_code ? (
                      <span className="ml-1 font-mono text-admin-text-secondary">
                        ({data.referrer.referral_code})
                      </span>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-admin-text-secondary">Thưởng GT (VND)</dt>
                  <dd>
                    {formatVnd(data.profile.referral_reward_total_vnd ?? 0)}
                  </dd>
                </div>
                <div>
                  <dt className="text-admin-text-secondary">Luận Bát tự (lifetime)</dt>
                  <dd className="tabular-nums">
                    {data.bazi_luan_click_count ?? 0}
                    <span className="ml-1 text-xs text-admin-text-secondary">
                      lần
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-admin-text-secondary">Luận tiểu vận (lifetime)</dt>
                  <dd className="tabular-nums">
                    {data.tieu_van_luan_click_count ?? 0}
                    <span className="ml-1 text-xs text-admin-text-secondary">
                      lần
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-admin-text-secondary">
                    Hỏi tiếp về ngày này (lifetime)
                  </dt>
                  <dd className="tabular-nums">
                    {data.day_luan_follow_up_click_count ?? 0}
                    <span className="ml-1 text-xs text-admin-text-secondary">
                      lần bấm CTA
                    </span>
                    <span className="mt-0.5 block text-xs text-admin-text-secondary">
                      Đã gửi câu hỏi: {data.day_luan_ai_ask_count ?? 0} lần
                    </span>
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Thưởng giới thiệu (referrer)</h2>
                <Link
                  to={`/referrals?tab=events&referrer=${data.profile.id}`}
                  className="text-xs font-medium text-admin-text-secondary hover:text-foreground"
                >
                  Xem tất cả →
                </Link>
              </div>
              {data.referralRewards.length === 0 ? (
                <p className="text-sm text-admin-text-secondary">
                  Chưa có thưởng tiền (chỉ khi referee mua gói lịch paid).
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-admin-border-subtle">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-admin-canvas/60 text-left text-xs uppercase text-admin-text-secondary">
                        <th className="px-3 py-2">Gói</th>
                        <th className="px-3 py-2">Thưởng</th>
                        <th className="px-3 py-2">Referee</th>
                        <th className="px-3 py-2">Thời điểm</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.referralRewards.map((r) => (
                        <tr
                          key={r.id}
                          className="border-t border-admin-border-subtle/80"
                        >
                          <td className="px-3 py-2 font-mono text-xs">
                            {r.package_sku}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {formatVnd(r.reward_vnd)}
                          </td>
                          <td className="px-3 py-2">
                            <Link
                              to={`/users/${r.referee_profile_id}`}
                              className="font-mono text-[11px] hover:underline"
                            >
                              {r.referee_profile_id.slice(0, 8)}…
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-xs whitespace-nowrap">
                            {formatDt(r.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-red-200/80 bg-red-50/40 p-5 space-y-3">
              <h2 className="text-sm font-semibold text-red-950">Vùng nguy hiểm</h2>
              <p className="text-xs text-red-900/90">
                Xoá user khỏi Supabase Auth qua{" "}
                <code className="rounded bg-red-100/80 px-1 text-[11px]">
                  admin-user-actions
                </code>
                . Không xoá được tài khoản đang đăng nhập.
              </p>
              {deleteError ? (
                <p className="text-sm text-red-700">{deleteError}</p>
              ) : null}
              <button
                type="button"
                disabled={deleteBusy || isSelf}
                title={
                  isSelf
                    ? "Không thể xoá chính tài khoản admin đang đăng nhập"
                    : undefined
                }
                onClick={() => void handleDeleteUser()}
                className="h-10 rounded-lg border border-red-300 bg-red-100/80 px-4 text-sm font-medium text-red-950 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleteBusy ? "Đang xoá…" : "Xoá tài khoản"}
              </button>
            </section>

            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">
                  Người đã liên kết GT ({refereesQuery.data?.total ?? "…"})
                </h2>
                <Link
                  to={`/referrals?tab=links&referrer=${data.profile.id}`}
                  className="text-xs font-medium text-admin-text-secondary hover:text-foreground"
                >
                  Quản lý GT →
                </Link>
              </div>
              {refereesQuery.isLoading ? (
                <p className="text-sm text-admin-text-secondary">Đang tải…</p>
              ) : null}
              {refereesQuery.data && refereesQuery.data.links.length === 0 ? (
                <p className="text-sm text-admin-text-secondary">
                  Chưa có ai gắn mã / referred_by.
                </p>
              ) : null}
              {refereesQuery.data && refereesQuery.data.links.length > 0 ? (
                <ul className="divide-y divide-admin-border-subtle rounded-xl border border-admin-border-subtle bg-admin-card text-sm">
                  {refereesQuery.data.links.map((link) => (
                    <li
                      key={link.referee_id}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                    >
                      <Link
                        to={`/users/${link.referee_id}`}
                        className="font-medium hover:underline"
                      >
                        {link.referee_email ?? link.referee_id}
                      </Link>
                      <span className="text-xs text-admin-text-secondary">
                        Gói đến {formatDt(link.subscription_expires_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
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
