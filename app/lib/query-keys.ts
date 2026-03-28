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
};
