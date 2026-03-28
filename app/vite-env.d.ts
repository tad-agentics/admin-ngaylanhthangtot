/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string | undefined;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string | undefined;
  /** Base URL admin (prod: https://admin.ngaylanhthangtot.vn) — magic link redirect. */
  readonly VITE_APP_URL: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
