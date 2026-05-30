import { adminFunctionGet } from "~/lib/admin-functions";

export type ReferralRewardRule = {
  package_sku: string;
  reward_vnd: number;
};

export type ReferralSummary = {
  totalRewardVnd: number;
  last30DaysRewardVnd: number;
  eventCount: number;
  activeReferrersCount: number;
  referredProfilesCount: number;
  checkoutReferralDiscountPercent: number;
  rewardRules: ReferralRewardRule[];
};

export type ReferralEventRow = {
  id: string;
  referrer_profile_id: string;
  referee_profile_id: string;
  payment_order_id: string;
  package_sku: string;
  reward_vnd: number;
  checkout_referral_code: string | null;
  created_at: string;
  referrer_email: string | null;
  referrer_code: string | null;
  referee_email: string | null;
};

export type ReferralEventsResponse = {
  events: ReferralEventRow[];
  total: number;
  limit: number;
  offset: number;
};

export type ReferralLeaderRow = {
  id: string;
  email: string | null;
  referral_code: string | null;
  referral_reward_total_vnd: number;
  created_at: string;
  linked_referees_count: number;
  reward_events_count: number;
};

export type ReferralLeadersResponse = {
  leaders: ReferralLeaderRow[];
};

export type ReferralLinkRow = {
  referee_id: string;
  referee_email: string | null;
  referee_code: string | null;
  referee_created_at: string;
  subscription_expires_at: string | null;
  referrer_id: string;
  referrer_email: string | null;
  referrer_code: string | null;
};

export type ReferralLinksResponse = {
  links: ReferralLinkRow[];
  total: number;
  limit: number;
  offset: number;
};

export type ReferralListFilters = {
  referrer_id?: string;
  referee_id?: string;
  q?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

export async function fetchReferralSummary(): Promise<ReferralSummary> {
  return adminFunctionGet<ReferralSummary>("admin-referrals", { view: "summary" });
}

export async function fetchReferralEvents(
  filters: ReferralListFilters,
): Promise<ReferralEventsResponse> {
  return adminFunctionGet<ReferralEventsResponse>("admin-referrals", {
    view: "events",
    ...filters,
  });
}

export async function fetchReferralLeaders(
  limit = 20,
): Promise<ReferralLeadersResponse> {
  return adminFunctionGet<ReferralLeadersResponse>("admin-referrals", {
    view: "leaders",
    limit,
  });
}

export async function fetchReferralLinks(
  filters: ReferralListFilters,
): Promise<ReferralLinksResponse> {
  return adminFunctionGet<ReferralLinksResponse>("admin-referrals", {
    view: "links",
    ...filters,
  });
}
