import { FunctionsFetchError, FunctionsHttpError } from "@supabase/supabase-js";

import { supabase } from "~/lib/supabase";

type ErrorBody = { error?: { code?: string; message?: string } };

export async function describeAdminFunctionError(
  err: unknown,
  functionName: string,
): Promise<string> {
  if (err instanceof FunctionsFetchError) {
    return (
      `Không kết nối được ${functionName}. Kiểm tra đã deploy function và CORS.`
    );
  }

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
        return "HTTP 401 — Phiên hết hạn. Đăng nhập lại.";
      case 403:
        return "HTTP 403 — Email chưa trong ADMIN_EMAILS.";
      case 404:
        return `HTTP 404 — Chưa deploy ${functionName}.`;
      case 503:
        return "HTTP 503 — Chưa set ADMIN_EMAILS.";
      case 429:
        return "HTTP 429 — Quá nhiều request admin — thử lại sau 1 phút.";
      default:
        return `HTTP ${status} — Lỗi Edge Function.`;
    }
  }

  if (err instanceof Error) return err.message;
  return String(err);
}

async function getAccessToken(accessToken?: string): Promise<string> {
  if (accessToken) return accessToken;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error("Chưa đăng nhập");
  return token;
}

export async function adminFunctionGet<T>(
  functionName: string,
  query?: Record<string, string | number | undefined>,
  accessToken?: string,
): Promise<T> {
  const base = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!base || !key) {
    throw new Error("Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_PUBLISHABLE_KEY");
  }

  const params = new URLSearchParams();
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== "") params.set(k, String(v));
    }
  }

  const qs = params.toString();
  const url = `${base}/functions/v1/${functionName}${qs ? `?${qs}` : ""}`;
  const token = await getAccessToken(accessToken);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: key,
    },
  });

  const json = (await res.json()) as T | ErrorBody;
  if (!res.ok) {
    const err = json as ErrorBody;
    throw new Error(
      err.error?.message ?? `HTTP ${res.status} — ${functionName}`,
    );
  }
  if (json && typeof json === "object" && "error" in json) {
    const err = json as ErrorBody;
    if (err.error?.message) throw new Error(err.error.message);
  }

  return json as T;
}

export async function adminFunctionPost<T>(
  functionName: string,
  body: unknown,
  method: "POST" | "PATCH" = "POST",
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T | ErrorBody>(
    functionName,
    { method, body: body as Record<string, unknown> },
  );

  if (data && typeof data === "object" && "error" in data) {
    const err = data as ErrorBody;
    if (err.error?.message) throw new Error(err.error.message);
  }

  if (error) {
    throw new Error(await describeAdminFunctionError(error, functionName));
  }

  if (!data) throw new Error("Phản hồi không hợp lệ");
  return data as T;
}
