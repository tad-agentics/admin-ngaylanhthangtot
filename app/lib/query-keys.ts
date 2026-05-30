/** Query key factories — giữ prefix admin để invalidate theo nhóm. */
export const adminKeys = {
  all: ["admin"] as const,
  dashboardStats: () => [...adminKeys.all, "dashboard-stats"] as const,
  profiles: () => [...adminKeys.all, "profiles"] as const,
  paymentOrders: () => [...adminKeys.all, "payment-orders"] as const,
  creditLedger: () => [...adminKeys.all, "credit-ledger"] as const,
  featureCosts: () => [...adminKeys.all, "feature-costs"] as const,
  appConfig: () => [...adminKeys.all, "app-config"] as const,
  siteBanner: () => [...adminKeys.all, "site-banner"] as const,
  userSearch: (q: string) => [...adminKeys.all, "users", "search", q] as const,
  userDetail: (id: string, includeLaSo = false) =>
    [...adminKeys.all, "users", "detail", id, includeLaSo ? "la_so" : ""] as const,
  ordersList: (filters: Record<string, string>) =>
    [...adminKeys.all, "orders", filters] as const,
};
