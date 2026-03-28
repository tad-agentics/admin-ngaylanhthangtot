/**
 * URL công khai của **admin** (subdomain riêng), không dùng domain app user.
 *
 * - App user: https://ngaylanhthangtot.vn — có thể giữ làm **Site URL** trên Supabase.
 * - Admin: https://admin.ngaylanhthangtot.vn — đặt vào `VITE_APP_URL` khi build/deploy;
 *   magic link cần `emailRedirectTo` trỏ về domain admin để `/auth/callback` chạy đúng app.
 *
 * Trên Supabase → Authentication → URL Configuration:
 * - Site URL: có thể vẫn là https://ngaylanhthangtot.vn
 * - **Redirect URLs**: thêm `https://admin.ngaylanhthangtot.vn/auth/callback` (và URL localhost khi dev).
 */
export function getAdminBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_APP_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export function getAuthCallbackUrl(): string {
  const base = getAdminBaseUrl();
  if (!base) return "/auth/callback";
  return `${base}/auth/callback`;
}
