import { adminFunctionGet, adminFunctionPost } from "~/lib/admin-functions";

export type AdminOrderRow = {
  id: string;
  user_id: string;
  email: string | null;
  status: string;
  package_sku: string;
  list_amount_vnd: number | null;
  amount_vnd: number | null;
  coupon_code: string | null;
  checkout_referral_code: string | null;
  provider_order_code: string | null;
  referrer_profile_id: string | null;
  created_at: string;
  paid_at: string | null;
};

export type AdminOrdersFilters = {
  status?: string;
  package_sku?: string;
  user_id?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

export type AdminOrdersResponse = {
  orders: AdminOrderRow[];
  total: number;
  limit: number;
  offset: number;
};

export async function fetchAdminOrders(
  filters: AdminOrdersFilters,
): Promise<AdminOrdersResponse> {
  const hasQuery =
    filters.status ||
    filters.package_sku ||
    filters.user_id ||
    filters.from ||
    filters.to;

  if (hasQuery || filters.offset) {
    return adminFunctionGet<AdminOrdersResponse>("admin-orders", {
      status: filters.status,
      package_sku: filters.package_sku,
      user_id: filters.user_id,
      from: filters.from,
      to: filters.to,
      limit: filters.limit ?? 50,
      offset: filters.offset ?? 0,
    });
  }

  return adminFunctionPost<AdminOrdersResponse>("admin-orders", {
    limit: filters.limit ?? 50,
    offset: filters.offset ?? 0,
    ...filters,
  });
}
