import { type FormEvent, useMemo, useState } from "react";
import { Link } from "react-router";

import { NgayLanhLogoLockupCompact } from "~/components/brand/NgayLanhLogoLockupCompact";
import { getAuthCallbackUrl } from "~/lib/auth-redirect";
import { supabase } from "~/lib/supabase";

export default function DangNhapRoute() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const callbackHint = useMemo(() => getAuthCallbackUrl(), []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: getAuthCallbackUrl(),
      },
    });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setSent(true);
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center bg-admin-canvas px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <Link
          to="/"
          className="block rounded-2xl border border-admin-border-subtle bg-admin-card p-4 no-underline"
        >
          <NgayLanhLogoLockupCompact markSize={40} />
        </Link>

        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Đăng nhập admin
          </h1>
          <p className="mt-1 text-sm text-admin-text-secondary">
            Nhập email — bạn sẽ nhận <strong className="font-medium text-foreground">magic link</strong>{" "}
            từ Supabase. Tài khoản phải có email trong secret{" "}
            <code className="rounded bg-admin-canvas px-1 text-xs">ADMIN_EMAILS</code>.
          </p>
        </div>

        {sent ? (
          <div className="rounded-xl border border-admin-border-subtle bg-admin-card p-4 text-sm">
            <p className="font-medium text-foreground">Đã gửi liên kết</p>
            <p className="mt-2 text-admin-text-secondary">
              Mở hộp thư <strong className="text-foreground">{email}</strong> và bấm
              vào link đăng nhập. Nếu không thấy, kiểm tra mục spam.
            </p>
            <button
              type="button"
              className="mt-4 text-sm font-medium text-foreground underline-offset-2 hover:underline"
              onClick={() => {
                setSent(false);
                setMessage(null);
              }}
            >
              Gửi lại cho email khác
            </button>
          </div>
        ) : (
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
            <div>
              <label
                htmlFor="admin-email"
                className="block text-sm font-medium text-foreground"
              >
                Email
              </label>
              <input
                id="admin-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-admin-border-subtle bg-admin-card px-3 text-sm outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10"
              />
            </div>
            {message ? (
              <p className="text-sm text-red-600">{message}</p>
            ) : null}
            <button
              type="submit"
              disabled={busy}
              className="h-10 w-full rounded-lg bg-neutral-950 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy ? "Đang gửi…" : "Gửi magic link"}
            </button>
          </form>
        )}

        <p className="text-[11px] leading-relaxed text-admin-text-secondary">
          Supabase → Authentication: bật email.{" "}
          <strong className="font-medium text-foreground">Redirect URLs</strong> phải có{" "}
          <code className="rounded bg-admin-canvas px-1">{callbackHint}</code> (admin —
          vd. <code className="rounded bg-admin-canvas px-1">admin.ngaylanhthangtot.vn</code>
          ). Site URL có thể vẫn là app user (
          <code className="rounded bg-admin-canvas px-1">ngaylanhthangtot.vn</code>
          ).
          {import.meta.env.VITE_APP_URL ? null : (
            <>
              {" "}
              Đang dev: đang dùng origin trình duyệt — set{" "}
              <code className="rounded bg-admin-canvas px-1">VITE_APP_URL</code> khi build
              production.
            </>
          )}
        </p>
      </div>
    </main>
  );
}
