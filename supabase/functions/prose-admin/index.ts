/**
 * Prose engine — data/review endpoint (no Anthropic access; see prose-generate).
 *
 * POST { action, ... }:
 *   templates.list                              → all template versions
 *   templates.create {template}                 → insert; version = max(key)+1
 *   jobs.create {template_id, items:[{item_key,data}], review_sample_pct?}
 *                                               → job + items (unique-cache aware)
 *   jobs.list                                   → jobs + template + status counts
 *   jobs.get {job_id}                           → job + template + items
 *   items.review {item_id, verdict:'approve'|'reject', note?}
 *   items.edit {item_id, edited_output}         → save human edit (re-runs item gates)
 *   items.validate {job_id}                     → batch gates: phrase_frequency +
 *                                                 similarity (batch ∪ published corpus)
 *   publish {job_id}                            → approved → published (immutable)
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { adminJson, isUuid, requireAdmin } from "../_shared/admin-auth.ts";
import { corsHeadersForRequest } from "../_shared/cors.ts";
import {
  type GateResult,
  type Guards,
  runItemGates,
  runPhraseFrequency,
  similarityMatrix,
  statusFromGates,
  textOfOutput,
} from "../_shared/prose-guards.ts";

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Stable stringify (sorted keys) so data_hash is order-insensitive. */
function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${
      Object.keys(v as Record<string, unknown>).sort().map((k) =>
        `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`
      ).join(",")
    }}`;
  }
  return JSON.stringify(v);
}

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

  try {
    // ── templates ─────────────────────────────────────────────────────
    if (action === "templates.list") {
      const { data, error } = await admin
        .from("prose_templates")
        .select("*")
        .order("key", { ascending: true })
        .order("version", { ascending: false });
      if (error) throw error;
      return adminJson(cors, { templates: data ?? [] });
    }

    if (action === "templates.create") {
      const t = body.template as Record<string, unknown> | undefined;
      if (!t || typeof t !== "object") throw new Error("Thiếu template");
      const key = String(t.key ?? "").trim();
      if (!/^[a-z0-9-]{2,40}$/u.test(key)) throw new Error("key: chữ thường, số, gạch ngang");
      for (const f of ["name", "system_prompt", "user_template"]) {
        if (!String(t[f] ?? "").trim()) throw new Error(`Thiếu ${f}`);
      }
      if (!t.output_schema || typeof t.output_schema !== "object") {
        throw new Error("output_schema phải là JSON Schema object");
      }
      const { data: prev } = await admin
        .from("prose_templates").select("version").eq("key", key)
        .order("version", { ascending: false }).limit(1);
      const version = (prev?.[0]?.version ?? 0) + 1;
      const { data, error } = await admin.from("prose_templates").insert({
        key,
        version,
        name: String(t.name).trim(),
        system_prompt: String(t.system_prompt),
        user_template: String(t.user_template),
        output_schema: t.output_schema,
        few_shots: Array.isArray(t.few_shots) ? t.few_shots : [],
        guards: t.guards && typeof t.guards === "object" ? t.guards : {},
        model: String(t.model ?? "claude-sonnet-5"),
        temperature: Number(t.temperature ?? 0.8),
        max_tokens: Number(t.max_tokens ?? 1200),
        created_by: userId,
      }).select().single();
      if (error) throw error;
      return adminJson(cors, { template: data });
    }

    // ── jobs ──────────────────────────────────────────────────────────
    if (action === "jobs.create") {
      const templateId = String(body.template_id ?? "");
      if (!isUuid(templateId)) throw new Error("template_id không hợp lệ");
      const rawItems = body.items;
      if (!Array.isArray(rawItems) || rawItems.length === 0) {
        throw new Error("items phải là mảng [{item_key, data}] không rỗng");
      }
      if (rawItems.length > 200) throw new Error("Realtime mode giới hạn 200 item/job (Phase A)");
      const { data: t, error: tErr } = await admin
        .from("prose_templates").select("id, key, version").eq("id", templateId).single();
      if (tErr || !t) throw new Error("Template không tồn tại");

      const seen = new Set<string>();
      const items: Array<{ item_key: string; data: unknown; hash: string }> = [];
      for (const raw of rawItems) {
        const r = raw as Record<string, unknown>;
        const itemKey = String(r.item_key ?? r.itemKey ?? "").trim();
        if (!itemKey) throw new Error("Mỗi item cần item_key");
        if (seen.has(itemKey)) throw new Error(`item_key trùng trong job: ${itemKey}`);
        seen.add(itemKey);
        const data = r.data ?? r.input_data;
        if (data == null || typeof data !== "object") {
          throw new Error(`item ${itemKey}: thiếu data (object)`);
        }
        items.push({ item_key: itemKey, data, hash: await sha256Hex(stableStringify(data)) });
      }

      const { data: job, error: jErr } = await admin.from("prose_jobs").insert({
        template_id: templateId,
        status: "draft",
        mode: "realtime",
        item_count: items.length,
        review_sample_pct: Number(body.review_sample_pct ?? 5),
        created_by: userId,
      }).select().single();
      if (jErr) throw jErr;

      // unique(template_key, template_version, item_key, data_hash) is the
      // cross-job cache: rows that already exist under the SAME template
      // version (same data) are skipped, not re-generated. A new template
      // version regenerates everything.
      const { error: iErr, data: inserted } = await admin.from("prose_items")
        .upsert(
          items.map((it) => ({
            job_id: job.id,
            template_key: t.key,
            template_version: t.version,
            item_key: it.item_key,
            data_hash: it.hash,
            input_data: it.data,
            status: "pending",
          })),
          { onConflict: "template_key,template_version,item_key,data_hash", ignoreDuplicates: true },
        )
        .select("id");
      if (iErr) throw iErr;
      const insertedCount = inserted?.length ?? 0;
      if (insertedCount !== items.length) {
        await admin.from("prose_jobs").update({ item_count: insertedCount }).eq("id", job.id);
      }
      return adminJson(cors, {
        job: { ...job, item_count: insertedCount },
        skipped_cached: items.length - insertedCount,
      });
    }

    if (action === "jobs.list") {
      const { data: jobs, error } = await admin
        .from("prose_jobs")
        .select("*, prose_templates(key, version, name, model)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const ids = (jobs ?? []).map((j) => j.id);
      const counts: Record<string, Record<string, number>> = {};
      if (ids.length) {
        const { data: items } = await admin
          .from("prose_items").select("job_id, status").in("job_id", ids);
        for (const it of items ?? []) {
          counts[it.job_id] ??= {};
          counts[it.job_id][it.status] = (counts[it.job_id][it.status] ?? 0) + 1;
        }
      }
      return adminJson(cors, {
        jobs: (jobs ?? []).map((j) => ({ ...j, status_counts: counts[j.id] ?? {} })),
      });
    }

    if (action === "jobs.get") {
      const jobId = String(body.job_id ?? "");
      if (!isUuid(jobId)) throw new Error("job_id không hợp lệ");
      const { data: job, error } = await admin
        .from("prose_jobs")
        .select("*, prose_templates(id, key, version, name, model, guards, output_schema, user_template)")
        .eq("id", jobId).single();
      if (error || !job) throw new Error("Job không tồn tại");
      const { data: items, error: iErr } = await admin
        .from("prose_items").select("*").eq("job_id", jobId)
        .order("item_key", { ascending: true });
      if (iErr) throw iErr;
      return adminJson(cors, { job, items: items ?? [] });
    }

    // ── review actions ────────────────────────────────────────────────
    if (action === "items.review") {
      const itemId = String(body.item_id ?? "");
      if (!isUuid(itemId)) throw new Error("item_id không hợp lệ");
      const verdict = String(body.verdict ?? "");
      if (verdict !== "approve" && verdict !== "reject") {
        throw new Error('verdict phải là "approve" | "reject"');
      }
      const note = typeof body.note === "string" ? body.note.trim() : null;
      const { data: item, error: gErr } = await admin
        .from("prose_items").select("id, status").eq("id", itemId).single();
      if (gErr || !item) throw new Error("Item không tồn tại");
      if (item.status === "published") throw new Error("Item đã published — bất biến");
      const { data, error } = await admin.from("prose_items").update({
        status: verdict === "approve" ? "approved" : "rejected",
        reviewer: userId,
        review_note: note,
      }).eq("id", itemId).select().single();
      if (error) throw error;
      return adminJson(cors, { item: data });
    }

    if (action === "items.edit") {
      const itemId = String(body.item_id ?? "");
      if (!isUuid(itemId)) throw new Error("item_id không hợp lệ");
      const edited = body.edited_output;
      if (edited == null || typeof edited !== "object") {
        throw new Error("edited_output phải là object đúng schema");
      }
      const { data: item, error: gErr } = await admin
        .from("prose_items")
        .select("id, status, input_data, job_id, prose_jobs(template_id)")
        .eq("id", itemId).single();
      if (gErr || !item) throw new Error("Item không tồn tại");
      if (item.status === "published") throw new Error("Item đã published — bất biến");
      const jobRel = item.prose_jobs as unknown as { template_id: string };
      const { data: t } = await admin
        .from("prose_templates").select("output_schema, guards").eq("id", jobRel.template_id).single();
      const gates = runItemGates({
        output: edited,
        inputData: item.input_data,
        outputSchema: t?.output_schema ?? {},
        guards: (t?.guards ?? {}) as Guards,
      });
      const failed = gates.filter((g) => !g.ok && g.severity === "fail");
      if (failed.length) {
        return adminJson(cors, {
          error: {
            code: "VALIDATION",
            message: `Bản sửa không đạt gate: ${failed.map((g) => `[${g.gate}] ${g.detail}`).join("; ")}`,
          },
        }, 400);
      }
      const { data, error } = await admin.from("prose_items").update({
        edited_output: edited,
        validation: gates,
        reviewer: userId,
      }).eq("id", itemId).select().single();
      if (error) throw error;
      return adminJson(cors, { item: data });
    }

    // ── batch validation: phrase_frequency + similarity ───────────────
    if (action === "items.validate") {
      const jobId = String(body.job_id ?? "");
      if (!isUuid(jobId)) throw new Error("job_id không hợp lệ");
      const { data: job, error: jErr } = await admin
        .from("prose_jobs").select("id, template_id").eq("id", jobId).single();
      if (jErr || !job) throw new Error("Job không tồn tại");
      const { data: t } = await admin
        .from("prose_templates").select("key, guards").eq("id", job.template_id).single();
      const guards = (t?.guards ?? {}) as Guards;

      const { data: items, error: iErr } = await admin
        .from("prose_items")
        .select("id, item_key, status, output, edited_output, validation")
        .eq("job_id", jobId)
        .in("status", ["generated", "flagged"]);
      if (iErr) throw iErr;
      const batch = (items ?? []).map((it) => ({
        id: it.id,
        item_key: it.item_key,
        validation: (it.validation ?? []) as GateResult[],
        text: textOfOutput(it.edited_output ?? it.output),
      }));
      if (batch.length === 0) return adminJson(cors, { updated: 0 });

      // Published corpus of the same template joins the similarity pool.
      const { data: corpus } = await admin
        .from("prose_items")
        .select("id, item_key, output, edited_output")
        .eq("template_key", t?.key ?? "")
        .eq("status", "published")
        .limit(500);
      const pool = [
        ...batch.map((b) => ({ id: b.id, text: b.text })),
        ...(corpus ?? []).map((c) => ({
          id: `pub:${c.item_key}`,
          text: textOfOutput(c.edited_output ?? c.output),
        })),
      ];
      const sim = similarityMatrix(pool);
      const keyOfId = new Map(batch.map((b) => [b.id, b.item_key]));
      for (const c of corpus ?? []) keyOfId.set(`pub:${c.item_key}`, c.item_key);
      const freq = runPhraseFrequency(guards, batch);
      const threshold = guards.similarity?.threshold ?? 0.9;

      let updated = 0;
      for (const b of batch) {
        const s = sim.get(b.id) ?? { maxScore: 0, nearestId: null };
        const simGate: GateResult = {
          gate: "similarity",
          ok: s.maxScore < threshold,
          severity: "flag",
          detail: `cosine ${s.maxScore} với "${
            s.nearestId ? keyOfId.get(s.nearestId) ?? s.nearestId : "—"
          }" (ngưỡng ${threshold})`,
        };
        const others = (b.validation).filter(
          (g) => g.gate !== "similarity" && g.gate !== "phrase_frequency",
        );
        const gates = [...others, simGate, ...(freq.get(b.id) ?? [])];
        const status = statusFromGates(gates);
        const { error } = await admin.from("prose_items").update({
          validation: gates,
          status,
          similarity: {
            maxScore: s.maxScore,
            nearestItemKey: s.nearestId ? keyOfId.get(s.nearestId) ?? null : null,
          },
        }).eq("id", b.id);
        if (!error) updated++;
      }
      return adminJson(cors, { updated });
    }

    // ── publish ───────────────────────────────────────────────────────
    if (action === "publish") {
      const jobId = String(body.job_id ?? "");
      if (!isUuid(jobId)) throw new Error("job_id không hợp lệ");
      const { data, error } = await admin.from("prose_items")
        .update({ status: "published" })
        .eq("job_id", jobId).eq("status", "approved")
        .select("id");
      if (error) throw error;
      const published = data?.length ?? 0;
      if (published > 0) {
        await admin.from("prose_jobs").update({
          status: "published",
          finished_at: new Date().toISOString(),
        }).eq("id", jobId);
      }
      return adminJson(cors, { published });
    }

    return adminJson(cors, { error: { code: "BAD_REQUEST", message: `Unknown action "${action}"` } }, 400);
  } catch (e) {
    console.error("prose-admin", action, e);
    return adminJson(cors, {
      error: { code: "INTERNAL", message: e instanceof Error ? e.message : "Request failed" },
    }, 500);
  }
});
