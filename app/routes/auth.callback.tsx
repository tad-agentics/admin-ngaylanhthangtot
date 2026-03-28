import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { supabase } from "~/lib/supabase";

function isPkceVerifierMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("code verifier") ||
    m.includes("pkce") ||
    m.includes("pkce_code_verifier_not_found")
  );
}

/**
 * Magic link: sau redirect, GoTrue-js đã parse URL trong initialize (detectSessionInUrl).
 * Thêm fallback đổi ?code= (PKCE) bằng đúng chuỗi code — không truyền cả URL vào exchangeCodeForSession.
 */
export default function AuthCallbackRoute() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Đang đăng nhập…");

  useEffect(() => {
    let active = true;

    async function run() {
      const params = new URLSearchParams(window.location.search);
      const oauthError = params.get("error");
      const oauthDesc = params.get("error_description");
      if (oauthError) {
        if (!active) return;
        setMessage(
          oauthDesc?.replace(/\+/g, " ") ??
            oauthError ??
            "Đăng nhập không thành công.",
        );
        navigate("/dang-nhap", { replace: true });
        return;
      }

      const { data: first, error: firstError } = await supabase.auth.getSession();
      if (!active) return;

      if (firstError) {
        setMessage(firstError.message);
        navigate("/dang-nhap", { replace: true });
        return;
      }

      if (first.session) {
        window.history.replaceState({}, document.title, "/auth/callback");
        navigate("/", { replace: true });
        return;
      }

      const code = params.get("code");
      if (code) {
        const { error: exchangeErr } =
          await supabase.auth.exchangeCodeForSession(code);
        if (!active) return;
        if (exchangeErr) {
          const detail = exchangeErr.message;
          setMessage(
            isPkceVerifierMessage(detail)
              ? "Link đăng nhập cần cùng trình duyệt đã gửi OTP, hoặc hãy yêu cầu gửi link mới."
              : detail,
          );
          navigate("/dang-nhap", { replace: true });
          return;
        }
        window.history.replaceState({}, document.title, "/auth/callback");
      }

      const { data, error } = await supabase.auth.getSession();
      if (!active) return;
      if (error) {
        setMessage(error.message);
        navigate("/dang-nhap", { replace: true });
        return;
      }
      if (data.session) {
        navigate("/", { replace: true });
        return;
      }

      setMessage("Không lấy được phiên đăng nhập.");
      navigate("/dang-nhap", { replace: true });
    }

    void run();

    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-admin-canvas px-4">
      <p className="text-sm text-admin-text-secondary">{message}</p>
    </main>
  );
}
