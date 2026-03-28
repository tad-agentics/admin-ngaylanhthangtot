import { FunctionsFetchError, FunctionsHttpError } from "@supabase/supabase-js";

import { supabase } from "~/lib/supabase";

type ErrorBody = { error?: { code?: string; message?: string } };

export type SiteBannerPayload = {
  enabled: boolean;
  message: string;
  href: string | null;
};

export type SiteBannerGetResponse = {
  banner: SiteBannerPayload;
  updated_at: string | null;
};

export type SiteBannerPutResponse = {
  ok: true;
  banner: SiteBannerPayload;
  updated_by: string;
};

async function describeFunctionsError(
  err: unknown,
  functionName: string,
): Promise<string> {
  if (err instanceof FunctionsFetchError) {
    const ctx = err.context;
    const inner =
      ctx instanceof Error
        ? ctx.message
        : ctx && typeof ctx === "object" && "message" in ctx
          ? String((ctx as { message: unknown }).message)
          : "";
    const hint =
      "Không kết nối được tới Edge Function. Kiểm tra: đã deploy " +
      functionName +
      "; extension/chặn tracker không chặn *.supabase.co; CORS trên function có Access-Control-Allow-Methods (GET, POST, PUT).";
    return inner ? `${hint} Chi tiết: ${inner}` : hint;
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
        return "HTTP 401 — Phiên đăng nhập hết hạn hoặc thiếu JWT.";
      case 403:
        return "HTTP 403 — Email chưa nằm trong ADMIN_EMAILS.";
      case 404:
        return `HTTP 404 — Không thấy function ${functionName}.`;
      case 503:
        return "HTTP 503 — Chưa set ADMIN_EMAILS.";
      default:
        return `HTTP ${status} — Xem Logs Edge Function trên Supabase.`;
    }
  }

  if (err instanceof Error) return err.message;
  return String(err);
}

export async function fetchAdminSiteBanner(): Promise<SiteBannerGetResponse> {
  const { data, error } = await supabase.functions.invoke<
    SiteBannerGetResponse | ErrorBody
  >("admin-site-banner", { method: "GET" });

  if (data && typeof data === "object" && "error" in data) {
    const err = data as ErrorBody;
    if (err.error?.message) throw new Error(err.error.message);
  }

  if (error) {
    throw new Error(await describeFunctionsError(error, "admin-site-banner"));
  }

  if (
    !data ||
    typeof data !== "object" ||
    !("banner" in data) ||
    typeof (data as SiteBannerGetResponse).banner !== "object"
  ) {
    throw new Error("Phản hồi không hợp lệ");
  }

  return data as SiteBannerGetResponse;
}

export async function putAdminSiteBanner(
  payload: SiteBannerPayload,
): Promise<SiteBannerPutResponse> {
  const { data, error } = await supabase.functions.invoke<
    SiteBannerPutResponse | ErrorBody
  >("admin-site-banner", {
    method: "POST",
    body: payload,
  });

  if (data && typeof data === "object" && "error" in data) {
    const err = data as ErrorBody;
    if (err.error?.message) throw new Error(err.error.message);
  }

  if (error) {
    throw new Error(await describeFunctionsError(error, "admin-site-banner"));
  }

  if (
    !data ||
    typeof data !== "object" ||
    !("ok" in data) ||
    !(data as SiteBannerPutResponse).ok
  ) {
    throw new Error("Phản hồi không hợp lệ");
  }

  return data as SiteBannerPutResponse;
}
