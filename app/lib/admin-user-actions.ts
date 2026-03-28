import { FunctionsHttpError } from "@supabase/supabase-js";

import { supabase } from "~/lib/supabase";

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
        return "HTTP 401 — Phiên đăng nhập hết hạn hoặc thiếu JWT.";
      case 403:
        return "HTTP 403 — Email chưa nằm trong ADMIN_EMAILS.";
      case 404:
        return `HTTP 404 — Không thấy function hoặc user (${functionName}).`;
      case 503:
        return "HTTP 503 — Chưa set ADMIN_EMAILS.";
      default:
        return `HTTP ${status} — Xem Logs Edge Function trên Supabase.`;
    }
  }

  if (err instanceof Error) return err.message;
  return String(err);
}

export type AdminAddCreditsResult = {
  ok: true;
  action: "add_credits";
  userId: string;
  delta: number;
  credits_balance: number;
};

export type AdminDeleteUserResult = {
  ok: true;
  action: "delete_user";
  userId: string;
};

export async function adminAddCredits(
  userId: string,
  delta: number,
  reason?: string,
): Promise<AdminAddCreditsResult> {
  const { data, error } = await supabase.functions.invoke<
    AdminAddCreditsResult | ErrorBody
  >("admin-user-actions", {
    method: "POST",
    body: { action: "add_credits", userId, delta, reason },
  });

  if (data && typeof data === "object" && "error" in data) {
    const err = data as ErrorBody;
    if (err.error?.message) throw new Error(err.error.message);
  }

  if (error) {
    throw new Error(await describeFunctionsError(error, "admin-user-actions"));
  }

  if (
    !data ||
    typeof data !== "object" ||
    !("ok" in data) ||
    (data as AdminAddCreditsResult).action !== "add_credits"
  ) {
    throw new Error("Phản hồi không hợp lệ");
  }

  return data as AdminAddCreditsResult;
}

export async function adminDeleteUser(userId: string): Promise<AdminDeleteUserResult> {
  const { data, error } = await supabase.functions.invoke<
    AdminDeleteUserResult | ErrorBody
  >("admin-user-actions", {
    method: "POST",
    body: { action: "delete_user", userId },
  });

  if (data && typeof data === "object" && "error" in data) {
    const err = data as ErrorBody;
    if (err.error?.message) throw new Error(err.error.message);
  }

  if (error) {
    throw new Error(await describeFunctionsError(error, "admin-user-actions"));
  }

  if (
    !data ||
    typeof data !== "object" ||
    !("ok" in data) ||
    (data as AdminDeleteUserResult).action !== "delete_user"
  ) {
    throw new Error("Phản hồi không hợp lệ");
  }

  return data as AdminDeleteUserResult;
}
