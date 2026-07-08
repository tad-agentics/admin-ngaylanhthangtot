/**
 * Prose engine client — types + calls to the prose-admin / prose-generate
 * edge functions (spec: artifacts/docs/seo/prose-engine-spec.md in the site repo).
 */

import { adminFunctionPost } from "~/lib/admin-functions";

export type GateResult = {
  gate: string;
  ok: boolean;
  severity: "fail" | "flag";
  detail: string;
};

export type ProseTemplate = {
  id: string;
  key: string;
  version: number;
  name: string;
  system_prompt: string;
  user_template: string;
  output_schema: Record<string, unknown>;
  few_shots: Array<{ input: unknown; output: unknown }>;
  guards: Record<string, unknown>;
  model: string;
  temperature: number;
  max_tokens: number;
  created_at: string;
};

export type ProseJobStatus =
  | "draft"
  | "estimating"
  | "running"
  | "review"
  | "approved"
  | "published"
  | "failed"
  | "cancelled";

export type ProseItemStatus =
  | "pending"
  | "generated"
  | "failed_validation"
  | "flagged"
  | "approved"
  | "rejected"
  | "published";

export type ProseJob = {
  id: string;
  template_id: string;
  status: ProseJobStatus;
  mode: string;
  item_count: number;
  review_sample_pct: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  created_at: string;
  finished_at: string | null;
  prose_templates?: Pick<ProseTemplate, "key" | "version" | "name" | "model"> | null;
  status_counts?: Record<string, number>;
};

export type ProseItem = {
  id: string;
  job_id: string;
  template_key: string;
  item_key: string;
  data_hash: string;
  input_data: Record<string, unknown>;
  output: Record<string, unknown> | null;
  edited_output: Record<string, unknown> | null;
  status: ProseItemStatus;
  validation: GateResult[];
  similarity: { maxScore: number; nearestItemKey: string | null } | null;
  regen_count: number;
  review_note: string | null;
  updated_at: string;
};

export type Estimate = {
  items: number;
  tokensIn: number;
  tokensOutMax: number;
  usd: number;
  model: string;
};

export type TestResult = {
  output: Record<string, unknown>;
  validation: GateResult[];
  status: string;
  usage: { input_tokens: number; output_tokens: number };
  usd: number;
};

// ── prose-admin ──────────────────────────────────────────────────────

export function fetchTemplates() {
  return adminFunctionPost<{ templates: ProseTemplate[] }>("prose-admin", {
    action: "templates.list",
  });
}

export function createTemplate(template: Partial<ProseTemplate>) {
  return adminFunctionPost<{ template: ProseTemplate }>("prose-admin", {
    action: "templates.create",
    template,
  });
}

export function createJob(body: {
  template_id: string;
  items: Array<{ item_key: string; data: unknown }>;
  review_sample_pct?: number;
}) {
  return adminFunctionPost<{ job: ProseJob; skipped_cached: number }>("prose-admin", {
    action: "jobs.create",
    ...body,
  });
}

export function fetchJobs() {
  return adminFunctionPost<{ jobs: ProseJob[] }>("prose-admin", { action: "jobs.list" });
}

export function fetchJob(jobId: string) {
  return adminFunctionPost<{ job: ProseJob & { prose_templates: ProseTemplate }; items: ProseItem[] }>(
    "prose-admin",
    { action: "jobs.get", job_id: jobId },
  );
}

export function reviewItem(itemId: string, verdict: "approve" | "reject", note?: string) {
  return adminFunctionPost<{ item: ProseItem }>("prose-admin", {
    action: "items.review",
    item_id: itemId,
    verdict,
    note,
  });
}

export function editItem(itemId: string, editedOutput: Record<string, unknown>) {
  return adminFunctionPost<{ item: ProseItem }>("prose-admin", {
    action: "items.edit",
    item_id: itemId,
    edited_output: editedOutput,
  });
}

export function validateJob(jobId: string) {
  return adminFunctionPost<{ updated: number }>("prose-admin", {
    action: "items.validate",
    job_id: jobId,
  });
}

export function publishJob(jobId: string) {
  return adminFunctionPost<{ published: number }>("prose-admin", {
    action: "publish",
    job_id: jobId,
  });
}

// ── prose-generate ───────────────────────────────────────────────────

export function estimateJob(jobId: string) {
  return adminFunctionPost<Estimate>("prose-generate", { action: "estimate", job_id: jobId });
}

export function generateNext(jobId: string) {
  return adminFunctionPost<{
    done: boolean;
    remaining: number;
    item?: Pick<ProseItem, "id" | "item_key" | "status" | "validation" | "output">;
  }>("prose-generate", { action: "generate", job_id: jobId });
}

export function regenItem(itemId: string, note?: string) {
  return adminFunctionPost<{ item: ProseItem }>("prose-generate", {
    action: "regen",
    item_id: itemId,
    note,
  });
}

export function testTemplate(body: {
  template_id?: string;
  template?: Partial<ProseTemplate>;
  data: unknown;
}) {
  return adminFunctionPost<TestResult>("prose-generate", { action: "test", ...body });
}

// ── display helpers ──────────────────────────────────────────────────

export const ITEM_STATUS_LABEL: Record<ProseItemStatus, string> = {
  pending: "Chờ chạy",
  generated: "Đã sinh",
  failed_validation: "Trượt gate",
  flagged: "Cần xem",
  approved: "Đã duyệt",
  rejected: "Loại",
  published: "Đã publish",
};

export const ITEM_STATUS_STYLE: Record<ProseItemStatus, string> = {
  pending: "bg-neutral-200 text-neutral-800",
  generated: "bg-sky-100 text-sky-900",
  failed_validation: "bg-red-100 text-red-900",
  flagged: "bg-amber-100 text-amber-950",
  approved: "bg-emerald-100 text-emerald-900",
  rejected: "bg-neutral-300 text-neutral-700 line-through",
  published: "bg-emerald-200 text-emerald-950",
};

export const JOB_STATUS_LABEL: Record<ProseJobStatus, string> = {
  draft: "Nháp",
  estimating: "Đã ước tính",
  running: "Đang chạy",
  review: "Chờ duyệt",
  approved: "Đã duyệt",
  published: "Đã publish",
  failed: "Lỗi",
  cancelled: "Huỷ",
};
