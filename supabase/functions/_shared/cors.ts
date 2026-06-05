/**
 * CORS helpers for edge functions.
 *
 * Set ALLOWED_ORIGIN in Supabase secrets (comma-separated), e.g.
 * `https://ngaylanhthangtot.vn` — www apex is paired automatically.
 * When unset, static corsHeaders use "" (reject); set ALLOWED_ORIGIN in prod.
 * PayOS redirects need a concrete
 * allowlist (see allowed-origin.ts).
 *
 * Public endpoints (share-og, share-resolve) use publicCorsHeaders ("*").
 */

import {
  pickCorsAllowOrigin,
  readAllowedAppOrigins,
} from "./allowed-origin.ts";

const ALLOWLIST = readAllowedAppOrigins();

const CORS_ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type";

/** Dynamic CORS for browser clients — echoes matching request Origin. */
export function corsHeadersForRequest(req: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": pickCorsAllowOrigin(
      req.headers.get("Origin"),
      ALLOWLIST,
    ),
    "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
  };
}

/**
 * Static headers for server-to-server handlers (webhooks). Prefer
 * corsHeadersForRequest(req) for any endpoint called from the browser.
 */
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOWLIST[0] ?? "",
  "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
};

/** For fully public endpoints (OG preview, share-resolve). */
export const publicCorsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
};
