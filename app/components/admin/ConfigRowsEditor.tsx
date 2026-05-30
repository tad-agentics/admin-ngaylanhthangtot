import { useCallback, useEffect, useMemo, useState } from "react";

import {
  type AdminConfigTable,
  patchAdminConfigRow,
} from "~/lib/admin-config";
import { appConfigRowKey } from "~/lib/credit-config-keys";
import { cn } from "~/lib/utils";

const READONLY_KEYS = new Set([
  "id",
  "config_key",
  "created_at",
  "updated_at",
  "last_modified",
]);

const APP_CONFIG_EDITABLE = new Set(["value"]);

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
  if (key === "sort_order" || key === "display_order") {
    return !isJsonField(key, sample) && typeof sample !== "boolean";
  }
  return false;
}

function isEditableConfigKey(table: AdminConfigTable, key: string): boolean {
  if (table === "app_config") return APP_CONFIG_EDITABLE.has(key);
  return !READONLY_KEYS.has(key);
}

function parseJsonField(text: string): unknown {
  const t = text.trim();
  if (t === "") return null;
  return JSON.parse(t) as unknown;
}

function formatReadonlyValue(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "object") {
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }
  return String(val);
}

type EditableRowProps = {
  table: AdminConfigTable;
  row: Record<string, unknown>;
  onSaved: () => void;
};

function EditableConfigRow({ table, row, onSaved }: EditableRowProps) {
  const configKey = appConfigRowKey(row);
  const keys = useMemo(
    () => Object.keys(row).filter((k) => isEditableConfigKey(table, k)),
    [row, table],
  );

  const [draft, setDraft] = useState<Record<string, unknown>>(() => ({ ...row }));
  const [jsonTexts, setJsonTexts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const k of keys) {
      if (isJsonField(k, row[k])) {
        init[k] = stableStringify(row[k]);
      }
    }
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setDraft({ ...row });
    const init: Record<string, string> = {};
    for (const k of keys) {
      if (isJsonField(k, row[k])) {
        init[k] = stableStringify(row[k]);
      }
    }
    setJsonTexts(init);
  }, [row, keys]);

  const hasChanges = useMemo(() => {
    for (const k of keys) {
      if (isJsonField(k, row[k])) {
        try {
          const parsed = parseJsonField(jsonTexts[k] ?? "");
          if (stableStringify(parsed) !== stableStringify(row[k])) return true;
        } catch {
          return true;
        }
      } else if (stableStringify(draft[k]) !== stableStringify(row[k])) {
        return true;
      }
    }
    return false;
  }, [keys, row, draft, jsonTexts]);

  const save = useCallback(async () => {
    setError(null);
    setMessage(null);
    const patch: Record<string, unknown> = {};
    for (const k of keys) {
      if (READONLY_KEYS.has(k)) continue;
      if (isJsonField(k, row[k])) {
        try {
          const parsed = parseJsonField(jsonTexts[k] ?? "");
          if (stableStringify(parsed) !== stableStringify(row[k])) {
            patch[k] = parsed;
          }
        } catch {
          setError(`JSON không hợp lệ ở cột ${k}`);
          return;
        }
      } else if (stableStringify(draft[k]) !== stableStringify(row[k])) {
        patch[k] = draft[k];
      }
    }

    if (Object.keys(patch).length === 0) {
      setMessage("Không có thay đổi");
      return;
    }

    setSaving(true);
    try {
      await patchAdminConfigRow(table, configKey, patch);
      setMessage("Đã lưu");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [keys, row, draft, jsonTexts, table, configKey, onSaved]);

  return (
    <div className="space-y-3 rounded-xl border border-admin-border-subtle bg-admin-card/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-xs font-medium text-foreground" title={configKey}>
          {configKey || "—"}
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
        {keys.map((k) => {
          const readOnly = !isEditableConfigKey(table, k);
          return (
            <label key={k} className="block space-y-1">
              <span className="text-xs font-medium text-admin-text-secondary">
                {k}
                {readOnly ? (
                  <span className="ml-1 font-normal text-admin-text-secondary/70">
                    (chỉ đọc)
                  </span>
                ) : null}
              </span>
              {readOnly ? (
                <div className="rounded-lg border border-admin-border-subtle bg-admin-canvas/50 px-2 py-1.5 text-sm text-foreground">
                  {formatReadonlyValue(row[k])}
                </div>
              ) : isJsonField(k, row[k]) ? (
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
          );
        })}
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
