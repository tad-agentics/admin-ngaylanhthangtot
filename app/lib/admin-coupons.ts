import {
  adminFunctionGet,
  adminFunctionPost,
} from "~/lib/admin-functions";

export type DiscountKind = "percent" | "fixed_vnd";

export type CouponLifecycle =
  | "active"
  | "inactive"
  | "scheduled"
  | "expired"
  | "exhausted";

export type AdminCoupon = {
  code: string;
  discount_kind: DiscountKind;
  discount_value: number;
  active: boolean;
  valid_from: string | null;
  valid_until: string | null;
  max_redemptions: number | null;
  redemption_count: number;
  allowed_package_skus: string[] | null;
  note: string | null;
  created_at: string;
  lifecycle: CouponLifecycle;
  remaining_redemptions: number | null;
};

export type AdminCouponsListResponse = {
  coupons: AdminCoupon[];
  total: number;
  limit: number;
  offset: number;
  checkout_package_skus: string[];
};

export type CreateCouponBody = {
  code: string;
  discount_kind: DiscountKind;
  discount_value: number;
  valid_from?: string | null;
  valid_until?: string | null;
  max_redemptions?: number | null;
  allowed_package_skus?: string[] | null;
  note?: string | null;
};

export type PatchCouponBody = {
  code: string;
  active?: boolean;
  valid_from?: string | null;
  valid_until?: string | null;
  max_redemptions?: number | null;
  note?: string | null;
};

export const CHECKOUT_PACKAGE_SKUS = [
  "goi_1thang",
  "goi_6thang",
  "goi_12thang",
  "luan_bat_tu",
  "luan_tieu_van",
] as const;

const PACKAGE_LABELS: Record<string, string> = {
  goi_1thang: "Gói 3 tháng",
  goi_6thang: "Gói 6 tháng",
  goi_12thang: "Gói 12 tháng",
  luan_bat_tu: "Luận Bát tự",
  luan_tieu_van: "Luận Tiểu vận",
};

export function packageSkuLabel(sku: string) {
  return PACKAGE_LABELS[sku] ?? sku;
}

export function formatCouponDiscount(coupon: AdminCoupon) {
  if (coupon.discount_kind === "percent") {
    return `${coupon.discount_value}%`;
  }
  return new Intl.NumberFormat("vi-VN").format(coupon.discount_value) + " ₫";
}

export function lifecycleLabel(lifecycle: CouponLifecycle) {
  switch (lifecycle) {
    case "active":
      return "Đang dùng";
    case "inactive":
      return "Tắt";
    case "scheduled":
      return "Chưa mở";
    case "expired":
      return "Hết hạn";
    case "exhausted":
      return "Hết lượt";
    default:
      return lifecycle;
  }
}

export async function fetchAdminCoupons(params?: {
  q?: string;
  active?: "true" | "false";
  limit?: number;
  offset?: number;
}): Promise<AdminCouponsListResponse> {
  return adminFunctionGet<AdminCouponsListResponse>("admin-coupons", {
    q: params?.q,
    active: params?.active,
    limit: params?.limit ?? 50,
    offset: params?.offset ?? 0,
  });
}

export async function createAdminCoupon(
  body: CreateCouponBody,
): Promise<{ coupon: AdminCoupon }> {
  return adminFunctionPost<{ coupon: AdminCoupon }>("admin-coupons", body);
}

export async function patchAdminCoupon(
  body: PatchCouponBody,
): Promise<{ coupon: AdminCoupon }> {
  return adminFunctionPost<{ coupon: AdminCoupon }>(
    "admin-coupons",
    body,
    "PATCH",
  );
}
