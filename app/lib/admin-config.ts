import { FunctionsHttpError } from "@supabase/supabase-js";

import {
  appConfigRowKey,
  isCreditRelatedAppConfigKey,
} from "~/lib/credit-config-keys";
import { supabase } from "~/lib/supabase";

export type AdminConfigTable = "app_config";

/** Đọc app_config — dùng cho tab Cấu hình app (bỏ key lượng/credits). */
export async function fetchAppConfigRows(): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase.from("app_config").select("*");
  if (error) throw error;
  const list = ([...(data ?? [])] as Record<string, unknown>[]).filter(
    (row) => !isCreditRelatedAppConfigKey(appConfigRowKey(row)),
  );
  list.sort((a, b) => appConfigRowKey(a).localeCompare(appConfigRowKey(b)));
  return list;
}

type ErrorBody = { error?: { code?: string; message?: string } };

async function describeFunctionsError(
  err: unknown,
  functionName: string,
): Promise<string> {
  if (err instanceof FunctionsHttpError) {
    const res = err.context as Response;
    const status = res.status;
    let server = "";
    try {
      const j = (await res.clone().json()) as ErrorBody;
      const code = j?.error?.code;
      const msg = j?.error?.message;
      if (code && msg) server = `${code}: ${msg}`;
      else if (msg) server = msg;
    } catch {
      try {
        const t = (await res.clone().text()).trim();
        if (t) server = t.slice(0, 280);
      } catch {
        /* ignore */
      }
    }

    if (server) return `HTTP ${status} — ${server}`;

    switch (status) {
      case 401:
        return "HTTP 401 — Phiên đăng nhập hết hạn hoặc thiếu JWT. Thử đăng xuất và đăng nhập lại.";
      case 403:
        return "HTTP 403 — Email chưa nằm trong secret ADMIN_EMAILS (Supabase Edge).";
      case 404:
        return `HTTP 404 — Không thấy function hoặc bản ghi (${functionName}).`;
      case 503:
        return "HTTP 503 — Chưa set secret ADMIN_EMAILS trên Edge Functions.";
      default:
        return `HTTP ${status} — Edge Function trả lỗi (xem Logs trên Supabase).`;
    }
  }

  if (err instanceof Error) return err.message;
  return String(err);
}

export async function patchAdminConfigRow(
  table: AdminConfigTable,
  id: string,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke<
    { row: Record<string, unknown> } | ErrorBody
  >("admin-config", {
    method: "POST",
    body: { table, id, patch },
  });

  if (data && typeof data === "object" && "error" in data) {
    const err = data as ErrorBody;
    if (err.error?.message) {
      throw new Error(err.error.message);
    }
  }

  if (error) {
    throw new Error(await describeFunctionsError(error, "admin-config"));
  }

  if (!data || typeof data !== "object" || !("row" in data)) {
    throw new Error("Phản hồi không hợp lệ");
  }

  return (data as { row: Record<string, unknown> }).row;
}
