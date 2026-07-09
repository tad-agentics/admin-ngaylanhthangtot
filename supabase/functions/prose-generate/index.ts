/**
 * Prose engine — generation endpoint (the only place ANTHROPIC_API_KEY is used).
 *
 * POST { action, ... }:
 *   estimate {job_id}                  → sampled token count → {items, tokensIn, tokensOutMax, usd}
 *   generate {job_id}                  → generate ONE pending item (the UI loops
 *                                        until remaining === 0 — keeps each
 *                                        invocation far under the wall-clock cap)
 *   regen    {item_id, note?}          → regenerate one item with gate errors +
 *                                        reviewer note appended (cap 3)
 *   test     {template_id, data} or
 *            {template: {...}, data}   → one-off generate, nothing persisted
 *                                        (Template Studio test panel)
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { adminJson, requireAdmin } from "../_shared/admin-auth.ts";
import { corsHeadersForRequest } from "../_shared/cors.ts";
import {
  coerceToSchema,
  type GateResult,
  type Guards,
  runItemGates,
  statusFromGates,
} from "../_shared/prose-guards.ts";
import {
  callAnthropic,
  costUsd,
  countTokens,
  priceOf,
  type ProseTemplate,
} from "../_shared/prose-prompt.ts";

const REGEN_CAP = 3;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        ...corsHeadersForRequest(req),
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;
  const { admin, cors, userId } = auth;

  if (req.method !== "POST") {
    return adminJson(cors, { error: { code: "METHOD_NOT_ALLOWED", message: "POST only" } }, 405);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return adminJson(cors, { error: { code: "BAD_REQUEST", message: "Invalid JSON" } }, 400);
  }
  const action = String(body.action ?? "");

  async function loadTemplate(id: string): Promise<ProseTemplate> {
    const { data, error } = await admin.from("prose_templates").select("*").eq("id", id).single();
    if (error || !data) throw new Error(`Template không tồn tại: ${error?.message ?? id}`);
    return data as ProseTemplate;
  }

  try {
    // ── estimate ──────────────────────────────────────────────────────
    if (action === "estimate") {
      const jobId = String(body.job_id ?? "");
      const { data: job, error: jobErr } = await admin
        .from("prose_jobs").select("*").eq("id", jobId).single();
      if (jobErr || !job) throw new Error("Job không tồn tại");
      const t = await loadTemplate(job.template_id);
      const { data: items, error: itErr } = await admin
        .from("prose_items").select("id, input_data").eq("job_id", jobId);
      if (itErr) throw itErr;
      const list = items ?? [];
      if (list.length === 0) {
        return adminJson(cors, { items: 0, tokensIn: 0, tokensOutMax: 0, usd: 0 });
      }
      // Sample up to 3 rendered prompts through count_tokens, extrapolate.
      const sample = list.slice(0, 3);
      let sampleTotal = 0;
      for (const it of sample) sampleTotal += await countTokens(t, it.input_data);
      const tokensIn = Math.round((sampleTotal / sample.length) * list.length);
      const tokensOutMax = t.max_tokens * list.length;
      const p = priceOf(t.model);
      const usd = (tokensIn * p.input + tokensOutMax * p.output) / 1_000_000;
      await admin.from("prose_jobs").update({ status: "estimating" }).eq("id", jobId)
        .in("status", ["draft", "estimating"]);
      return adminJson(cors, {
        items: list.length,
        tokensIn,
        tokensOutMax,
        usd: Math.round(usd * 100) / 100,
        model: t.model,
      });
    }

    // ── generate (one item per call — UI drives the loop) ─────────────
    if (action === "generate") {
      const jobId = String(body.job_id ?? "");
      const { data: job, error: jobErr } = await admin
        .from("prose_jobs").select("*").eq("id", jobId).single();
      if (jobErr || !job) throw new Error("Job không tồn tại");
      const t = await loadTemplate(job.template_id);

      const { data: pending, error: pErr } = await admin
        .from("prose_items")
        .select("id, item_key, input_data")
        .eq("job_id", jobId)
        .eq("status", "pending")
        .order("item_key", { ascending: true })
        .limit(1);
      if (pErr) throw pErr;

      if (!pending || pending.length === 0) {
        await admin.from("prose_jobs")
          .update({ status: "review", finished_at: new Date().toISOString() })
          .eq("id", jobId).eq("status", "running");
        return adminJson(cors, { done: true, remaining: 0 });
      }
      if (job.status !== "running") {
        await admin.from("prose_jobs").update({ status: "running" }).eq("id", jobId);
      }

      const item = pending[0];
      let gates: GateResult[] = [];
      let status = "failed_validation";
      let output: unknown = null;
      let usage = { input_tokens: 0, output_tokens: 0 };
      try {
        ({ output, usage } = await callAnthropic(t, item.input_data));
        output = coerceToSchema(output, t.output_schema);
        gates = runItemGates({
          output,
          inputData: item.input_data,
          outputSchema: t.output_schema,
          guards: (t.guards ?? {}) as Guards,
        });
        status = statusFromGates(gates);
      } catch (e) {
        gates = [{
          gate: "generation",
          ok: false,
          severity: "fail",
          detail: e instanceof Error ? e.message : String(e),
        }];
      }

      await admin.from("prose_items").update({
        output,
        status,
        validation: gates,
      }).eq("id", item.id);

      await admin.from("prose_jobs").update({
        tokens_in: Number(job.tokens_in ?? 0) + usage.input_tokens,
        tokens_out: Number(job.tokens_out ?? 0) + usage.output_tokens,
        cost_usd: Math.round((Number(job.cost_usd ?? 0) + costUsd(t.model, usage)) * 10000) / 10000,
      }).eq("id", jobId);

      const { count } = await admin
        .from("prose_items")
        .select("id", { count: "exact", head: true })
        .eq("job_id", jobId).eq("status", "pending");
      const remaining = count ?? 0;
      if (remaining === 0) {
        await admin.from("prose_jobs")
          .update({ status: "review", finished_at: new Date().toISOString() })
          .eq("id", jobId);
      }
      return adminJson(cors, {
        done: remaining === 0,
        remaining,
        item: { id: item.id, item_key: item.item_key, status, validation: gates, output },
      });
    }

    // ── regen ─────────────────────────────────────────────────────────
    if (action === "regen") {
      const itemId = String(body.item_id ?? "");
      const note = typeof body.note === "string" ? body.note.trim() : "";
      const { data: item, error: iErr } = await admin
        .from("prose_items").select("*").eq("id", itemId).single();
      if (iErr || !item) throw new Error("Item không tồn tại");
      if ((item.regen_count ?? 0) >= REGEN_CAP) {
        throw new Error(`Đã regen ${REGEN_CAP} lần — sửa tay hoặc reject.`);
      }
      const { data: job } = await admin
        .from("prose_jobs").select("*").eq("id", item.job_id).single();
      const t = await loadTemplate(job.template_id);

      const gateErrors = (item.validation as GateResult[] ?? [])
        .filter((g) => !g.ok)
        .map((g) => `- [${g.gate}] ${g.detail}`)
        .join("\n");
      const feedback = [
        gateErrors ? `Bản trước không đạt các gate sau:\n${gateErrors}` : "",
        note ? `Ghi chú người duyệt: ${note}` : "",
        "Viết lại toàn bộ, khắc phục các lỗi trên, giữ đúng dữ liệu.",
      ].filter(Boolean).join("\n\n");

      const { output: rawOut, usage } = await callAnthropic(t, item.input_data, feedback);
      const output = coerceToSchema(rawOut, t.output_schema);
      const gates = runItemGates({
        output,
        inputData: item.input_data,
        outputSchema: t.output_schema,
        guards: (t.guards ?? {}) as Guards,
      });
      const status = statusFromGates(gates);

      await admin.from("prose_items").update({
        output,
        edited_output: null,
        status,
        validation: gates,
        regen_count: (item.regen_count ?? 0) + 1,
        reviewer: userId,
        review_note: note || item.review_note,
      }).eq("id", itemId);

      await admin.from("prose_jobs").update({
        tokens_in: Number(job.tokens_in ?? 0) + usage.input_tokens,
        tokens_out: Number(job.tokens_out ?? 0) + usage.output_tokens,
        cost_usd: Math.round((Number(job.cost_usd ?? 0) + costUsd(t.model, usage)) * 10000) / 10000,
      }).eq("id", item.job_id);

      return adminJson(cors, {
        item: { id: itemId, status, validation: gates, output, regen_count: (item.regen_count ?? 0) + 1 },
      });
    }

    // ── test (Template Studio panel — nothing persisted) ──────────────
    if (action === "test") {
      const data = body.data;
      if (data == null) throw new Error("Thiếu data mẫu");
      let t: ProseTemplate;
      if (typeof body.template_id === "string" && body.template_id) {
        t = await loadTemplate(body.template_id);
      } else if (body.template && typeof body.template === "object") {
        const raw = body.template as Partial<ProseTemplate>;
        if (!raw.system_prompt || !raw.user_template || !raw.output_schema) {
          throw new Error("template cần system_prompt, user_template, output_schema");
        }
        t = {
          id: "test", key: "test", version: 0,
          system_prompt: raw.system_prompt,
          user_template: raw.user_template,
          output_schema: raw.output_schema as Record<string, unknown>,
          few_shots: raw.few_shots ?? [],
          guards: raw.guards ?? {},
          model: raw.model ?? "claude-sonnet-5",
          temperature: raw.temperature ?? 0.8,
          max_tokens: raw.max_tokens ?? 1200,
        };
      } else {
        throw new Error("Cần template_id hoặc template");
      }
      const { output: rawOut, usage } = await callAnthropic(t, data);
      const output = coerceToSchema(rawOut, t.output_schema);
      const gates = runItemGates({
        output,
        inputData: data,
        outputSchema: t.output_schema,
        guards: (t.guards ?? {}) as Guards,
      });
      return adminJson(cors, {
        output,
        validation: gates,
        status: statusFromGates(gates),
        usage,
        usd: Math.round(costUsd(t.model, usage) * 10000) / 10000,
      });
    }

    return adminJson(cors, { error: { code: "BAD_REQUEST", message: `Unknown action "${action}"` } }, 400);
  } catch (e) {
    console.error("prose-generate", action, e);
    return adminJson(cors, {
      error: { code: "INTERNAL", message: e instanceof Error ? e.message : "Generation failed" },
    }, 500);
  }
});
