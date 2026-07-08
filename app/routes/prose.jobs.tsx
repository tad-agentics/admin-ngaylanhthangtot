import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link } from "react-router";

import {
  AdminForbiddenHint,
  AdminShell,
  EnvBanner,
} from "~/components/admin/AdminShell";
import { useAuth } from "~/lib/auth";
import {
  createJob,
  estimateJob,
  fetchJobs,
  fetchTemplates,
  generateNext,
  validateJob,
  JOB_STATUS_LABEL,
  type Estimate,
  type ProseJob,
} from "~/lib/prose";
import { adminKeys } from "~/lib/query-keys";
import { cn } from "~/lib/utils";

const AREA =
  "mt-1 w-full rounded-lg border border-admin-border-subtle bg-background px-2 py-1.5 font-mono text-xs leading-relaxed";

function fmtDt(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

type RunState = { jobId: string; done: number; total: number; error?: string } | null;

export default function ProseJobsRoute() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [itemsJson, setItemsJson] = useState("");
  const [samplePct, setSamplePct] = useState("5");
  const [formError, setFormError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<(Estimate & { jobId: string }) | null>(null);
  const [runState, setRunState] = useState<RunState>(null);
  const abortRef = useRef(false);

  const templatesQuery = useQuery({
    queryKey: adminKeys.proseTemplates(),
    queryFn: fetchTemplates,
    enabled: Boolean(user),
  });
  const jobsQuery = useQuery({
    queryKey: adminKeys.proseJobs(),
    queryFn: fetchJobs,
    enabled: Boolean(user),
    refetchInterval: runState ? 5000 : false,
  });

  // Latest version per key for the picker.
  const latestTemplates = (() => {
    const seen = new Set<string>();
    return (templatesQuery.data?.templates ?? []).filter((t) => {
      if (seen.has(t.key)) return false;
      seen.add(t.key);
      return true;
    });
  })();

  const createMutation = useMutation({
    mutationFn: createJob,
    onSuccess: async (res) => {
      setFormError(null);
      await queryClient.invalidateQueries({ queryKey: adminKeys.proseJobs() });
      try {
        const est = await estimateJob(res.job.id);
        setEstimate({ ...est, jobId: res.job.id });
      } catch (e) {
        // Estimate needs ANTHROPIC_API_KEY — job still exists, runnable later.
        setFormError(e instanceof Error ? e.message : String(e));
      }
      if (res.skipped_cached > 0) {
        setFormError(
          `${res.skipped_cached} item đã có sẵn (cùng template + data) — không sinh lại.`,
        );
      }
    },
    onError: (e: Error) => setFormError(e.message),
  });

  function handleCreate() {
    setFormError(null);
    setEstimate(null);
    if (!templateId) {
      setFormError("Chọn template");
      return;
    }
    let items: Array<{ item_key: string; data: unknown }>;
    try {
      const parsed = JSON.parse(itemsJson);
      if (!Array.isArray(parsed)) throw new Error();
      items = parsed;
    } catch {
      setFormError('items phải là mảng JSON: [{"item_key": "…", "data": {…}}]');
      return;
    }
    createMutation.mutate({
      template_id: templateId,
      items,
      review_sample_pct: Number(samplePct) || 5,
    });
  }

  /** Realtime generation loop: one item per edge-function call. */
  async function runJob(job: ProseJob) {
    const total =
      job.item_count ||
      Object.values(job.status_counts ?? {}).reduce((a, b) => a + b, 0);
    const already = total - (job.status_counts?.pending ?? total);
    abortRef.current = false;
    setRunState({ jobId: job.id, done: already, total });
    try {
      for (;;) {
        if (abortRef.current) break;
        const res = await generateNext(job.id);
        if (res.done) break;
        setRunState((s) =>
          s && s.jobId === job.id ? { ...s, done: s.total - res.remaining } : s,
        );
      }
      // Batch gates (phrase frequency + similarity) once the batch is in.
      await validateJob(job.id);
    } catch (e) {
      setRunState((s) =>
        s && s.jobId === job.id
          ? { ...s, error: e instanceof Error ? e.message : String(e) }
          : s,
      );
      await queryClient.invalidateQueries({ queryKey: adminKeys.proseJobs() });
      return;
    }
    setRunState(null);
    await queryClient.invalidateQueries({ queryKey: adminKeys.proseJobs() });
  }

  const displayName =
    user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "Admin";
  const jobs = jobsQuery.data?.jobs ?? [];

  return (
    <AdminShell
      activeNav="prose-jobs"
      userName={displayName}
      onRefresh={() => void jobsQuery.refetch()}
      refreshing={jobsQuery.isFetching}
    >
      <EnvBanner />
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Prose Jobs</h1>
            <p className="mt-1 max-w-2xl text-sm text-admin-text-secondary">
              Một job = một template × một lô input. Sinh realtime từng item, chạy gate,
              rồi duyệt trong Review Board.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="h-10 rounded-lg bg-neutral-950 px-4 text-sm font-medium text-white"
          >
            {showCreate ? "Đóng form" : "Job mới"}
          </button>
        </div>

        <AdminForbiddenHint
          error={jobsQuery.error?.message ?? templatesQuery.error?.message ?? null}
          email={user?.email ?? null}
        />

        {showCreate ? (
          <div className="space-y-3 rounded-2xl border border-admin-border-subtle bg-admin-card p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium">Template (bản mới nhất)</label>
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-admin-border-subtle bg-background px-2 text-sm"
                >
                  <option value="">— chọn —</option>
                  {latestTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.key} v{t.version} — {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium">% mẫu bắt buộc đọc tay</label>
                <input
                  value={samplePct}
                  onChange={(e) => setSamplePct(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-admin-border-subtle bg-background px-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium">
                Inputs — mảng JSON{" "}
                <code className="rounded bg-admin-canvas px-1 text-[11px]">
                  {'[{"item_key": "2026-08-01", "data": {…}}]'}
                </code>{" "}
                (dán từ file engine của site repo)
              </label>
              <textarea
                rows={8}
                value={itemsJson}
                onChange={(e) => setItemsJson(e.target.value)}
                className={AREA}
              />
            </div>
            {formError ? <p className="text-sm text-amber-800">{formError}</p> : null}
            {estimate ? (
              <div className="rounded-xl border border-admin-border-subtle bg-admin-canvas px-4 py-3 text-sm">
                <p className="font-medium">Ước tính ({estimate.model})</p>
                <p className="mt-1 text-admin-text-secondary">
                  {estimate.items} item · vào ~{estimate.tokensIn.toLocaleString("vi-VN")} tokens · ra tối đa{" "}
                  {estimate.tokensOutMax.toLocaleString("vi-VN")} tokens ·{" "}
                  <strong className="text-foreground">≤ {estimate.usd.toFixed(2)} USD</strong>
                </p>
                <p className="mt-1 text-xs text-admin-text-secondary">
                  Bấm “Chạy” ở dòng job tương ứng bên dưới để sinh.
                </p>
              </div>
            ) : null}
            <button
              type="button"
              disabled={createMutation.isPending}
              onClick={handleCreate}
              className="h-10 rounded-lg bg-neutral-950 px-4 text-sm font-medium text-white disabled:opacity-60"
            >
              {createMutation.isPending ? "Đang tạo…" : "Tạo job + ước tính"}
            </button>
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-2xl border border-admin-border-subtle bg-admin-card">
          <table className="w-full min-w-[840px] border-collapse text-sm">
            <thead>
              <tr>
                {["Template", "Trạng thái", "Tiến độ", "Chi phí", "Tạo lúc", ""].map((h) => (
                  <th
                    key={h}
                    className="border-b border-admin-border-subtle bg-admin-canvas/60 px-3 py-2.5 text-left text-xs font-semibold uppercase text-admin-text-secondary"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobsQuery.isLoading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-admin-text-secondary">
                    Đang tải…
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-admin-text-secondary">
                    Chưa có job nào.
                  </td>
                </tr>
              ) : (
                jobs.map((j) => {
                  const counts = j.status_counts ?? {};
                  const total = Object.values(counts).reduce((a, b) => a + b, 0) || j.item_count;
                  const pending = counts.pending ?? 0;
                  const running = runState?.jobId === j.id;
                  const doneCount = running ? runState.done : total - pending;
                  const needsReview = (counts.flagged ?? 0) + (counts.failed_validation ?? 0);
                  return (
                    <tr key={j.id}>
                      <td className="border-b border-admin-border-subtle/80 px-3 py-2.5">
                        <span className="font-mono text-xs font-semibold">
                          {j.prose_templates?.key} v{j.prose_templates?.version}
                        </span>
                        <span className="block text-xs text-admin-text-secondary">
                          {j.prose_templates?.name}
                        </span>
                      </td>
                      <td className="border-b border-admin-border-subtle/80 px-3 py-2.5">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-medium",
                            j.status === "review"
                              ? "bg-amber-100 text-amber-950"
                              : j.status === "published"
                                ? "bg-emerald-100 text-emerald-900"
                                : j.status === "running"
                                  ? "bg-sky-100 text-sky-900"
                                  : "bg-neutral-200 text-neutral-800",
                          )}
                        >
                          {JOB_STATUS_LABEL[j.status] ?? j.status}
                        </span>
                        {runState?.jobId === j.id && runState.error ? (
                          <span className="block pt-1 text-xs text-red-700">{runState.error}</span>
                        ) : null}
                      </td>
                      <td className="border-b border-admin-border-subtle/80 px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-admin-canvas">
                            <div
                              className="h-full rounded-full bg-neutral-950 transition-all"
                              style={{ width: total ? `${(doneCount / total) * 100}%` : "0%" }}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-admin-text-secondary">
                            {doneCount}/{total}
                            {needsReview ? ` · ${needsReview} cần xem` : ""}
                          </span>
                        </div>
                      </td>
                      <td className="border-b border-admin-border-subtle/80 px-3 py-2.5 text-xs tabular-nums">
                        {Number(j.cost_usd ?? 0).toFixed(3)} USD
                      </td>
                      <td className="border-b border-admin-border-subtle/80 px-3 py-2.5 text-xs text-admin-text-secondary">
                        {fmtDt(j.created_at)}
                      </td>
                      <td className="border-b border-admin-border-subtle/80 px-3 py-2.5">
                        <div className="flex items-center gap-3">
                          {pending > 0 && !running ? (
                            <button
                              type="button"
                              onClick={() => void runJob(j)}
                              className="text-xs font-medium text-foreground hover:underline"
                            >
                              Chạy ({pending})
                            </button>
                          ) : null}
                          {running ? (
                            <button
                              type="button"
                              onClick={() => {
                                abortRef.current = true;
                              }}
                              className="text-xs font-medium text-red-800 hover:underline"
                            >
                              Dừng
                            </button>
                          ) : null}
                          <Link
                            to={`/prose/jobs/${j.id}/review`}
                            className="text-xs font-medium text-foreground hover:underline"
                          >
                            Review
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
