/**
 * Prose engine validation gates (spec §5) + 3-gram TF-IDF similarity (§6).
 *
 * Per-item gates run right after generation (prose-generate); batch gates
 * (phrase_frequency, similarity) run over a whole job (prose-admin
 * items.validate). Severity: 'fail' → failed_validation, 'flag' → flagged
 * (human review), both surfaced in prose_items.validation.
 */

export type GateResult = {
  gate: string;
  ok: boolean;
  severity: "fail" | "flag";
  detail: string;
};

export type Guards = {
  required_mentions?: Array<{ path: string; fields?: string[]; note?: string }>;
  banned_phrases?: string[];
  phrase_frequency?: Record<string, { maxPerBatch: number }>;
  length?: Record<string, { min?: number; max?: number }>;
  unicode?: boolean;
  numeric_consistency?: boolean;
  canchi_consistency?: boolean;
  similarity?: { threshold?: number };
};

/** Resolve "phanTich.0" / "data.dayCanChi" style paths. */
export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const seg of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/** All human-visible text of an output object, concatenated. */
export function textOfOutput(output: unknown): string {
  const parts: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") parts.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(output);
  return parts.join("\n");
}

// ── schema (lightweight JSON-schema subset: enough for our templates) ──

type Schema = {
  type?: string;
  required?: string[];
  properties?: Record<string, Schema>;
  items?: Schema;
  minItems?: number;
  maxItems?: number;
  additionalProperties?: boolean;
};

function checkSchema(value: unknown, schema: Schema, at: string, errs: string[]) {
  const t = schema.type;
  if (t === "object") {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
      errs.push(`${at}: expected object`);
      return;
    }
    const obj = value as Record<string, unknown>;
    for (const req of schema.required ?? []) {
      if (!(req in obj)) errs.push(`${at}: missing "${req}"`);
    }
    for (const [k, v] of Object.entries(obj)) {
      const sub = schema.properties?.[k];
      if (sub) checkSchema(v, sub, `${at}.${k}`, errs);
      else if (schema.additionalProperties === false) {
        errs.push(`${at}: unexpected "${k}"`);
      }
    }
  } else if (t === "array") {
    if (!Array.isArray(value)) {
      errs.push(`${at}: expected array`);
      return;
    }
    if (schema.minItems != null && value.length < schema.minItems) {
      errs.push(`${at}: needs ≥${schema.minItems} items`);
    }
    if (schema.maxItems != null && value.length > schema.maxItems) {
      errs.push(`${at}: needs ≤${schema.maxItems} items`);
    }
    if (schema.items) {
      value.forEach((v, i) => checkSchema(v, schema.items as Schema, `${at}[${i}]`, errs));
    }
  } else if (t === "string" && typeof value !== "string") {
    errs.push(`${at}: expected string`);
  } else if (t === "number" && typeof value !== "number") {
    errs.push(`${at}: expected number`);
  }
}

// ── per-item gates ─────────────────────────────────────────────────────

export function runItemGates(args: {
  output: unknown;
  inputData: unknown;
  outputSchema: unknown;
  guards: Guards;
}): GateResult[] {
  const { output, inputData, outputSchema, guards } = args;
  const results: GateResult[] = [];
  const text = textOfOutput(output);
  const textLower = text.toLowerCase();

  // schema — always on
  {
    const errs: string[] = [];
    checkSchema(output, (outputSchema ?? {}) as Schema, "$", errs);
    results.push({
      gate: "schema",
      ok: errs.length === 0,
      severity: "fail",
      detail: errs.slice(0, 5).join("; ") || "đúng schema",
    });
  }

  // required_mentions
  for (const rm of guards.required_mentions ?? []) {
    // Paths are written against the render context, i.e. "data.dayCanChi".
    const val = getPath({ data: inputData }, rm.path);
    const needle = typeof val === "string" ? val : val == null ? "" : String(val);
    const hay = rm.fields?.length
      ? rm.fields.map((f) => String(getPath(output, f) ?? "")).join("\n")
      : text;
    const ok = needle !== "" && hay.includes(needle);
    results.push({
      gate: "required_mentions",
      ok,
      severity: "fail",
      detail: ok
        ? `"${needle}" có mặt`
        : `thiếu "${needle || rm.path}"${rm.note ? ` — ${rm.note}` : ""}`,
    });
  }

  // banned_phrases
  {
    const hits = (guards.banned_phrases ?? []).filter((p) =>
      textLower.includes(p.toLowerCase())
    );
    results.push({
      gate: "banned_phrases",
      ok: hits.length === 0,
      severity: "fail",
      detail: hits.length ? `dùng cụm cấm: ${hits.join(", ")}` : "sạch",
    });
  }

  // length per field
  for (const [path, rule] of Object.entries(guards.length ?? {})) {
    const v = getPath(output, path);
    const len = typeof v === "string" ? [...v].length : -1;
    const ok = len >= 0 &&
      (rule.min == null || len >= rule.min) &&
      (rule.max == null || len <= rule.max);
    results.push({
      gate: "length",
      ok,
      severity: "fail",
      detail: `${path}: ${len} ký tự (cần ${rule.min ?? 0}–${rule.max ?? "∞"})`,
    });
  }

  // unicode — NFC, no stray combining marks
  if (guards.unicode !== false) {
    const nfc = text === text.normalize("NFC");
    const combining = /[̀-ͯ]/u.test(text);
    results.push({
      gate: "unicode",
      ok: nfc && !combining,
      severity: "fail",
      detail: nfc && !combining
        ? "NFC chuẩn"
        : `${nfc ? "" : "không phải NFC; "}${combining ? "chứa dấu tổ hợp U+0300–036F" : ""}`,
    });
  }

  // numeric_consistency — numbers in prose must exist in the input data
  if (guards.numeric_consistency) {
    const inputStr = JSON.stringify(inputData);
    const inputNums = new Set((inputStr.match(/\d+/g) ?? []).map((n) => String(Number(n))));
    const outNums = [...new Set(text.match(/\d+/g) ?? [])];
    const missing = outNums.filter((n) => !inputNums.has(String(Number(n))));
    results.push({
      gate: "numeric_consistency",
      ok: missing.length === 0,
      severity: "flag",
      detail: missing.length
        ? `số không có trong dữ liệu: ${missing.slice(0, 8).join(", ")}`
        : "mọi con số đều có trong dữ liệu",
    });
  }

  // canchi_consistency — every Can+Chi pair named in the prose must exist in
  // the input data (catches invented "dời sang ngày Kỷ Dậu" recommendations,
  // which numeric_consistency misses because they contain no digits). Flag
  // severity: pilot-style cross-day references land in review, not in a fail.
  if (guards.canchi_consistency !== false) {
    const CANCHI_RE =
      /(?:Giáp|Ất|Bính|Đinh|Mậu|Kỷ|Canh|Tân|Nhâm|Quý) (?:Tý|Sửu|Dần|Mão|Thìn|Tỵ|Ngọ|Mùi|Thân|Dậu|Tuất|Hợi)/gu;
    const inputStr = JSON.stringify(inputData);
    const pairs = [...new Set(text.normalize("NFC").match(CANCHI_RE) ?? [])];
    const missing = pairs.filter((p) => !inputStr.includes(p));
    results.push({
      gate: "canchi_consistency",
      ok: missing.length === 0,
      severity: "flag",
      detail: missing.length
        ? `can chi không có trong dữ liệu: ${missing.join(", ")}`
        : "mọi can chi đều có trong dữ liệu",
    });
  }

  return results;
}

