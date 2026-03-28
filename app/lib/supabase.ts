import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in .env.local",
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    /**
     * Implicit: magic link gắn token trong hash → mở link trên điện thoại / trình duyệt
     * khác so với lúc gửi OTP vẫn đăng nhập được.
     * PKCE yêu cầu cùng trình duyệt (code verifier trong localStorage) — dễ “đứng” ở /dang-nhap.
     */
    flowType: "implicit",
    detectSessionInUrl: true,
  },
});
