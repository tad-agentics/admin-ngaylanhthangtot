import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  AdminForbiddenHint,
  AdminShell,
  EnvBanner,
} from "~/components/admin/AdminShell";
import { GateList } from "~/components/prose/bits";
import { useAuth } from "~/lib/auth";
import {
  createTemplate,
  fetchTemplates,
  MODEL_OPTIONS,
  testTemplate,
  type ProseTemplate,
  type TestResult,
} from "~/lib/prose";
import { adminKeys } from "~/lib/query-keys";
import { cn } from "~/lib/utils";

const AREA =
  "mt-1 w-full rounded-lg border border-admin-border-subtle bg-background px-2 py-1.5 font-mono text-xs leading-relaxed";
const FIELD =
  "mt-1 h-9 w-full rounded-lg border border-admin-border-subtle bg-background px-2 text-sm";

type Draft = {
  key: string;
  name: string;
  model: string;
  temperature: string;
  max_tokens: string;
  system_prompt: string;
  user_template: string;
  output_schema: string;
  guards: string;
  few_shots: string;
};

const EMPTY: Draft = {
  key: "",
  name: "",
  model: "claude-sonnet-5",
  temperature: "0.8",
  max_tokens: "1200",
  system_prompt: "",
  user_template: "",
  output_schema: `{\n  "type": "object",\n  "required": [],\n  "properties": {}\n}`,
  guards: "{}",
  few_shots: "[]",
};

function toDraft(t: ProseTemplate): Draft {
  return {
    key: t.key,
    name: t.name,
    model: t.model,
    temperature: String(t.temperature),
    max_tokens: String(t.max_tokens),
    system_prompt: t.system_prompt,
    user_template: t.user_template,
    output_schema: JSON.stringify(t.output_schema, null, 2),
    guards: JSON.stringify(t.guards, null, 2),
    few_shots: JSON.stringify(t.few_shots, null, 2),
  };
}

function parseDraft(d: Draft): Partial<ProseTemplate> {
  let output_schema: Record<string, unknown>;
  let guards: Record<string, unknown>;
  let few_shots: ProseTemplate["few_shots"];
  try {
    output_schema = JSON.parse(d.output_schema);
  } catch {
    throw new Error("output_schema không phải JSON hợp lệ");
  }
  try {
    guards = JSON.parse(d.guards);
  } catch {
    throw new Error("guards không phải JSON hợp lệ");
  }
  try {
    few_shots = JSON.parse(d.few_shots);
    if (!Array.isArray(few_shots)) throw new Error();
  } catch {
    throw new Error("few_shots phải là mảng JSON [{input, output}]");
  }
  return {
    key: d.key.trim(),
    name: d.name.trim(),
    model: d.model.trim(),
    temperature: Number(d.temperature),
    max_tokens: Number.parseInt(d.max_tokens, 10),
    system_prompt: d.system_prompt,
    user_template: d.user_template,
    output_schema,
    guards,
    few_shots,
  };
}

