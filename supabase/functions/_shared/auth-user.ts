import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type AuthenticatedUser = { uid: string; admin: SupabaseClient };

export async function requireAuthenticatedUser(
  req: Request,
): Promise<AuthenticatedUser | null> {
  const gateUrl = Deno.env.get("SUPABASE_URL");
  const gateAnon = Deno.env.get("SUPABASE_ANON_KEY");
  const gateService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization");
  if (!gateUrl || !gateAnon || !gateService || !authHeader?.startsWith("Bearer ")) {
    return null;
  }
  const userClient = createClient(gateUrl, gateAnon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  const uid = userData?.user?.id;
  if (userErr || !uid) return null;
  return { uid, admin: createClient(gateUrl, gateService) };
}
