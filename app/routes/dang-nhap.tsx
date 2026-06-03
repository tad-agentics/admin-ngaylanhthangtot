import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";

import { NgayLanhLogoLockupCompact } from "~/components/brand/NgayLanhLogoLockupCompact";
import { getAuthCallbackUrl } from "~/lib/auth-redirect";
import { useAuth } from "~/lib/auth";
import { supabase } from "~/lib/supabase";
import { cn } from "~/lib/utils";

type LoginMode = "password" | "magic-link";

function mapAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) {
    return "Email hoặc mật khẩu không đúng.";
  }
  if (m.includes("email not confirmed")) {
    return "Email chưa xác nhận. Kiểm tra hộp thư hoặc dùng magic link.";
  }
  return message;
}

export default function DangNhapRoute() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<LoginMode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (user) navigate("/", { replace: true });
  }, [authLoading, user, navigate]);

  async function onPasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error) {
      setMessage(mapAuthError(error.message));
      return;
    }
    navigate("/", { replace: true });
  }

  async function onMagicLinkSubmit(e: FormEvent) {
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
      setMessage(mapAuthError(error.message));
      return;
    }
    setSent(true);
  }

  if (authLoading || user) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-admin-canvas text-sm text-admin-text-secondary">
        Đang tải…
      </main>
    );
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

        <div
          className="flex rounded-lg border border-admin-border-subtle bg-admin-card p-1"
          role="tablist"
          aria-label="Cách đăng nhập"
        >
          {(
            [
              ["password", "Email & mật khẩu"],
              ["magic-link", "Magic link"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              onClick={() => {
                setMode(id);
                setMessage(null);
                setSent(false);
              }}
              className={cn(
                "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                mode === id
                  ? "bg-neutral-950 text-white"
                  : "text-admin-text-secondary hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "magic-link" && sent ? (
          <div className="rounded-xl border border-admin-border-subtle bg-admin-card p-4 text-sm">
            <p className="font-medium text-foreground">Đã gửi liên kết</p>
            <p className="mt-2 text-admin-text-secondary">
              Mở hộp thư <strong className="text-foreground">{email}</strong> và bấm
              vào link đăng nhập. Nếu không thấy, kiểm tra mục spam. Nếu link báo lỗi,
              hãy gửi lại magic link mới.
            </p>
            <button
              type="button"
              className="mt-4 text-sm font-medium text-foreground underline-offset-2 hover:underline"
              onClick={() => {
                setSent(false);
                setMessage(null);
              }}
            >
              Gửi lại
            </button>
          </div>
        ) : mode === "password" ? (
          <form onSubmit={(e) => void onPasswordSubmit(e)} className="space-y-4">
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
            <div>
              <label
                htmlFor="admin-password"
                className="block text-sm font-medium text-foreground"
              >
                Mật khẩu
              </label>
              <input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
              {busy ? "Đang đăng nhập…" : "Đăng nhập"}
            </button>
          </form>
        ) : (
          <form onSubmit={(e) => void onMagicLinkSubmit(e)} className="space-y-4">
            <div>
              <label
                htmlFor="admin-email-magic"
                className="block text-sm font-medium text-foreground"
              >
                Email
              </label>
              <input
                id="admin-email-magic"
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
