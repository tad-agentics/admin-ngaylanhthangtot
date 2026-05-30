import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/dashboard.tsx"),
  route("users", "routes/users.tsx"),
  route("users/:id", "routes/users.$id.tsx"),
  route("orders", "routes/orders.tsx"),
  route("referrals", "routes/referrals.tsx"),
  route("dang-nhap", "routes/dang-nhap.tsx"),
  route("auth/callback", "routes/auth.callback.tsx"),
] satisfies RouteConfig;
