import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { supabase } from "~/lib/supabase";

/**
 * Magic link (PKCE): Supabase chuyển về với ?code=… — đổi lấy session rồi vào dashboard.
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

      const code = params.get("code");
      if (code) {
        const { error: exchangeErr } =
          await supabase.auth.exchangeCodeForSession(
            window.location.href.split("#")[0],
          );
        if (!active) return;
        if (exchangeErr) {
          setMessage(exchangeErr.message);
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
