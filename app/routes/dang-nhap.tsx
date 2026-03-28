import { type FormEvent, useState } from "react";
import { Link } from "react-router";

import { NgayLanhLogoLockupCompact } from "~/components/brand/NgayLanhLogoLockupCompact";
import { getAuthCallbackUrl } from "~/lib/auth-redirect";
import { supabase } from "~/lib/supabase";

export default function DangNhapRoute() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

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

        <h1 className="text-xl font-semibold text-foreground">Đăng nhập admin</h1>

        {sent ? (
          <div className="rounded-xl border border-admin-border-subtle bg-admin-card p-4 text-sm">
            <p className="font-medium text-foreground">Đã gửi liên kết</p>
            <p className="mt-2 text-admin-text-secondary">
              Mở hộp thư <strong className="text-foreground">{email}</strong> và bấm
              vào link đăng nhập. Nếu không thấy, kiểm tra mục spam. Nếu link báo lỗi,
              hãy gửi lại magic link mới (link cũ có thể đã hết hạn hoặc dùng nhầm bản
              gửi trước khi đổi cấu hình).
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
      </div>
    </main>
  );
}
