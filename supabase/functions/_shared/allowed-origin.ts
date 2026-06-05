/**
 * App origin allowlist — Supabase secret ALLOWED_ORIGIN (comma-separated origins).
 * Apex host automatically pairs with www (and vice versa) for CORS + PayOS redirects.
 */

/** Normalize one entry to a URL origin (scheme + host + port). */
export function normalizeAppOrigin(raw: string | null | undefined): string | null {
  const t = raw?.trim() ?? "";
  if (!t || t === "*") return null;
  try {
    return new URL(t).origin;
  } catch {
    return null;
  }
}

/** Add apex ↔ www counterpart when hostname is a bare registrable domain. */
export function expandOriginAllowlist(origins: string[]): string[] {
  const out = new Set<string>();
  for (const origin of origins) {
    out.add(origin);
    try {
      const u = new URL(origin);
      const host = u.hostname.toLowerCase();
      if (host.startsWith("www.")) {
        const apexHost = host.slice(4);
        if (!apexHost) continue;
        out.add(`${u.protocol}//${apexHost}${u.port ? `:${u.port}` : ""}`);
      } else if (
        host !== "localhost" &&
        host !== "127.0.0.1" &&
        !host.startsWith("www.")
      ) {
        out.add(`${u.protocol}//www.${host}${u.port ? `:${u.port}` : ""}`);
      }
    } catch {
      /* skip malformed */
    }
  }
  return [...out];
}

/** Parse ALLOWED_ORIGIN — comma-separated list of app URLs/origins. */
export function parseAllowedOriginsFromEnv(
  raw: string | null | undefined,
): string[] {
  const t = raw?.trim() ?? "";
  if (!t || t === "*") return [];
  const parts = t.split(",").map((s) => normalizeAppOrigin(s.trim())).filter(
    (o): o is string => o != null,
  );
  return expandOriginAllowlist(parts);
}

export function readAllowedAppOrigins(): string[] {
  return parseAllowedOriginsFromEnv(Deno.env.get("ALLOWED_ORIGIN"));
}

/** CORS: echo request Origin when it is on the allowlist; else first entry or "*". */
export function pickCorsAllowOrigin(
  requestOrigin: string | null,
  allowlist: string[],
): string {
  if (allowlist.length === 0) return "*";
  if (requestOrigin && allowlist.includes(requestOrigin)) {
    return requestOrigin;
  }
  return allowlist[0]!;
}

/** PayOS return_url / cancel_url must match an allowed app origin. */
export function isRedirectUrlAllowed(
  redirectUrl: string,
  allowlist: string[],
): boolean {
  if (allowlist.length === 0) return false;
  let u: URL;
  try {
    u = new URL(redirectUrl);
  } catch {
    return false;
  }
  if (u.username || u.password) return false;
  return allowlist.includes(u.origin);
}

export function isValidRedirectUrl(raw: string): boolean {
  return isRedirectUrlAllowed(raw, readAllowedAppOrigins());
}
