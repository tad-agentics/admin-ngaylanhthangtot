import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { canUseTieuVanReading } from "./entitlements.ts";

export async function userHasTieuVanReadingAccess(
  admin: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data: profile } = await admin
    .from("profiles")
    .select("subscription_expires_at, tieu_van_reading_expires_at")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return false;
  return canUseTieuVanReading(profile);
}
