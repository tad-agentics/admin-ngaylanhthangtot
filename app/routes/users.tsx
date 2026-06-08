import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";

import {
  AdminForbiddenHint,
  AdminShell,
  EnvBanner,
} from "~/components/admin/AdminShell";
import {
  searchAdminUsers,
  type UserEngagementSort,
  type UserSearchSortOrder,
} from "~/lib/admin-users";
import { useAuth } from "~/lib/auth";
import { adminKeys } from "~/lib/query-keys";
import { cn } from "~/lib/utils";

const PAGE_SIZE = 20;

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

function SortableEngagementHeader({
  label,
  sortKey,
  activeSort,
  activeOrder,
  onSort,
}: {
  label: string;
  sortKey: UserEngagementSort;
  activeSort: UserEngagementSort;
  activeOrder: UserSearchSortOrder;
  onSort: (key: UserEngagementSort) => void;
}) {
  const active = activeSort === sortKey;
  const arrow = !active ? "↕" : activeOrder === "desc" ? "↓" : "↑";

  return (
    <th className="border-b border-admin-border-subtle bg-admin-canvas/60 px-3 py-2.5 text-xs font-semibold uppercase text-admin-text-secondary">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          active && "text-foreground",
        )}
        title={
          active
            ? activeOrder === "desc"
              ? "Cao → thấp — bấm để thấp → cao"
              : "Thấp → cao — bấm để cao → thấp"
            : "Sắp xếp theo cột này"
        }
      >
        {label}
        <span className="font-mono text-[10px] opacity-70">{arrow}</span>
      </button>
    </th>
  );
}

