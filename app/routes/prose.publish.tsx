import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";

import {
  AdminForbiddenHint,
  AdminShell,
  EnvBanner,
} from "~/components/admin/AdminShell";
import { useAuth } from "~/lib/auth";
import { fetchJobs, publishJob, JOB_STATUS_LABEL } from "~/lib/prose";
import { adminKeys } from "~/lib/query-keys";

export default function ProsePublishRoute() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [lastPublished, setLastPublished] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const jobsQuery = useQuery({
    queryKey: adminKeys.proseJobs(),
    queryFn: fetchJobs,
    enabled: Boolean(user),
  });

  const publishMutation = useMutation({
    mutationFn: publishJob,
    onSuccess: async (res) => {
      setError(null);
      setLastPublished(res.published);
      await queryClient.invalidateQueries({ queryKey: adminKeys.proseJobs() });
    },
    onError: (e: Error) => setError(e.message),
  });

  const displayName =
    user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "Admin";

  // Jobs that still have approved (unpublished) items.
  const publishable = (jobsQuery.data?.jobs ?? []).filter(
    (j) => (j.status_counts?.approved ?? 0) > 0,
  );
  const published = (jobsQuery.data?.jobs ?? []).filter(
    (j) => (j.status_counts?.published ?? 0) > 0,
  );

  return (
    <AdminShell
      activeNav="prose-publish"
      userName={displayName}
      onRefresh={() => void jobsQuery.refetch()}
      refreshing={jobsQuery.isFetching}
    >
      <EnvBanner />
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Publish</h1>
          <p className="mt-1 max-w-2xl text-sm text-admin-text-secondary">
            Publish là bước người thật bấm — item đã publish thành bất biến và xuất hiện trong
            view <code className="rounded bg-admin-canvas px-1 text-[11px]">prose_published</code>{" "}
            để site repo kéo về.
          </p>
        </div>

        <AdminForbiddenHint error={jobsQuery.error?.message ?? null} email={user?.email ?? null} />
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        {lastPublished != null ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
            <p className="font-medium">Đã publish {lastPublished} item.</p>
            <p className="mt-1 text-emerald-900/80">
              Bước tiếp theo ở site repo:{" "}
              <code className="rounded bg-emerald-100/80 px-1">npm run seo:pull-prose</code> →{" "}
              <code className="rounded bg-emerald-100/80 px-1">npm run seo:generate</code> →{" "}
              <code className="rounded bg-emerald-100/80 px-1">npm run seo:check</code> → commit.
            </p>
          </div>
        ) : null}

        <div className="rounded-2xl border border-admin-border-subtle bg-admin-card">
          <p className="border-b border-admin-border-subtle px-4 py-3 text-sm font-semibold">
            Sẵn sàng publish
          </p>
          {jobsQuery.isLoading ? (
            <p className="px-4 py-6 text-sm text-admin-text-secondary">Đang tải…</p>
          ) : publishable.length === 0 ? (
            <p className="px-4 py-6 text-sm text-admin-text-secondary">
              Không có job nào còn item đã duyệt chờ publish.
            </p>
          ) : (
            <ul>
              {publishable.map((j) => (
                <li
                  key={j.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-admin-border-subtle/60 px-4 py-3 last:border-b-0"
                >
                  <div>
                    <span className="font-mono text-xs font-semibold">
                      {j.prose_templates?.key} v{j.prose_templates?.version}
                    </span>
                    <span className="ml-2 text-xs text-admin-text-secondary">
                      {j.status_counts?.approved ?? 0} item đã duyệt ·{" "}
                      {JOB_STATUS_LABEL[j.status] ?? j.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Link
                      to={`/prose/jobs/${j.id}/review`}
                      className="text-xs font-medium text-admin-text-secondary hover:text-foreground"
                    >
                      Xem lại
                    </Link>
                    <button
                      type="button"
                      disabled={publishMutation.isPending}
                      onClick={() => publishMutation.mutate(j.id)}
                      className="h-8 rounded-lg bg-neutral-950 px-3 text-xs font-medium text-white disabled:opacity-60"
                    >
                      Publish {j.status_counts?.approved ?? 0} item
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-admin-border-subtle bg-admin-card">
          <p className="border-b border-admin-border-subtle px-4 py-3 text-sm font-semibold">
            Đã publish
          </p>
          {published.length === 0 ? (
            <p className="px-4 py-6 text-sm text-admin-text-secondary">Chưa có gì.</p>
          ) : (
            <ul>
              {published.map((j) => (
                <li
                  key={j.id}
                  className="flex items-center justify-between gap-3 border-b border-admin-border-subtle/60 px-4 py-3 last:border-b-0"
                >
                  <span className="font-mono text-xs font-semibold">
                    {j.prose_templates?.key} v{j.prose_templates?.version}
                  </span>
                  <span className="text-xs tabular-nums text-admin-text-secondary">
                    {j.status_counts?.published ?? 0} item · {Number(j.cost_usd ?? 0).toFixed(3)} USD
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
