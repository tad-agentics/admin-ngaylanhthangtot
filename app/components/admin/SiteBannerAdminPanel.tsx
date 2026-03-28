import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import {
  type SiteBannerGetResponse,
  type SiteBannerPayload,
  putAdminSiteBanner,
} from "~/lib/admin-site-banner";
import { adminKeys } from "~/lib/query-keys";
import { cn } from "~/lib/utils";

const MAX_MESSAGE = 600;

function formatDt(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("vi-VN", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

type SiteBannerAdminPanelProps = {
  initial: SiteBannerGetResponse;
  onSaved?: () => void;
};

export function SiteBannerAdminPanel({
  initial,
  onSaved,
}: SiteBannerAdminPanelProps) {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(initial.banner.enabled);
  const [message, setMessage] = useState(initial.banner.message);
  const [href, setHref] = useState(initial.banner.href ?? "");
  const [localError, setLocalError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const dirty =
    enabled !== initial.banner.enabled ||
    message !== initial.banner.message ||
    (href.trim() || null) !== (initial.banner.href ?? null);

  useEffect(() => {
    setEnabled(initial.banner.enabled);
    setMessage(initial.banner.message);
    setHref(initial.banner.href ?? "");
    setLocalError(null);
  }, [initial.banner, initial.updated_at]);

  useEffect(() => {
    if (dirty) setSaveNotice(null);
  }, [dirty]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: SiteBannerPayload = {
        enabled,
        message: message.trim(),
        href: href.trim() === "" ? null : href.trim(),
      };
      return putAdminSiteBanner(payload);
    },
    onSuccess: (res) => {
      setLocalError(null);
      setSaveNotice(`Đã lưu (${res.updated_by}).`);
      void queryClient.invalidateQueries({ queryKey: adminKeys.siteBanner() });
      void queryClient.invalidateQueries({ queryKey: adminKeys.appConfig() });
      onSaved?.();
    },
    onError: (e: Error) => {
      setLocalError(e.message);
    },
  });

  const save = useCallback(() => {
    setLocalError(null);
    if (enabled && !message.trim()) {
      setLocalError("Bật banner thì cần nhập nội dung.");
      return;
    }
    if (message.length > MAX_MESSAGE) {
      setLocalError(`Nội dung tối đa ${MAX_MESSAGE} ký tự.`);
      return;
    }
    mutation.mutate();
  }, [enabled, message, mutation]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm text-admin-text-secondary">
          Banner dính phía trên app (sticky). Đọc/ghi qua Edge Function{" "}
          <code className="rounded bg-admin-canvas px-1 text-[11px]">
            admin-site-banner
          </code>
          — lưu JSON trong{" "}
          <code className="rounded bg-admin-canvas px-1 text-[11px]">
            app_config.site_banner
          </code>
          .
        </p>
        <p className="text-xs text-admin-text-secondary">
          Cập nhật lần cuối (server):{" "}
          <span className="font-medium text-foreground">
            {formatDt(initial.updated_at)}
          </span>
        </p>
      </div>

      <div className="rounded-2xl border border-admin-border-subtle bg-admin-card/80 p-5 space-y-4">
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            className="size-4 rounded border-admin-border-subtle"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span className="text-sm font-medium text-foreground">
            Bật hiển thị banner
          </span>
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-admin-text-secondary">
            Nội dung (tối đa {MAX_MESSAGE} ký tự)
          </span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            disabled={!enabled}
            className={cn(
              "w-full resize-y rounded-xl border border-admin-border-subtle bg-admin-canvas/50 px-3 py-2 text-sm text-foreground placeholder:text-admin-text-secondary/60",
              !enabled && "opacity-60",
            )}
            placeholder="Ví dụ: Đang bảo trì từ 22h–24h…"
          />
          <span className="text-[11px] text-admin-text-secondary tabular-nums">
            {message.length}/{MAX_MESSAGE}
          </span>
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-admin-text-secondary">
            Liên kết (tùy chọn)
          </span>
          <input
            type="text"
            value={href}
            onChange={(e) => setHref(e.target.value)}
            disabled={!enabled}
            className={cn(
              "w-full rounded-xl border border-admin-border-subtle bg-admin-canvas/50 px-3 py-2 text-sm text-foreground placeholder:text-admin-text-secondary/60",
              !enabled && "opacity-60",
            )}
            placeholder="/huong-dan hoặc https://…"
          />
          <span className="text-[11px] text-admin-text-secondary">
            Đường dẫn tương đối bắt đầu bằng / hoặc URL https (localhost http chỉ
            dev).
          </span>
        </label>

        {enabled ? (
          <div className="rounded-xl border border-dashed border-admin-border-subtle bg-admin-canvas/40 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-admin-text-secondary">
              Xem trước
            </p>
            <div
              className="mt-2 flex items-center justify-center gap-2 bg-amber-100/90 px-3 py-2 text-center text-sm font-medium text-amber-950"
              role="presentation"
            >
              {href.trim() ? (
                <span className="underline decoration-amber-800/40">
                  {message.trim() || "…"}
                </span>
              ) : (
                <span>{message.trim() || "…"}</span>
              )}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => void save()}
            disabled={mutation.isPending || !dirty}
            className="rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-background transition enabled:hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
          >
            {mutation.isPending ? "Đang lưu…" : "Lưu banner"}
          </button>
          {!dirty && !mutation.isPending ? (
            <span className="text-xs text-admin-text-secondary">
              Chưa có thay đổi.
            </span>
          ) : null}
        </div>

        {localError ? (
          <p className="text-xs text-red-700">{localError}</p>
        ) : null}
        {saveNotice ? (
          <p className="text-xs text-emerald-800">{saveNotice}</p>
        ) : null}
      </div>
    </div>
  );
}