export default function UsersSearchRoute() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<UserEngagementSort>("created_at");
  const [order, setOrder] = useState<UserSearchSortOrder>("desc");

  const searchParams = useMemo(
    () => ({
      q: submitted,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      sort,
      order,
    }),
    [submitted, page, sort, order],
  );

  const query = useQuery({
    queryKey: adminKeys.userSearch(searchParams),
    queryFn: () => searchAdminUsers(searchParams),
    enabled: Boolean(user),
    placeholderData: keepPreviousData,
  });

  const total = query.data?.total ?? 0;
  const totalPages = total === 0 ? 1 : Math.ceil(total / PAGE_SIZE);
  const safePage = Math.min(page, Math.max(0, totalPages - 1));
  const from = total === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const to = Math.min(total, (safePage + 1) * PAGE_SIZE);

  useEffect(() => {
    if (!query.data) return;
    const maxPage = Math.max(
      0,
      Math.ceil(query.data.total / PAGE_SIZE) - 1,
    );
    if (page > maxPage) setPage(maxPage);
  }, [query.data, page]);

  const toggleEngagementSort = (key: UserEngagementSort) => {
    if (sort === key) {
      setOrder((o) => (o === "desc" ? "asc" : "desc"));
    } else {
      setSort(key);
      setOrder("desc");
    }
    setPage(0);
  };

  const displayName =
    user?.user_metadata?.full_name ??
    user?.email?.split("@")[0] ??
    "Admin";

  return (
    <AdminShell
      activeNav="users"
      userName={displayName}
      onRefresh={() => void query.refetch()}
      refreshing={query.isFetching}
    >
      <EnvBanner />
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Người dùng</h1>
          <p className="mt-1 text-sm text-admin-text-secondary">
            Tìm theo email, user id hoặc mã giới thiệu. Bấm tiêu đề cột Luận BT /
            TV / Hỏi tiếp ngày để sắp xếp cao→thấp hoặc thấp→cao.
          </p>
        </div>

        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(q.trim());
            setPage(0);
          }}
        >
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="email@…, uuid, mã GT"
            className="h-10 min-w-[240px] flex-1 rounded-lg border border-admin-border-subtle bg-admin-card px-3 text-sm"
          />
          <button
            type="submit"
            className="h-10 rounded-lg bg-neutral-950 px-4 text-sm font-medium text-white"
          >
            Tìm
          </button>
        </form>

        <AdminForbiddenHint
          error={query.error?.message ?? null}
          email={user?.email ?? null}
        />

        {query.isPending && !query.data ? (
          <p className="text-sm text-admin-text-secondary">Đang tải…</p>
        ) : null}

        {query.data ? (
          <div className="overflow-x-auto rounded-2xl border border-admin-border-subtle bg-admin-card/80">
            <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th className="border-b border-admin-border-subtle bg-admin-canvas/60 px-3 py-2.5 text-xs font-semibold uppercase text-admin-text-secondary">
                    Email
                  </th>
                  <th className="border-b border-admin-border-subtle bg-admin-canvas/60 px-3 py-2.5 text-xs font-semibold uppercase text-admin-text-secondary">
                    <button
                      type="button"
                      onClick={() => {
                        if (sort === "created_at") {
                          setOrder((o) => (o === "desc" ? "asc" : "desc"));
                        } else {
                          setSort("created_at");
                          setOrder("desc");
                        }
                        setPage(0);
                      }}
                      className={cn(
                        "inline-flex items-center gap-1 hover:text-foreground",
                        sort === "created_at" && "text-foreground",
                      )}
                      title="Sắp xếp theo ngày đăng ký"
                    >
                      Đăng ký
                      <span className="font-mono text-[10px] opacity-70">
                        {sort !== "created_at"
                          ? "↕"
                          : order === "desc"
                            ? "↓"
                            : "↑"}
                      </span>
                    </button>
                  </th>
                  <th className="border-b border-admin-border-subtle bg-admin-canvas/60 px-3 py-2.5 text-xs font-semibold uppercase text-admin-text-secondary">
                    Gói lịch
                  </th>
                  <th className="border-b border-admin-border-subtle bg-admin-canvas/60 px-3 py-2.5 text-xs font-semibold uppercase text-admin-text-secondary">
                    Flags
                  </th>
                  <SortableEngagementHeader
                    label="Luận BT"
                    sortKey="bazi_luan"
                    activeSort={sort}
                    activeOrder={order}
                    onSort={toggleEngagementSort}
                  />
                  <SortableEngagementHeader
                    label="Luận TV"
                    sortKey="tieu_van"
                    activeSort={sort}
                    activeOrder={order}
                    onSort={toggleEngagementSort}
                  />
                  <SortableEngagementHeader
                    label="Hỏi tiếp ngày"
                    sortKey="day_luan_follow_up"
                    activeSort={sort}
                    activeOrder={order}
                    onSort={toggleEngagementSort}
                  />
                  <th className="border-b border-admin-border-subtle bg-admin-canvas/60 px-3 py-2.5 text-xs font-semibold uppercase text-admin-text-secondary">
                    Mã GT
                  </th>
                  <th className="border-b border-admin-border-subtle bg-admin-canvas/60 px-3 py-2.5 text-xs font-semibold uppercase text-admin-text-secondary" />
                </tr>
              </thead>
              <tbody>
                {query.data.users.map((u) => (
                  <tr key={u.id} className="hover:bg-black/[0.02]">
                    <td className="border-b border-admin-border-subtle/80 px-3 py-2.5">
                      <p className="font-medium">{u.email ?? "—"}</p>
                      <p className="font-mono text-[11px] text-admin-text-secondary">
                        {u.id}
                      </p>
                    </td>
                    <td className="border-b border-admin-border-subtle/80 px-3 py-2.5 text-xs whitespace-nowrap">
                      {formatDt(u.created_at)}
                    </td>
                    <td className="border-b border-admin-border-subtle/80 px-3 py-2.5 text-xs whitespace-nowrap">
                      {formatDt(u.subscription_expires_at)}
                    </td>
                    <td className="border-b border-admin-border-subtle/80 px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {u.flags.subscriptionActive ? (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-900">
                            Sub
                          </span>
                        ) : null}
                        {u.flags.canUseBaziReading ? (
                          <span className="rounded bg-admin-canvas px-1.5 py-0.5 text-[10px] font-medium">
                            BT
                          </span>
                        ) : null}
                        {u.flags.canUseTieuVanReading ? (
                          <span className="rounded bg-admin-canvas px-1.5 py-0.5 text-[10px] font-medium">
                            TV
                          </span>
                        ) : null}
                        {u.flags.hasOnboardingTrialAccess ? (
                          <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-900">
                            Trial
                          </span>
                        ) : null}
                        {u.flags.trialExhausted ? (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-950">
                            Hết trial
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td
                      className="border-b border-admin-border-subtle/80 px-3 py-2.5 tabular-nums text-sm"
                      title="Tổng lifetime: mở luận la-so-chi-tiet (có quyền, không preview)"
                    >
                      {u.bazi_luan_click_count ?? 0}
                    </td>
                    <td
                      className="border-b border-admin-border-subtle/80 px-3 py-2.5 tabular-nums text-sm"
                      title="Tổng lifetime: mở luận tiểu vận tháng (có quyền)"
                    >
                      {u.tieu_van_luan_click_count ?? 0}
                    </td>
                    <td
                      className="border-b border-admin-border-subtle/80 px-3 py-2.5 tabular-nums text-sm"
                      title={`Tổng lifetime: bấm CTA "Hỏi tiếp về ngày này" (đã gửi câu hỏi: ${u.day_luan_ai_ask_count ?? 0})`}
                    >
                      {u.day_luan_follow_up_click_count ?? 0}
                    </td>
                    <td className="border-b border-admin-border-subtle/80 px-3 py-2.5 font-mono text-xs">
                      {u.referral_code ?? "—"}
                    </td>
                    <td className="border-b border-admin-border-subtle/80 px-3 py-2.5 text-right">
                      <Link
                        to={`/users/${u.id}`}
                        className={cn(
                          "text-sm font-medium text-foreground underline-offset-2 hover:underline",
                        )}
                      >
                        Chi tiết
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {query.data.users.length === 0 ? (
              <p className="px-4 py-6 text-sm text-admin-text-secondary">
                {total === 0
                  ? submitted
                    ? "Không có kết quả."
                    : "Chưa có user."
                  : "Trang này trống — thử Trước hoặc bấm Tìm lại."}
              </p>
            ) : null}
            {total > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-admin-border-subtle px-4 py-3 text-sm text-admin-text-secondary">
                <span>
                  {from}–{to} / {total} user
                  {query.isFetching && !query.isPending ? (
                    <span className="ml-2 text-xs opacity-70">· đang tải…</span>
                  ) : null}
                  {sort !== "created_at" ? (
                    <span className="ml-2 text-xs">
                      · sắp xếp{" "}
                      {sort === "bazi_luan"
                        ? "Luận BT"
                        : sort === "tieu_van"
                          ? "Luận TV"
                          : "Hỏi tiếp ngày"}{" "}
                      {order === "desc" ? "cao→thấp" : "thấp→cao"}
                    </span>
                  ) : null}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={safePage <= 0 || query.isFetching}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    className="h-8 rounded-lg border border-admin-border-subtle px-3 text-sm disabled:opacity-40"
                  >
                    Trước
                  </button>
                  <span className="tabular-nums text-xs">
                    Trang {safePage + 1}/{totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= totalPages - 1 || query.isFetching}
                    onClick={() => setPage((p) => p + 1)}
                    className="h-8 rounded-lg border border-admin-border-subtle px-3 text-sm disabled:opacity-40"
                  >
                    Sau
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </AdminShell>
  );
}
