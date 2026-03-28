-- Atomic admin credit grant: UPDATE profiles + INSERT credit_ledger trong một transaction.
-- Chạy trên Supabase: supabase db push / hoặc chạy SQL này trong SQL Editor.
-- Chỉ role service_role được EXECUTE (Edge Function dùng service key).

CREATE OR REPLACE FUNCTION public.admin_grant_credits(
  p_user_id uuid,
  p_delta integer,
  p_reason text DEFAULT 'admin_credit_grant'
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new bigint;
  v_reason text;
BEGIN
  IF p_delta IS NULL OR p_delta <= 0 OR p_delta > 1000000 THEN
    RAISE EXCEPTION 'invalid_delta';
  END IF;

  v_reason := COALESCE(NULLIF(trim(p_reason), ''), 'admin_credit_grant');
  IF char_length(v_reason) > 200 THEN
    v_reason := left(v_reason, 200);
  END IF;

  UPDATE profiles
  SET credits_balance = COALESCE(credits_balance, 0) + p_delta
  WHERE id = p_user_id
  RETURNING (credits_balance)::bigint INTO v_new;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  -- Nếu bảng bắt buộc cột khác (vd. feature_key NOT NULL), bổ sung vào INSERT và deploy lại.
  INSERT INTO credit_ledger (user_id, delta, balance_after, reason)
  VALUES (p_user_id, p_delta, v_new, v_reason);

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_grant_credits(uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_grant_credits(uuid, integer, text) FROM anon;
REVOKE ALL ON FUNCTION public.admin_grant_credits(uuid, integer, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_credits(uuid, integer, text) TO service_role;

COMMENT ON FUNCTION public.admin_grant_credits IS
  'Admin-only (service_role): atomically increment profiles.credits_balance and append credit_ledger.';
