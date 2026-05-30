/** app_config keys retired with Direction C — không hiển thị / không sửa từ admin. */
const CREDIT_APP_CONFIG_KEYS = new Set([
  "starter_credits",
  "credit_expiry_months",
  "referral_bonus_credits",
  "pivot_transition_until",
]);

export function isCreditRelatedAppConfigKey(raw: string | null | undefined): boolean {
  const k = (raw ?? "").trim().toLowerCase();
  if (!k) return false;
  if (CREDIT_APP_CONFIG_KEYS.has(k)) return true;
  if (k.includes("credit")) return true;
  return false;
}

export function appConfigRowKey(row: Record<string, unknown>): string {
  return String(row.config_key ?? row.key ?? "");
}