// ── batch gates ────────────────────────────────────────────────────────

/**
 * phrase_frequency across a batch: returns per-item extra gate results for
 * items that push a phrase over its cap (register-stamping killer).
 */
export function runPhraseFrequency(
  guards: Guards,
  items: Array<{ id: string; text: string }>,
): Map<string, GateResult[]> {
  const out = new Map<string, GateResult[]>();
  for (const [phrase, rule] of Object.entries(guards.phrase_frequency ?? {})) {
    const needle = phrase.toLowerCase();
    const users = items.filter((it) => it.text.toLowerCase().includes(needle));
    if (users.length <= rule.maxPerBatch) continue;
    // Flag every item past the allowance (keep the first maxPerBatch).
    for (const it of users.slice(rule.maxPerBatch)) {
      const list = out.get(it.id) ?? [];
      list.push({
        gate: "phrase_frequency",
        ok: false,
        severity: "flag",
        detail: `"${phrase}" xuất hiện ở ${users.length}/${items.length} bài (cho phép ${rule.maxPerBatch})`,
      });
      out.set(it.id, list);
    }
  }
  return out;
}

// ── similarity: character 3-gram TF-IDF cosine ─────────────────────────

export function trigramCounts(text: string): Map<string, number> {
  const s = text.normalize("NFC").toLowerCase().replace(/\s+/gu, " ");
  const m = new Map<string, number>();
  for (let i = 0; i + 3 <= s.length; i++) {
    const g = s.slice(i, i + 3);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/**
 * Pairwise max cosine for each doc against all others, TF-IDF weighted over
 * the given corpus. Returns per-id {maxScore, nearestId}.
 */
export function similarityMatrix(
  docs: Array<{ id: string; text: string }>,
): Map<string, { maxScore: number; nearestId: string | null }> {
  const counts = docs.map((d) => trigramCounts(d.text));
  const df = new Map<string, number>();
  for (const c of counts) {
    for (const g of c.keys()) df.set(g, (df.get(g) ?? 0) + 1);
  }
  const n = docs.length;
  const vecs = counts.map((c) => {
    const v = new Map<string, number>();
    let norm = 0;
    for (const [g, tf] of c) {
      const idf = Math.log((n + 1) / ((df.get(g) ?? 0) + 1)) + 1;
      const w = tf * idf;
      v.set(g, w);
      norm += w * w;
    }
    return { v, norm: Math.sqrt(norm) };
  });
  const cosine = (a: (typeof vecs)[0], b: (typeof vecs)[0]) => {
    if (a.norm === 0 || b.norm === 0) return 0;
    const [small, big] = a.v.size <= b.v.size ? [a, b] : [b, a];
    let dot = 0;
    for (const [g, w] of small.v) {
      const bw = big.v.get(g);
      if (bw) dot += w * bw;
    }
    return dot / (a.norm * b.norm);
  };
  const out = new Map<string, { maxScore: number; nearestId: string | null }>();
  for (let i = 0; i < n; i++) {
    let maxScore = 0;
    let nearestId: string | null = null;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const s = cosine(vecs[i], vecs[j]);
      if (s > maxScore) {
        maxScore = s;
        nearestId = docs[j].id;
      }
    }
    out.set(docs[i].id, { maxScore: Math.round(maxScore * 1000) / 1000, nearestId });
  }
  return out;
}

/** Combine gate results → item status. */
export function statusFromGates(results: GateResult[]): "generated" | "flagged" | "failed_validation" {
  if (results.some((r) => !r.ok && r.severity === "fail")) return "failed_validation";
  if (results.some((r) => !r.ok && r.severity === "flag")) return "flagged";
  return "generated";
}
