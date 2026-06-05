import {
  adminFunctionGet,
  adminFunctionPost,
} from "~/lib/admin-functions";

export type AdminUserFlags = {
  subscriptionActive: boolean;
  canUseBaziReading: boolean;
  canUseTieuVanReading: boolean;
  isNeverSubscribed: boolean;
};

export type AdminUserListItem = {
  id: string;
  email: string | null;
  display_name: string | null;
  subscription_expires_at: string | null;
  bazi_reading_unlocked_at: string | null;
  tieu_van_reading_expires_at: string | null;
  referral_code: string | null;
  referred_by: string | null;
  referral_reward_total_vnd: number | null;
  created_at: string;
  flags: AdminUserFlags;
  /** Tổng lifetime: mở luận la-so-chi-tiet (có quyền, không preview). */
  bazi_luan_click_count: number;
  /** Tổng lifetime: mở luận tiểu vận tháng (có quyền). */
  tieu_van_luan_click_count: number;
  /** Tổng lifetime: gửi hỏi thêm luận ngày (sau rate limit). */
  day_luan_follow_up_click_count: number;
  /** Completed follow-up asks in luận giải ngày (day-luan-chat). */
  day_luan_ai_ask_count: number;
};

export type AdminUserSearchResponse = {
  users: AdminUserListItem[];
};

export type AdminPaymentOrderSummary = {
  id: string;
  status: string;
  package_sku: string;
  list_amount_vnd: number | null;
  amount_vnd: number | null;
  coupon_code: string | null;
  checkout_referral_code: string | null;
  provider_order_code: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminUserDetailResponse = {
  profile: AdminUserListItem & {
    la_so_recompute_status: string | null;
    birth_edit_count: number | null;
    birth_edit_window_start: string | null;
    onboarding_completed_at: string | null;
    ngay_sinh: string | null;
    gio_sinh: string | null;
    gioi_tinh: string | null;
    updated_at: string;
    la_so?: unknown;
  };
  flags: AdminUserFlags;
  bazi_luan_click_count: number;
  tieu_van_luan_click_count: number;
  day_luan_follow_up_click_count: number;
  day_luan_ai_ask_count: number;
  referrer: { id: string; email: string | null; referral_code: string | null } | null;
  paymentOrders: AdminPaymentOrderSummary[];
  referralRewards: {
    id: string;
    referee_profile_id: string;
    payment_order_id: string;
    package_sku: string;
    reward_vnd: number;
    checkout_referral_code: string | null;
    created_at: string;
  }[];
};

export async function searchAdminUsers(
  q: string,
  limit = 20,
): Promise<AdminUserSearchResponse> {
  const trimmed = q.trim();
  return adminFunctionGet<AdminUserSearchResponse>("admin-users", {
    q: trimmed,
    limit,
  });
}

export async function fetchAdminUserDetail(
  userId: string,
  options?: { includeLaSo?: boolean },
): Promise<AdminUserDetailResponse> {
  return adminFunctionGet<AdminUserDetailResponse>("admin-users", {
    id: userId,
    ...(options?.includeLaSo ? { includeLaSo: "1" } : {}),
  });
}

export type PatchEntitlementsBody = {
  userId: string;
  subscriptionExpiresAt?: string | null;
  baziReadingUnlock?: boolean;
  tieuVanExpiresAt?: string | null;
  adminNote: string;
};

export type PatchEntitlementsResponse = {
  ok: true;
  profile: {
    id: string;
    email: string | null;
    subscription_expires_at: string | null;
    bazi_reading_unlocked_at: string | null;
    tieu_van_reading_expires_at: string | null;
  };
  auditedBy: string;
};

export async function patchAdminUserEntitlements(
  body: PatchEntitlementsBody,
): Promise<PatchEntitlementsResponse> {
  return adminFunctionPost<PatchEntitlementsResponse>(
    "admin-user-entitlements",
    body,
    "POST",
  );
}