export default function ProseTemplatesRoute() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [testData, setTestData] = useState("");
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: adminKeys.proseTemplates(),
    queryFn: fetchTemplates,
    enabled: Boolean(user),
  });
  const templates = listQuery.data?.templates ?? [];

  const saveMutation = useMutation({
    mutationFn: createTemplate,
    onSuccess: async (res) => {
      setFormError(null);
      setSelectedId(res.template.id);
      await queryClient.invalidateQueries({ queryKey: adminKeys.proseTemplates() });
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const testMutation = useMutation({
    mutationFn: testTemplate,
    onSuccess: (res) => {
      setTestError(null);
      setTestResult(res);
    },
    onError: (e: Error) => {
      setTestResult(null);
      setTestError(e.message);
    },
  });

  function select(t: ProseTemplate) {
    setSelectedId(t.id);
    setDraft(toDraft(t));
    setFormError(null);
    setTestResult(null);
  }

  function set<K extends keyof Draft>(k: K, v: string) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  function handleSave() {
    try {
      saveMutation.mutate(parseDraft(draft));
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    }
  }

  function handleTest() {
    setTestError(null);
    let data: unknown;
    try {
      data = JSON.parse(testData);
    } catch {
      setTestError("Dữ liệu mẫu không phải JSON hợp lệ");
      return;
    }
    // Accept what people actually paste from the job-input files:
    // a whole array → first item; an {item_key, data} wrapper → inner data.
    if (Array.isArray(data)) data = data[0];
    if (
      data &&
      typeof data === "object" &&
      "data" in data &&
      "item_key" in data
    ) {
      data = (data as { data: unknown }).data;
    }
    try {
      testMutation.mutate({ template: parseDraft(draft), data });
    } catch (e) {
      setTestError(e instanceof Error ? e.message : String(e));
    }
  }

  const displayName =
    user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "Admin";

  return (
    <AdminShell
      activeNav="prose-templates"
      userName={displayName}
      onRefresh={() => void listQuery.refetch()}
      refreshing={listQuery.isFetching}
    >
      <EnvBanner />
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Template Studio</h1>
          <p className="mt-1 max-w-2xl text-sm text-admin-text-secondary">
            Mỗi loại trang SEO là một template: prompt + schema + few-shots + guards.
            Template đã dùng là bất biến — lưu tạo <em>phiên bản mới</em>.
          </p>
        </div>

        <AdminForbiddenHint error={listQuery.error?.message ?? null} email={user?.email ?? null} />

        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          {/* list */}
          <div className="rounded-2xl border border-admin-border-subtle bg-admin-card p-2">
            <button
              type="button"
              onClick={() => {
                setSelectedId(null);
                setDraft(EMPTY);
                setTestResult(null);
              }}
              className="mb-1 w-full rounded-lg bg-neutral-950 px-3 py-2 text-left text-sm font-medium text-white"
            >
              + Template mới
            </button>
            {listQuery.isLoading ? (
              <p className="px-3 py-4 text-sm text-admin-text-secondary">Đang tải…</p>
            ) : (
              <ul className="space-y-0.5">
                {templates.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => select(t)}
                      className={cn(
                        "w-full rounded-lg px-3 py-2 text-left text-sm",
                        selectedId === t.id
                          ? "bg-admin-canvas font-medium text-foreground"
                          : "text-admin-text-secondary hover:bg-black/[0.03]",
                      )}
                    >
                      <span className="font-mono text-xs">{t.key}</span>
                      <span className="ml-1 text-xs">v{t.version}</span>
                      <span className="block truncate text-xs text-admin-text-secondary">{t.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* editor */}
          <div className="space-y-4">
            <div className="space-y-3 rounded-2xl border border-admin-border-subtle bg-admin-card p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium">key (slug loại trang)</label>
                  <input value={draft.key} onChange={(e) => set("key", e.target.value)} placeholder="p1-day" className={cn(FIELD, "font-mono")} />
                </div>
                <div>
                  <label className="block text-xs font-medium">Tên</label>
                  <input value={draft.name} onChange={(e) => set("name", e.target.value)} className={FIELD} />
                </div>
                <div>
                  <label className="block text-xs font-medium">Model</label>
                  <select
                    value={draft.model}
                    onChange={(e) => set("model", e.target.value)}
                    className={FIELD}
                  >
                    {/* Keep an unknown/legacy value selectable instead of silently swapping it. */}
                    {MODEL_OPTIONS.some((m) => m.id === draft.model) ? null : (
                      <option value={draft.model}>{draft.model}</option>
                    )}
                    {MODEL_OPTIONS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium">
                      Temperature{" "}
                      <span className="font-normal text-admin-text-secondary">
                        (chỉ model đời cũ, vd Haiku 4.5 — Sonnet 5 bỏ qua)
                      </span>
                    </label>
                    <input value={draft.temperature} onChange={(e) => set("temperature", e.target.value)} className={FIELD} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium">Max tokens</label>
                    <input value={draft.max_tokens} onChange={(e) => set("max_tokens", e.target.value)} className={FIELD} />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium">System prompt (voice charter)</label>
                <textarea rows={10} value={draft.system_prompt} onChange={(e) => set("system_prompt", e.target.value)} className={AREA} />
              </div>
              <div>
                <label className="block text-xs font-medium">
                  User template — <code className="rounded bg-admin-canvas px-1">{"{{json data}}"}</code>,{" "}
                  <code className="rounded bg-admin-canvas px-1">{"{{data.x.y}}"}</code>
                </label>
                <textarea rows={5} value={draft.user_template} onChange={(e) => set("user_template", e.target.value)} className={AREA} />
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium">Output schema (JSON Schema)</label>
                  <textarea rows={8} value={draft.output_schema} onChange={(e) => set("output_schema", e.target.value)} className={AREA} />
                </div>
                <div>
                  <label className="block text-xs font-medium">Guards</label>
                  <textarea rows={8} value={draft.guards} onChange={(e) => set("guards", e.target.value)} className={AREA} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium">
                  Few-shots — mảng {"[{input: {data: …}, output: …}]"} ({(() => {
                    try {
                      return `${(JSON.parse(draft.few_shots) as unknown[]).length} mẫu`;
                    } catch {
                      return "JSON lỗi";
                    }
                  })()})
                </label>
                <textarea rows={6} value={draft.few_shots} onChange={(e) => set("few_shots", e.target.value)} className={AREA} />
              </div>
              {formError ? <p className="text-sm text-red-700">{formError}</p> : null}
              <button
                type="button"
                disabled={saveMutation.isPending}
                onClick={handleSave}
                className="h-10 rounded-lg bg-neutral-950 px-4 text-sm font-medium text-white disabled:opacity-60"
              >
                {saveMutation.isPending ? "Đang lưu…" : "Lưu thành phiên bản mới"}
              </button>
            </div>

            {/* test panel */}
            <div className="space-y-3 rounded-2xl border border-admin-border-subtle bg-admin-card p-4">
              <p className="text-sm font-semibold text-foreground">Chạy thử template</p>
              <p className="text-xs text-admin-text-secondary">
                Dán một input mẫu (object <code className="rounded bg-admin-canvas px-1">data</code>) — gọi model thật,
                chạy đủ gate, không lưu gì.
              </p>
              <textarea
                rows={6}
                value={testData}
                onChange={(e) => setTestData(e.target.value)}
                placeholder='{"iso": "2026-08-01", "dayCanChi": "Đinh Tỵ", …}'
                className={AREA}
              />
              <button
                type="button"
                disabled={testMutation.isPending}
                onClick={handleTest}
                className="h-9 rounded-lg border border-admin-border-subtle bg-admin-canvas px-4 text-sm font-medium disabled:opacity-60"
              >
                {testMutation.isPending ? "Đang sinh…" : "Sinh thử"}
              </button>
              {testError ? <p className="text-sm text-red-700">{testError}</p> : null}
              {testResult ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium">Output ({testResult.usd.toFixed(4)} USD)</p>
                    <pre className="mt-1 max-h-72 overflow-auto rounded-lg bg-admin-canvas p-3 text-xs leading-relaxed whitespace-pre-wrap">
                      {JSON.stringify(testResult.output, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <p className="text-xs font-medium">Gates → {testResult.status}</p>
                    <div className="mt-1">
                      <GateList gates={testResult.validation} />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
