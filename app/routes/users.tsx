import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";

import {
  AdminForbiddenHint,
  AdminShell,
  EnvBanner,
} from "~/components/admin/AdminShell";
import { searchAdminUsers } from "~/lib/admin-users";
import { useAuth } from "~/lib/auth";
import { adminKeys } from "~/lib/query-keys";
import { cn } from "~/lib/utils";

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

export default function UsersSearchRoute() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");

  const query = useQuery({
    queryKey: adminKeys.userSearch(submitted),
    queryFn: () => searchAdminUsers(submitted, 20),
    enabled: Boolean(user),
  });

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
            Tìm theo email, user id hoặc mã giới thiệu.
          </p>
        </div>

        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(q.trim());
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

        {query.isLoading ? (
          <p className="text-sm text-admin-text-secondary">Đang tải…</p>
        ) : null}

        {query.data ? (
          <div className="overflow-x-auto rounded-2xl border border-admin-border-subtle bg-admin-card/80">
            <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th className="border-b border-admin-border-subtle bg-admin-canvas/60 px-3 py-2.5 text-xs font-semibold uppercase text-admin-text-secondary">
                    Email
                  </th>
                  <th className="border-b border-admin-border-subtle bg-admin-canvas/60 px-3 py-2.5 text-xs font-semibold uppercase text-admin-text-secondary">
                    Gói lịch
                  </th>
                  <th className="border-b border-admin-border-subtle bg-admin-canvas/60 px-3 py-2.5 text-xs font-semibold uppercase text-admin-text-secondary">
                    Flags
                  </th>
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
                      </div>
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
                {submitted
                  ? "Không có kết quả."
                  : "Nhập từ khoá và bấm Tìm — hoặc để trống để xem 20 user mới nhất."}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </AdminShell>
  );
}
