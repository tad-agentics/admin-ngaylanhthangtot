import { supabase } from "~/lib/supabase";

/** Đọc public/RLS — dùng cho TanStack Query cache. */
export async function fetchFeatureCreditCostsRows(): Promise<
  Record<string, unknown>[]
> {
  const { data, error } = await supabase
    .from("feature_credit_costs")
    .select("*");
  if (error) throw error;
  const list = [...(data ?? [])] as Record<string, unknown>[];
  list.sort((a, b) => {
    const ak = String(a.feature_key ?? a.id ?? "");
    const bk = String(b.feature_key ?? b.id ?? "");
    return ak.localeCompare(bk);
  });
  return list;
}

export async function fetchAppConfigRows(): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase.from("app_config").select("*");
  if (error) throw error;
  const list = [...(data ?? [])] as Record<string, unknown>[];
  list.sort((a, b) => {
    const ak = String(a.key ?? a.id ?? "");
    const bk = String(b.key ?? b.id ?? "");
    return ak.localeCompare(bk);
  });
  return list;
}
