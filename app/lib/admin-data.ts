import { FunctionsHttpError } from "@supabase/supabase-js";

import { supabase } from "~/lib/supabase";

export type AdminTableResource = "profiles" | "payment_orders" | "credit_ledger";

export type AdminProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  credits_balance: number | null;
  subscription_expires_at: string | null;
  created_at: string;
};

export type AdminPaymentRow = {
  id: string;
  user_id: string;
  status: string;
  package_sku: string;
  amount_vnd: number | null;
  created_at: string;
};

export type AdminLedgerRow = {
  id: string;
  user_id: string;
  delta: number;
  balance_after: number | null;
  reason: string | null;
  created_at: string;
};

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
        return `HTTP 404 — Chưa deploy hoặc sai project (${functionName}).`;
      case 503:
        return "HTTP 503 — Chưa set secret ADMIN_EMAILS trên Edge Functions.";
      default:
        return `HTTP ${status} — Edge Function trả lỗi (xem Logs trên Supabase).`;
    }
  }

  if (err instanceof Error) return err.message;
  return String(err);
}

export async function fetchAdminTableRows<T>(
  resource: AdminTableResource,
  limit = 100,
): Promise<T[]> {
  const { data, error } = await supabase.functions.invoke<
    { rows: T[] } | ErrorBody
  >("admin-data", { method: "POST", body: { resource, limit } });

  if (data && typeof data === "object" && "error" in data) {
    const err = data as ErrorBody;
    if (err.error?.message) {
      throw new Error(err.error.message);
    }
  }

  if (error) {
    throw new Error(await describeFunctionsError(error, "admin-data"));
  }

  if (!data || typeof data !== "object" || !("rows" in data)) {
    throw new Error("Phản hồi không hợp lệ");
  }

  return (data as { rows: T[] }).rows;
}
