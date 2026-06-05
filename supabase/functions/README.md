# Edge Functions — admin repo (partial deploy)

Deploy **from this repo**:

```bash
supabase functions deploy admin-config admin-user-actions admin-users admin-dashboard-stats --project-ref hptovpbiwvtngorhdhhm
```

**Engagement tracking** (app functions — patch + deploy from downloaded sources):

```bash
./scripts/deploy-engagement-functions.sh
```

Patches live in `supabase/functions/_shared/{user-engagement,auth-user,tieu-van-reading-gate}.ts` and `scripts/patch-engagement-functions.py`. DB migration: `supabase/migrations/20260605120000_profile_engagement_click_counts.sql`.

Other admin + app functions still live in **`Ngay-lanh-thang-tot`** — after changing shared app code there, re-run `./scripts/deploy-engagement-functions.sh` here so tracking patches are re-applied.

```bash
cd ../Ngay-lanh-thang-tot
supabase functions deploy admin-site-banner admin-user-entitlements admin-orders admin-referrals admin-coupons
```

`admin-dashboard-stats` deploy từ **admin repo** (cache 60s: Upstash Redis nếu có `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`, fallback in-memory). Không deploy lại từ app repo — sẽ ghi đè.

Set secrets on the shared project: `ADMIN_EMAILS`, `ALLOWED_ORIGIN` (include admin app URL, e.g. `https://admin.ngaylanhthangtot.vn`).

**Direction C:** Admin không chỉnh cài đặt lượng/credits (`starter_credits`, `referral_bonus_credits`, …). `admin-config` chỉ sửa `app_config.value` theo `config_key` (trừ key credit).
