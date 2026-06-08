import { DEFAULT_ONBOARDING_TRIAL_QUESTIONS_MAX } from "./entitlements.ts";

type AdminClient = ReturnType<
  typeof import("https://esm.sh/@supabase/supabase-js@2.49.1").createClient
>;

export async function readOnboardingTrialQuestionsMax(
  admin: AdminClient,
): Promise<number> {
  const { data, error } = await admin
    .from("app_config")
    .select("value")
    .eq("config_key", "onboarding_trial_questions_max")
    .maybeSingle();
  if (error) throw error;
  const raw = data?.value;
  const n = typeof raw === "string"
    ? Number.parseInt(raw, 10)
    : typeof raw === "number"
    ? raw
    : NaN;
  return Number.isFinite(n) && n >= 1
    ? Math.floor(n)
    : DEFAULT_ONBOARDING_TRIAL_QUESTIONS_MAX;
}
