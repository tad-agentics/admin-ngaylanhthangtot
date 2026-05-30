import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";

import {
  AdminForbiddenHint,
  AdminShell,
  EnvBanner,
} from "~/components/admin/AdminShell";
import { StatCard } from "~/components/admin/StatCard";
import {
  fetchReferralEvents,
  fetchReferralLeaders,
  fetchReferralLinks,
  fetchReferralSummary,
} from "~/lib/admin-referrals";
import { formatVnd } from "~/lib/admin-stats";
import { useAuth } from "~/lib/auth";
import { adminKeys } from "~/lib/query-keys";
import { cn } from "~/lib/utils";

type TabId = "events" | "leaders" | "links";

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

const TABS: { id: TabId; label: string }[] = [
  { id: "events", label: "Thưởng đã trả" },
  { id: "leaders", label: "Top referrer" },
  { id: "links", label: "Liên kết GT" },
];

export default function ReferralsRoute() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get("tab") as TabId) || "events";

  const [q, setQ] = useState("");
  const [referrerId, setReferrerId] = useState("");
  const [eventFilters, setEventFilters] = useState({
    q: "",
    referrer_id: "",
  });
  const [linkFilters, setLinkFilters] = useState({
    q: "",
    referrer_id: "",
  });

  const referrerFromUrl = searchParams.get("referrer")?.trim() ?? "";

  useEffect(() => {
    if (!referrerFromUrl) return;
    setReferrerId(referrerFromUrl);
    if (tab === "events") {
      setEventFilters({ q: "", referrer_id: referrerFromUrl });
    }
    if (tab === "links") {
      setLinkFilters({ q: "", referrer_id: referrerFromUrl });
    }
  }, [referrerFromUrl, tab]);

  const summaryQuery = useQuery({
    queryKey: adminKeys.referralSummary(),
    queryFn: fetchReferralSummary,
    enabled: Boolean(user),
  });

  const eventsQuery = useQuery({
    queryKey: adminKeys.referralEvents(eventFilters),
    queryFn: () =>
      fetchReferralEvents({
        q: eventFilters.q || undefined,
        referrer_id: eventFilters.referrer_id || undefined,
        limit: 50,
        offset: 0,
      }),
    enabled: Boolean(user) && tab === "events",
  });

  const leadersQuery = useQuery({
    queryKey: adminKeys.referralLeaders(),
    queryFn: () => fetchReferralLeaders(25),
    enabled: Boolean(user) && tab === "leaders",
  });

  const linksQuery = useQuery({
    queryKey: adminKeys.referralLinks(linkFilters),
    queryFn: () =>
      fetchReferralLinks({
        q: linkFilters.q || undefined,
        referrer_id: linkFilters.referrer_id || undefined,
        limit: 50,
        offset: 0,
      }),
    enabled: Boolean(user) && tab === "links",
  });

  const displayName =
    user?.user_metadata?.full_name ??
    user?.email?.split("@")[0] ??
    "Admin";

  const summary = summaryQuery.data;
  const tabError =
    tab === "events"
      ? eventsQuery.error?.message
      : tab === "leaders"
        ? leadersQuery.error?.message
        : linksQuery.error?.message;

  const refreshing =
    summaryQuery.isFetching ||
    (tab === "events" && eventsQuery.isFetching) ||
    (tab === "leaders" && leadersQuery.isFetching) ||
    (tab === "links" && linksQuery.isFetching);

  function refreshAll() {
    void summaryQuery.refetch();
    if (tab === "events") void eventsQuery.refetch();
    if (tab === "leaders") void leadersQuery.refetch();
    if (tab === "links") void linksQuery.refetch();
  }

  return (
    <AdminShell
      activeNav="referrals"
      userName={displayName}
      onRefresh={refreshAll}
      refreshing={refreshing}
    >
      <EnvBanner />
      <div className="space-y-6">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Giới thiệu</h1>
          <p className="mt-1 text-sm text-admin-text-secondary">
            Thưởng tiền khi người được giới thiệu mua gói lịch (PayOS paid). Dữ
            liệu từ{" "}
            <code className="rounded bg-admin-canvas px-1 text-[11px]">
              admin-referrals
            </code>
            .
          </p>
        </div>

        <AdminForbiddenHint
          error={summaryQuery.error?.message ?? tabError ?? null}
          email={user?.email ?? null}
        />

        {summaryQuery.isLoading ? (
          <p className="text-sm text-admin-text-secondary">Đang tải tổng quan…</p>
        ) : null}

        {summary ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Tổng thưởng đã trả"
                value={formatVnd(summary.totalRewardVnd)}
                footnote={`30 ngày: ${formatVnd(summary.last30DaysRewardVnd)}`}
              />
              <StatCard
                label="Sự kiện thưởng"
                value={String(summary.eventCount)}
                footnote="bản ghi referral_reward_events"
              />
              <StatCard
                label="Referrer có thưởng"
                value={String(summary.activeReferrersCount)}
                footnote="đã nhận ≥1 khoản thưởng"
              />
              <StatCard
                label="User có người GT"
                value={String(summary.referredProfilesCount)}
                footnote="profiles.referred_by ≠ null"
              />
            </div>

            <div className="rounded-2xl border border-admin-border-subtle bg-admin-card p-4 text-sm">
              <p className="font-medium text-foreground">Quy tắc thưởng (webhook)</p>
              <ul className="mt-2 space-y-1 text-admin-text-secondary">
                {summary.rewardRules.map((r) => (
                  <li key={r.package_sku}>
                    <span className="font-mono text-xs">{r.package_sku}</span>
                    {" → "}
                    <span className="tabular-nums font-medium text-foreground">
                      {formatVnd(r.reward_vnd)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs">
                Giảm giá checkout theo mã GT:{" "}
                <strong className="text-foreground">
                  {summary.checkoutReferralDiscountPercent}%
                </strong>{" "}
                (
                <code className="rounded bg-admin-canvas px-1">
                  checkout_referral_discount_percent
                </code>
                ).
              </p>
            </div>
          </>
        ) : null}

        <div
          className="inline-flex rounded-full border border-admin-border-subtle bg-admin-canvas p-0.5 text-xs font-semibold"
          role="tablist"
        >
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setSearchParams({ tab: id })}
              className={cn(
                "rounded-full px-4 py-2 transition",
                tab === id
                  ? "bg-admin-card text-foreground shadow-sm"
                  : "text-admin-text-secondary hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "events" ? (
          <section className="space-y-4">
            <form
              className="flex flex-wrap items-end gap-3 rounded-2xl border border-admin-border-subtle bg-admin-card p-4"
              onSubmit={(e) => {
                e.preventDefault();
                setEventFilters({
                  q: q.trim(),
                  referrer_id: referrerId.trim(),
                });
              }}
            >
              <div className="min-w-[200px] flex-1">
                <label className="block text-xs font-medium">Tìm kiếm</label>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="email, mã GT, user id"
                  className="mt-1 h-10 w-full rounded-lg border border-admin-border-subtle bg-background px-3 text-sm"
                />
              </div>
              <div className="min-w-[220px]">
                <label className="block text-xs font-medium">Referrer id</label>
                <input
                  value={referrerId}
                  onChange={(e) => setReferrerId(e.target.value)}
                  placeholder="uuid referrer"
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

            {eventsQuery.isLoading ? (
              <p className="text-sm text-admin-text-secondary">Đang tải…</p>
            ) : null}

            {eventsQuery.data ? (
              <>
                <p className="text-xs text-admin-text-secondary">
                  {eventsQuery.data.events.length} / {eventsQuery.data.total} sự
                  kiện
                </p>
                <ReferralEventsTable events={eventsQuery.data.events} />
              </>
            ) : null}
          </section>
        ) : null}

        {tab === "leaders" ? (
          <section className="space-y-3">
            {leadersQuery.isLoading ? (
              <p className="text-sm text-admin-text-secondary">Đang tải…</p>
            ) : null}
            {leadersQuery.data ? (
              <div className="overflow-x-auto rounded-2xl border border-admin-border-subtle bg-admin-card/80">
                <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
                  <thead>
                    <tr>
                      {[
                        "Referrer",
                        "Mã GT",
                        "Tổng thưởng",
                        "Liên kết GT",
                        "Sự kiện",
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
                    {leadersQuery.data.leaders.map((l) => (
                      <tr key={l.id} className="hover:bg-black/[0.02]">
                        <td className="border-b border-admin-border-subtle/80 px-3 py-2.5">
                          <p>{l.email ?? "—"}</p>
                          <Link
                            to={`/users/${l.id}`}
                            className="font-mono text-[11px] text-admin-text-secondary hover:text-foreground"
                          >
                            {l.id.slice(0, 8)}…
                          </Link>
                        </td>
                        <td className="border-b border-admin-border-subtle/80 px-3 py-2.5 font-mono text-xs">
                          {l.referral_code ?? "—"}
                        </td>
                        <td className="border-b border-admin-border-subtle/80 px-3 py-2.5 tabular-nums font-medium">
                          {formatVnd(l.referral_reward_total_vnd)}
                        </td>
                        <td className="border-b border-admin-border-subtle/80 px-3 py-2.5 tabular-nums">
                          {l.linked_referees_count}
                        </td>
                        <td className="border-b border-admin-border-subtle/80 px-3 py-2.5 tabular-nums">
                          {l.reward_events_count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {leadersQuery.data.leaders.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-admin-text-secondary">
                    Chưa có referrer nhận thưởng.
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        {tab === "links" ? (
          <section className="space-y-4">
            <form
              className="flex flex-wrap items-end gap-3 rounded-2xl border border-admin-border-subtle bg-admin-card p-4"
              onSubmit={(e) => {
                e.preventDefault();
                setLinkFilters({
                  q: q.trim(),
                  referrer_id: referrerId.trim(),
                });
              }}
            >
              <div className="min-w-[200px] flex-1">
                <label className="block text-xs font-medium">Tìm kiếm</label>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="email referee/referrer, mã GT"
                  className="mt-1 h-10 w-full rounded-lg border border-admin-border-subtle bg-background px-3 text-sm"
                />
              </div>
              <div className="min-w-[220px]">
                <label className="block text-xs font-medium">Chỉ referrer id</label>
                <input
                  value={referrerId}
                  onChange={(e) => setReferrerId(e.target.value)}
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

            {linksQuery.isLoading ? (
              <p className="text-sm text-admin-text-secondary">Đang tải…</p>
            ) : null}

            {linksQuery.data ? (
              <>
                <p className="text-xs text-admin-text-secondary">
                  {linksQuery.data.links.length} / {linksQuery.data.total} liên kết
                  (signup / claim — chưa chắc đã mua gói)
                </p>
                <div className="overflow-x-auto rounded-2xl border border-admin-border-subtle bg-admin-card/80">
                  <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
                    <thead>
                      <tr>
                        {[
                          "Người được GT",
                          "Referrer",
                          "Gói lịch đến",
                          "Đăng ký",
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
                      {linksQuery.data.links.map((row) => (
                        <tr key={row.referee_id} className="hover:bg-black/[0.02]">
                          <td className="border-b border-admin-border-subtle/80 px-3 py-2.5">
                            <p>{row.referee_email ?? "—"}</p>
                            <Link
                              to={`/users/${row.referee_id}`}
                              className="font-mono text-[11px] text-admin-text-secondary hover:text-foreground"
                            >
                              {row.referee_id.slice(0, 8)}…
                            </Link>
                          </td>
                          <td className="border-b border-admin-border-subtle/80 px-3 py-2.5">
                            <p className="text-xs">
                              {row.referrer_email ?? "—"}
                              {row.referrer_code ? (
                                <span className="ml-1 font-mono text-admin-text-secondary">
                                  ({row.referrer_code})
                                </span>
                              ) : null}
                            </p>
                            <Link
                              to={`/users/${row.referrer_id}`}
                              className="font-mono text-[11px] text-admin-text-secondary hover:text-foreground"
                            >
                              {row.referrer_id.slice(0, 8)}…
                            </Link>
                          </td>
                          <td className="border-b border-admin-border-subtle/80 px-3 py-2.5 text-xs whitespace-nowrap">
                            {formatDt(row.subscription_expires_at)}
                          </td>
                          <td className="border-b border-admin-border-subtle/80 px-3 py-2.5 text-xs whitespace-nowrap">
                            {formatDt(row.referee_created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {linksQuery.data.links.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-admin-text-secondary">
                      Không có liên kết phù hợp.
                    </p>
                  ) : null}
                </div>
              </>
            ) : null}
          </section>
        ) : null}
      </div>
    </AdminShell>
  );
}

function ReferralEventsTable({
  events,
}: {
  events: import("~/lib/admin-referrals").ReferralEventRow[];
}) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-admin-text-secondary">Chưa có sự kiện thưởng.</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-admin-border-subtle bg-admin-card/80">
      <table className="w-full min-w-[64rem] border-collapse text-left text-sm">
        <thead>
          <tr>
            {[
              "Thời điểm",
              "Referrer",
              "Người mua",
              "Gói",
              "Thưởng",
              "Mã checkout",
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
          {events.map((e) => (
            <tr key={e.id} className="hover:bg-black/[0.02]">
              <td className="border-b border-admin-border-subtle/80 px-3 py-2.5 text-xs whitespace-nowrap">
                {formatDt(e.created_at)}
              </td>
              <td className="border-b border-admin-border-subtle/80 px-3 py-2.5">
                <p className="text-xs">{e.referrer_email ?? "—"}</p>
                <Link
                  to={`/users/${e.referrer_profile_id}`}
                  className="font-mono text-[11px] text-admin-text-secondary hover:text-foreground"
                >
                  {e.referrer_code ?? e.referrer_profile_id.slice(0, 8)}
                </Link>
              </td>
              <td className="border-b border-admin-border-subtle/80 px-3 py-2.5">
                <p className="text-xs">{e.referee_email ?? "—"}</p>
                <Link
                  to={`/users/${e.referee_profile_id}`}
                  className="font-mono text-[11px] text-admin-text-secondary hover:text-foreground"
                >
                  {e.referee_profile_id.slice(0, 8)}…
                </Link>
              </td>
              <td className="border-b border-admin-border-subtle/80 px-3 py-2.5 font-mono text-xs">
                {e.package_sku}
              </td>
              <td className="border-b border-admin-border-subtle/80 px-3 py-2.5 tabular-nums font-medium">
                {formatVnd(e.reward_vnd)}
              </td>
              <td className="border-b border-admin-border-subtle/80 px-3 py-2.5 font-mono text-xs">
                {e.checkout_referral_code ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
