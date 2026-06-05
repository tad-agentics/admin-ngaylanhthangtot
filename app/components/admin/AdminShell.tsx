import { useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router";

import { AdminSidebar } from "~/components/admin/AdminSidebar";
import { AdminTopBar } from "~/components/admin/AdminTopBar";
import { useAuth } from "~/lib/auth";

type AdminShellProps = {
  children: ReactNode;
  activeNav: string;
  userName: string;
  onRefresh?: () => void;
  refreshing?: boolean;
};

export function AdminShell({
  children,
  activeNav,
  userName,
  onRefresh,
  refreshing,
}: AdminShellProps) {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/dang-nhap", { replace: true });
    }
  }, [authLoading, user, navigate]);

  if (!authLoading && !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-admin-canvas text-sm text-admin-text-secondary">
        Đang chuyển hướng…
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh bg-admin-canvas text-foreground">
      <AdminSidebar
        activeId={activeNav}
        onSignOut={authLoading ? async () => {} : signOut}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-6xl space-y-6">
            <AdminTopBar
              userName={authLoading ? "…" : userName}
              onRefresh={authLoading ? undefined : onRefresh}
              refreshing={authLoading || refreshing}
            />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export function EnvBanner() {
  const ok = Boolean(
    import.meta.env.VITE_SUPABASE_URL &&
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  );
  if (ok) return null;
  return (
    <div className="rounded-xl border border-amber-200/80 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p className="font-medium">Chưa cấu hình Supabase</p>
      <p className="mt-1 text-amber-900/80">
        Tạo <code className="rounded bg-amber-100/80 px-1">.env.local</code> từ{" "}
        <code className="rounded bg-amber-100/80 px-1">.env.example</code>.
      </p>
    </div>
  );
}

export function AdminForbiddenHint({
  error,
  email,
}: {
  error: string | null;
  email: string | null;
}) {
  if (!error) return null;
  const forbidden =
    error.includes("FORBIDDEN") ||
    error.toLowerCase().includes("not an admin") ||
    error.includes("403");

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
      <p className="font-medium">Lỗi dữ liệu</p>
      <p className="mt-1">{error}</p>
      {forbidden ? (
        <p className="mt-2 text-xs text-red-800/90 leading-relaxed">
          Thêm email{" "}
          <code className="rounded bg-red-100/80 px-1">{email ?? "—"}</code> vào
          secret{" "}
          <code className="rounded bg-red-100/80 px-1">ADMIN_EMAILS</code> trên
          Supabase Edge Functions.
        </p>
      ) : null}
    </div>
  );
}
