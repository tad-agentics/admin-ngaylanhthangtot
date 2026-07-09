import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";

import {
  AdminForbiddenHint,
  AdminShell,
  EnvBanner,
} from "~/components/admin/AdminShell";
import { buildPreviewHtml, GateList, StatusPill } from "~/components/prose/bits";
import { useAuth } from "~/lib/auth";
import {
  editItem,
  fetchJob,
  regenItem,
  reviewItem,
  type ProseItem,
} from "~/lib/prose";
import { adminKeys } from "~/lib/query-keys";
import { cn } from "~/lib/utils";

type Filter = "review" | "all" | "flagged" | "failed_validation" | "approved" | "rejected";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "review", label: "Cần duyệt" },
  { id: "flagged", label: "Cần xem" },
  { id: "failed_validation", label: "Trượt gate" },
  { id: "approved", label: "Đã duyệt" },
  { id: "rejected", label: "Loại" },
  { id: "all", label: "Tất cả" },
];

function matches(item: ProseItem, f: Filter): boolean {
  if (f === "all") return true;
  if (f === "review") {
    return ["generated", "flagged", "failed_validation"].includes(item.status);
  }
  return item.status === f;
}

export default function ProseReviewRoute() {
  const { id: jobId = "" } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("review");
  const [cursor, setCursor] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [regenNote, setRegenNote] = useState("");
  const [showRegen, setShowRegen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const jobQuery = useQuery({
    queryKey: adminKeys.proseJob(jobId),
    queryFn: () => fetchJob(jobId),
    enabled: Boolean(user && jobId),
  });

  const items = useMemo(
    () => (jobQuery.data?.items ?? []).filter((it) => matches(it, filter)),
    [jobQuery.data, filter],
  );
  const current: ProseItem | undefined = items[Math.min(cursor, items.length - 1)];

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: adminKeys.proseJob(jobId) }),
    [queryClient, jobId],
  );

  const reviewMutation = useMutation({
    mutationFn: ({ itemId, verdict }: { itemId: string; verdict: "approve" | "reject" }) =>
      reviewItem(itemId, verdict),
    onSuccess: invalidate,
    onError: (e: Error) => setActionError(e.message),
  });
  const editMutation = useMutation({
    mutationFn: ({ itemId, output }: { itemId: string; output: Record<string, unknown> }) =>
      editItem(itemId, output),
    onSuccess: async () => {
      setEditing(false);
      setActionError(null);
      await invalidate();
    },
    onError: (e: Error) => setActionError(e.message),
  });
  const regenMutation = useMutation({
    mutationFn: ({ itemId, note }: { itemId: string; note: string }) => regenItem(itemId, note),
    onSuccess: async () => {
      setShowRegen(false);
      setRegenNote("");
      setActionError(null);
      await invalidate();
    },
    onError: (e: Error) => setActionError(e.message),
  });

  const busy = reviewMutation.isPending || editMutation.isPending || regenMutation.isPending;

  const startEdit = useCallback(() => {
    if (!current) return;
    setEditText(JSON.stringify(current.edited_output ?? current.output ?? {}, null, 2));
    setEditing(true);
  }, [current]);

  // Keyboard: j/k navigate · a approve · e edit · r reject (spec §7.3)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT") return;
      if (editing || showRegen || busy) return;
      if (e.key === "j") setCursor((c) => Math.min(c + 1, Math.max(items.length - 1, 0)));
      else if (e.key === "k") setCursor((c) => Math.max(c - 1, 0));
      else if (e.key === "a" && current && current.status !== "published") {
        reviewMutation.mutate({ itemId: current.id, verdict: "approve" });
      } else if (e.key === "r" && current && current.status !== "published") {
        reviewMutation.mutate({ itemId: current.id, verdict: "reject" });
      } else if (e.key === "e" && current) startEdit();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length, current, editing, showRegen, busy, reviewMutation, startEdit]);

  useEffect(() => {
    setCursor(0);
  }, [filter]);

  function saveEdit() {
    if (!current) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(editText);
    } catch {
      setActionError("Bản sửa không phải JSON hợp lệ");
      return;
    }
    editMutation.mutate({ itemId: current.id, output: parsed });
  }

  const displayName =
    user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "Admin";
  const job = jobQuery.data?.job;
  const effective = current ? (current.edited_output ?? current.output) : null;

  return (
    <AdminShell
      activeNav="prose-jobs"
      userName={displayName}
      onRefresh={() => void jobQuery.refetch()}
      refreshing={jobQuery.isFetching}
    >
      <EnvBanner />
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              Review Board{" "}
              {job ? (
                <span className="font-mono text-sm font-normal text-admin-text-secondary">
                  {job.prose_templates?.key} v{job.prose_templates?.version}
                </span>
              ) : null}
            </h1>
            <p className="mt-1 text-sm text-admin-text-secondary">
              Phím tắt: <kbd>j</kbd>/<kbd>k</kbd> chuyển bài · <kbd>a</kbd> duyệt ·{" "}
              <kbd>e</kbd> sửa · <kbd>r</kbd> loại
            </p>
          </div>
          <Link
            to="/prose/jobs"
            className="text-sm font-medium text-admin-text-secondary hover:text-foreground"
          >
            ← Jobs
          </Link>
        </div>

        <AdminForbiddenHint error={jobQuery.error?.message ?? null} email={user?.email ?? null} />

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const n = (jobQuery.data?.items ?? []).filter((it) => matches(it, f.id)).length;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium",
                  filter === f.id
                    ? "border-foreground bg-foreground text-background"
                    : "border-admin-border-subtle bg-admin-card text-admin-text-secondary",
                )}
              >
                {f.label} ({n})
              </button>
            );
          })}
        </div>

        {actionError ? <p className="text-sm text-red-700">{actionError}</p> : null}

        <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
          {/* item list */}
          <div className="max-h-[70vh] overflow-y-auto rounded-2xl border border-admin-border-subtle bg-admin-card p-2">
            {jobQuery.isLoading ? (
              <p className="px-3 py-4 text-sm text-admin-text-secondary">Đang tải…</p>
            ) : items.length === 0 ? (
              <p className="px-3 py-4 text-sm text-admin-text-secondary">Không có item nào.</p>
            ) : (
              <ul className="space-y-0.5">
                {items.map((it, i) => (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => setCursor(i)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left",
                        i === Math.min(cursor, items.length - 1)
                          ? "bg-admin-canvas"
                          : "hover:bg-black/[0.03]",
                      )}
                    >
                      <span className="truncate font-mono text-xs">{it.item_key}</span>
                      <StatusPill status={it.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* detail */}
          {current ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-admin-border-subtle bg-admin-card px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-semibold">{current.item_key}</span>
                  <StatusPill status={current.status} />
                  {current.regen_count > 0 ? (
                    <span className="text-xs text-admin-text-secondary">
                      regen ×{current.regen_count}
                    </span>
                  ) : null}
                  {current.similarity ? (
                    <span className="text-xs text-admin-text-secondary">
                      sim {current.similarity.maxScore}
                      {current.similarity.nearestItemKey
                        ? ` (~${current.similarity.nearestItemKey})`
                        : ""}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy || current.status === "published"}
                    onClick={() => reviewMutation.mutate({ itemId: current.id, verdict: "approve" })}
                    className="h-8 rounded-lg bg-emerald-700 px-3 text-xs font-medium text-white disabled:opacity-50"
                  >
                    Duyệt (a)
                  </button>
                  <button
                    type="button"
                    disabled={busy || current.status === "published"}
                    onClick={startEdit}
                    className="h-8 rounded-lg border border-admin-border-subtle bg-admin-canvas px-3 text-xs font-medium disabled:opacity-50"
                  >
                    Sửa (e)
                  </button>
                  <button
                    type="button"
                    disabled={busy || current.status === "published" || current.regen_count >= 3}
                    onClick={() => setShowRegen((v) => !v)}
                    className="h-8 rounded-lg border border-admin-border-subtle bg-admin-canvas px-3 text-xs font-medium disabled:opacity-50"
                  >
                    Sinh lại…
                  </button>
                  <button
                    type="button"
                    disabled={busy || current.status === "published"}
                    onClick={() => reviewMutation.mutate({ itemId: current.id, verdict: "reject" })}
                    className="h-8 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-medium text-red-800 disabled:opacity-50"
                  >
                    Loại (r)
                  </button>
                </div>
              </div>

              {showRegen ? (
                <div className="space-y-2 rounded-2xl border border-admin-border-subtle bg-admin-card p-4">
                  <label className="block text-xs font-medium">
                    Ghi chú cho lần sinh lại (đi thẳng vào prompt)
                  </label>
                  <textarea
                    rows={2}
                    value={regenNote}
                    onChange={(e) => setRegenNote(e.target.value)}
                    placeholder="Quá sách vở — viết tự nhiên hơn, bớt liệt kê."
                    className="w-full rounded-lg border border-admin-border-subtle bg-background px-2 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    disabled={regenMutation.isPending}
                    onClick={() => regenMutation.mutate({ itemId: current.id, note: regenNote })}
                    className="h-9 rounded-lg bg-neutral-950 px-4 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {regenMutation.isPending ? "Đang sinh…" : "Sinh lại với ghi chú"}
                  </button>
                </div>
              ) : null}

              {editing ? (
                <div className="space-y-2 rounded-2xl border border-admin-border-subtle bg-admin-card p-4">
                  <p className="text-xs font-medium">
                    Sửa output (JSON — lưu thành <code>edited_output</code>, chạy lại gate)
                  </p>
                  <textarea
                    rows={12}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="w-full rounded-lg border border-admin-border-subtle bg-background px-2 py-1.5 font-mono text-xs leading-relaxed"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={editMutation.isPending}
                      onClick={saveEdit}
                      className="h-9 rounded-lg bg-neutral-950 px-4 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {editMutation.isPending ? "Đang lưu…" : "Lưu bản sửa"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      className="h-9 rounded-lg border border-admin-border-subtle px-4 text-sm"
                    >
                      Huỷ
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-admin-border-subtle bg-admin-card p-4">
                    <p className="text-xs font-semibold uppercase text-admin-text-secondary">
                      Prose {current.edited_output ? "(bản sửa tay)" : ""}
                    </p>
                    <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-admin-canvas p-3 text-xs leading-relaxed whitespace-pre-wrap">
                      {JSON.stringify(effective, null, 2)}
                    </pre>
                  </div>
                  <div className="rounded-2xl border border-admin-border-subtle bg-admin-card p-4">
                    <p className="text-xs font-semibold uppercase text-admin-text-secondary">Gates</p>
                    <div className="mt-2">
                      <GateList gates={current.validation ?? []} />
                    </div>
                    {current.review_note ? (
                      <p className="mt-3 rounded-lg bg-admin-canvas px-3 py-2 text-xs">
                        Ghi chú duyệt: {current.review_note}
                      </p>
                    ) : null}
                  </div>
                  <details className="rounded-2xl border border-admin-border-subtle bg-admin-card p-4">
                    <summary className="cursor-pointer text-xs font-semibold uppercase text-admin-text-secondary">
                      Dữ liệu đầu vào
                    </summary>
                    <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-admin-canvas p-3 text-xs leading-relaxed">
                      {JSON.stringify(current.input_data, null, 2)}
                    </pre>
                  </details>
                </div>
                <div className="rounded-2xl border border-admin-border-subtle bg-admin-card p-2">
                  <iframe
                    title="Xem thử trong bố cục"
                    sandbox=""
                    className="h-[560px] w-full rounded-xl border-0"
                    srcDoc={buildPreviewHtml(
                      current.template_key,
                      current.item_key,
                      effective as Record<string, unknown> | null,
                    )}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-admin-border-subtle bg-admin-card p-8 text-center text-sm text-admin-text-secondary">
              {jobQuery.isLoading ? "Đang tải…" : "Chọn một item để duyệt."}
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
