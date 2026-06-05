import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type EngagementMetric =
  | "bazi_luan"
  | "tieu_van_luan"
  | "day_luan_follow_up";

/** Fire-and-forget engagement counter — service_role RPC only. */
export function trackProfileEngagement(
  admin: SupabaseClient,
  userId: string,
  metric: EngagementMetric,
): void {
  void admin.rpc("increment_profile_engagement", {
    p_user_id: userId,
    p_metric: metric,
  }).then(({ error }) => {
    if (error) {
      console.warn("trackProfileEngagement", metric, userId, error.message);
    }
  });
}
