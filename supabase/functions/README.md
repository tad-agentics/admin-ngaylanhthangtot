# Edge Functions — admin repo (partial deploy)

Deploy **only** these functions from this repo:

```bash
supabase functions deploy admin-data admin-config admin-user-actions --project-ref hptovpbiwvtngorhdhhm
```

All other admin + app functions live in **`Ngay-lanh-thang-tot`** and must be deployed from there (CORS allowlist, Direction C stats, P0 CS APIs):

```bash
cd ../Ngay-lanh-thang-tot
supabase functions deploy admin-dashboard-stats admin-site-banner admin-users admin-user-entitlements admin-orders admin-referrals
# …plus app functions as needed
```

Set secrets on the shared project: `ADMIN_EMAILS`, `ALLOWED_ORIGIN` (include admin app URL, e.g. `https://admin.ngaylanhthangtot.vn`).

**Direction C:** Admin không chỉnh cài đặt lượng/credits (`starter_credits`, `referral_bonus_credits`, …). `admin-config` chỉ sửa `app_config.value` theo `config_key` (trừ key credit).
