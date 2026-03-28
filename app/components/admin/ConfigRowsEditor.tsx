import { useCallback, useEffect, useMemo, useState } from "react";

import {
  type AdminConfigTable,
  patchAdminConfigRow,
} from "~/lib/admin-config";
import { cn } from "~/lib/utils";

const READONLY_KEYS = new Set([
  "id",
  "created_at",
  "updated_at",
  "last_modified",
]);

function stableStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function isJsonField(key: string, sample: unknown): boolean {
  if (key === "value" || key === "metadata") return true;
  if (sample !== null && typeof sample === "object") return true;
  return false;
}

function isBoolField(key: string, sample: unknown): boolean {
  if (typeof sample === "boolean") return true;
  if (key === "is_active" || key === "active") return true;
  return false;
}

function isNumberField(key: string, sample: unknown): boolean {
  if (typeof sample === "number" && Number.isFinite(sample)) return true;
  if (
    key.endsWith("_cost") ||
    key.endsWith("_costs") ||
    key === "credits" ||
    key === "sort_order" ||
    key === "display_order"
  ) {
    return !isJsonField(key, sample) && typeof sample !== "boolean";
  }
  return false;
}

function parseJsonField(text: string): unknown {
  const t = text.trim();
  if (t === "") return null;
  return JSON.parse(t) as unknown;
}

type EditableRowProps = {
  table: AdminConfigTable;
  row: Record<string, unknown>;
  onSaved: () => void;
};

function EditableConfigRow({ table, row, onSaved }: EditableRowProps) {
  const id = String(row.id ?? "");
  const keys = useMemo(
    () =>
      Object.keys(row)
        .filter((k) => !READONLY_KEYS.has(k))
        .sort(),
    [row],
  );

  const [draft, setDraft] = useState<Record<string, unknown>>(() => ({ ...row }));
  const [jsonTexts, setJsonTexts] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const k of Object.keys(row)) {
      if (READONLY_KEYS.has(k)) continue;
      if (isJsonField(k, row[k])) {
        try {
          o[k] = JSON.stringify(row[k], null, 2);
        } catch {
          o[k] = String(row[k]);
        }
      }
    }
    return o;
  });

  useEffect(() => {
    setDraft({ ...row });
    const o: Record<string, string> = {};
    for (const k of Object.keys(row)) {
      if (READONLY_KEYS.has(k)) continue;
      if (isJsonField(k, row[k])) {
        try {
          o[k] = JSON.stringify(row[k], null, 2);
        } catch {
          o[k] = String(row[k]);
        }
      }
    }
    setJsonTexts(o);
  }, [row]);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasChanges = useMemo(() => {
    for (const k of keys) {
      if (isJsonField(k, row[k])) {
        let parsed: unknown;
        try {
          parsed = parseJsonField(jsonTexts[k] ?? "");
        } catch {
          return true;
        }
        if (stableStringify(parsed) !== stableStringify(row[k])) return true;
      } else if (stableStringify(draft[k]) !== stableStringify(row[k])) {
        return true;
      }
    }
    return false;
  }, [keys, row, draft, jsonTexts]);

  const save = useCallback(async () => {
    setMessage(null);
    setError(null);
    const patch: Record<string, unknown> = {};

    try {
      for (const k of keys) {
        if (isJsonField(k, row[k])) {
          const raw = jsonTexts[k] ?? "";
          let parsed: unknown;
          try {
            parsed = parseJsonField(raw);
          } catch {
            throw new Error(`Cột “${k}”: JSON không hợp lệ`);
          }
          if (stableStringify(parsed) !== stableStringify(row[k])) {
            patch[k] = parsed;
          }
        } else if (isBoolField(k, row[k])) {
          const next = Boolean(draft[k]);
          if (next !== row[k]) patch[k] = next;
        } else if (isNumberField(k, row[k])) {
          const raw = String(draft[k] ?? "").trim();
          let next: number | null;
          if (raw === "") next = null;
          else {
            const n = Number(raw);
            if (!Number.isFinite(n)) {
              throw new Error(`Cột “${k}”: cần số hợp lệ`);
            }
            next = n;
          }
          if (stableStringify(next) !== stableStringify(row[k])) {
            patch[k] = next;
          }
        } else {
          const next = draft[k];
          if (stableStringify(next) !== stableStringify(row[k])) {
            patch[k] = next;
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }

    if (Object.keys(patch).length === 0) {
      setMessage("Không có thay đổi");
      return;
    }

    setSaving(true);
    try {
      await patchAdminConfigRow(table, id, patch);
      setMessage("Đã lưu");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [keys, row, draft, jsonTexts, table, id, onSaved]);

  return (
    <div className="space-y-3 rounded-xl border border-admin-border-subtle bg-admin-card/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-xs text-admin-text-secondary" title={id}>
          id: {id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id}
        </p>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !hasChanges}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-medium transition",
            hasChanges && !saving
              ? "bg-foreground text-background hover:opacity-90"
              : "cursor-not-allowed bg-admin-canvas text-admin-text-secondary",
          )}
        >
          {saving ? "Đang lưu…" : "Lưu thay đổi"}
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {keys.map((k) => (
          <label key={k} className="block space-y-1">
            <span className="text-xs font-medium text-admin-text-secondary">
              {k}
            </span>
            {isJsonField(k, row[k]) ? (
              <textarea
                value={jsonTexts[k] ?? ""}
                onChange={(e) =>
                  setJsonTexts((prev) => ({ ...prev, [k]: e.target.value }))
                }
                rows={6}
                spellCheck={false}
                className="w-full rounded-lg border border-admin-border-subtle bg-background px-2 py-1.5 font-mono text-xs"
              />
            ) : isBoolField(k, row[k]) ? (
              <input
                type="checkbox"
                checked={Boolean(draft[k])}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, [k]: e.target.checked }))
                }
                className="mt-1 size-4 rounded border-admin-border-subtle"
              />
            ) : isNumberField(k, row[k]) ? (
              <input
                type="number"
                value={
                  draft[k] === null || draft[k] === undefined
                    ? ""
                    : String(draft[k] as number)
                }
                onChange={(e) => {
                  const v = e.target.value;
                  setDraft((prev) => ({
                    ...prev,
                    [k]: v === "" ? null : Number(v),
                  }));
                }}
                className="w-full rounded-lg border border-admin-border-subtle bg-background px-2 py-1.5 text-sm tabular-nums"
              />
            ) : (
              <input
                type="text"
                value={
                  draft[k] === null || draft[k] === undefined
                    ? ""
                    : String(draft[k] as string)
                }
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, [k]: e.target.value }))
                }
                className="w-full rounded-lg border border-admin-border-subtle bg-background px-2 py-1.5 text-sm"
              />
            )}
          </label>
        ))}
      </div>
      {error ? (
        <p className="text-xs text-red-700">{error}</p>
      ) : message ? (
        <p className="text-xs text-emerald-800">{message}</p>
      ) : null}
    </div>
  );
}

type ConfigRowsEditorProps = {
  table: AdminConfigTable;
  rows: Record<string, unknown>[];
  onSaved: () => void;
};

export function ConfigRowsEditor({
  table,
  rows,
  onSaved,
}: ConfigRowsEditorProps) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-admin-text-secondary">Chưa có bản ghi.</p>
    );
  }
  return (
    <div className="space-y-4">
      {rows.map((row, i) => (
        <EditableConfigRow
          key={String(row.id ?? i)}
          table={table}
          row={row}
          onSaved={onSaved}
        />
      ))}
    </div>
  );
}