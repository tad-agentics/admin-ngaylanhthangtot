import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  AdminForbiddenHint,
  AdminShell,
  EnvBanner,
} from "~/components/admin/AdminShell";
import {
  CHECKOUT_PACKAGE_SKUS,
  createAdminCoupon,
  fetchAdminCoupons,
  formatCouponDiscount,
  lifecycleLabel,
  packageSkuLabel,
  patchAdminCoupon,
  type CreateCouponBody,
  type DiscountKind,
} from "~/lib/admin-coupons";
import { useAuth } from "~/lib/auth";
import { adminKeys } from "~/lib/query-keys";
import { cn } from "~/lib/utils";

function formatDt(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("vi-VN", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function toDatetimeLocalValue(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string): string | null {
  if (!value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

const LIFECYCLE_STYLES: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-900",
  inactive: "bg-neutral-200 text-neutral-800",
  scheduled: "bg-sky-100 text-sky-900",
  expired: "bg-amber-100 text-amber-950",
  exhausted: "bg-orange-100 text-orange-950",
};

export default function CouponsRoute() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [submittedQ, setSubmittedQ] = useState("");
  const [activeFilter, setActiveFilter] = useState<"" | "true" | "false">("");
  const [showCreate, setShowCreate] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [discountKind, setDiscountKind] = useState<DiscountKind>("percent");
  const [discountValue, setDiscountValue] = useState("10");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [note, setNote] = useState("");
  const [allowedSkus, setAllowedSkus] = useState<string[]>([]);

  const listQuery = useQuery({
    queryKey: adminKeys.couponsList({ q: submittedQ, active: activeFilter }),
    queryFn: () =>
      fetchAdminCoupons({
        q: submittedQ || undefined,
        active: activeFilter || undefined,
        limit: 50,
        offset: 0,
      }),
    enabled: Boolean(user),
  });

  const createMutation = useMutation({
    mutationFn: (body: CreateCouponBody) => createAdminCoupon(body),
    onSuccess: async () => {
      setShowCreate(false);
      setFormError(null);
      setCode("");
      setDiscountValue("10");
      setValidFrom("");
      setValidUntil("");
      setMaxRedemptions("");
      setNote("");
      setAllowedSkus([]);
      await queryClient.invalidateQueries({ queryKey: adminKeys.couponsAll() });
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const patchMutation = useMutation({
    mutationFn: patchAdminCoupon,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.couponsAll() });
    },
  });

  const displayName =
    user?.user_metadata?.full_name ??
    user?.email?.split("@")[0] ??
    "Admin";

  const coupons = listQuery.data?.coupons ?? [];

  function toggleSku(sku: string) {
    setAllowedSkus((prev) =>
      prev.includes(sku) ? prev.filter((s) => s !== sku) : [...prev, sku],
    );
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const value = Number.parseInt(discountValue, 10);
    if (!Number.isFinite(value) || value <= 0) {
      setFormError("Giá trị giảm phải là số nguyên dương.");
      return;
    }
    let max: number | null = null;
    if (maxRedemptions.trim()) {
      const n = Number.parseInt(maxRedemptions, 10);
      if (!Number.isFinite(n) || n < 1) {
        setFormError("Giới hạn lượt dùng phải là số nguyên dương.");
        return;
      }
      max = n;
    }
    createMutation.mutate({
      code: code.trim(),
      discount_kind: discountKind,
      discount_value: value,
      valid_from: fromDatetimeLocalValue(validFrom),
      valid_until: fromDatetimeLocalValue(validUntil),
      max_redemptions: max,
      allowed_package_skus: allowedSkus.length > 0 ? allowedSkus : null,
      note: note.trim() || null,
    });
  }

  return (
    <AdminShell
      activeNav="coupons"
      userName={displayName}
      onRefresh={() => void listQuery.refetch()}
      refreshing={listQuery.isFetching}
    >
      <EnvBanner />
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Mã giảm giá</h1>
            <p className="mt-1 max-w-2xl text-sm text-admin-text-secondary">
              Tạo và quản lý coupon trên{" "}
              <code className="rounded bg-admin-canvas px-1 text-[11px]">
                discount_coupons
              </code>
              . App ngaylanhthangtot.vn chỉ gửi mã khi thanh toán — validate và
              trừ tiền hoàn toàn qua{" "}
              <code className="rounded bg-admin-canvas px-1 text-[11px]">
                payos-create-checkout
              </code>{" "}
              (quote + tạo đơn).
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowCreate((v) => !v);
              setFormError(null);
            }}
            className="h-10 rounded-lg bg-neutral-950 px-4 text-sm font-medium text-white"
          >
            {showCreate ? "Đóng form" : "Tạo mã mới"}
          </button>
        </div>

        {showCreate ? (
          <form
            onSubmit={handleCreate}
            className="space-y-4 rounded-2xl border border-admin-border-subtle bg-admin-card p-4"
          >
            <p className="text-sm font-semibold text-foreground">Tạo coupon</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium">Mã (A–Z, 0–9)</label>
                <input
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="TET2026"
                  className="mt-1 h-10 w-full rounded-lg border border-admin-border-subtle bg-background px-2 font-mono text-sm uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Loại giảm</label>
                <select
                  value={discountKind}
                  onChange={(e) =>
                    setDiscountKind(e.target.value as DiscountKind)}
                  className="mt-1 h-10 w-full rounded-lg border border-admin-border-subtle bg-background px-2 text-sm"
                >
                  <option value="percent">Phần trăm (%)</option>
                  <option value="fixed_vnd">Số tiền cố định (₫)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium">
                  {discountKind === "percent" ? "Phần trăm (1–100)" : "Số tiền (₫)"}
                </label>
                <input
                  required
                  type="number"
                  min={1}
                  max={discountKind === "percent" ? 100 : undefined}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-admin-border-subtle bg-background px-2 text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">
                  Giới hạn lượt dùng (để trống = không giới hạn)
                </label>
                <input
                  type="number"
                  min={1}
                  value={maxRedemptions}
                  onChange={(e) => setMaxRedemptions(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-admin-border-subtle bg-background px-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Bắt đầu (tuỳ chọn)</label>
                <input
                  type="datetime-local"
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-admin-border-subtle bg-background px-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Kết thúc (tuỳ chọn)</label>
                <input
                  type="datetime-local"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-admin-border-subtle bg-background px-2 text-sm"
                />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium">Áp dụng gói (bỏ trống = tất cả gói checkout)</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {CHECKOUT_PACKAGE_SKUS.map((sku) => (
                  <label
                    key={sku}
                    className={cn(
                      "cursor-pointer rounded-full border px-3 py-1 text-xs font-medium",
                      allowedSkus.includes(sku)
                        ? "border-foreground bg-foreground text-background"
                        : "border-admin-border-subtle bg-admin-canvas text-admin-text-secondary",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={allowedSkus.includes(sku)}
                      onChange={() => toggleSku(sku)}
                    />
                    {packageSkuLabel(sku)}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium">Ghi chú nội bộ</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                className="mt-1 h-10 w-full rounded-lg border border-admin-border-subtle bg-background px-2 text-sm"
              />
            </div>
            {formError ? (
              <p className="text-sm text-red-700">{formError}</p>
            ) : null}
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="h-10 rounded-lg bg-neutral-950 px-4 text-sm font-medium text-white disabled:opacity-60"
            >
              {createMutation.isPending ? "Đang tạo…" : "Tạo coupon"}
            </button>
          </form>
        ) : null}

        <form
          className="flex flex-wrap items-end gap-3 rounded-2xl border border-admin-border-subtle bg-admin-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmittedQ(q.trim());
          }}
        >
          <div className="min-w-[12rem] flex-1">
            <label className="block text-xs font-medium">Tìm mã</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value.toUpperCase())}
              placeholder="TET"
              className="mt-1 h-10 w-full rounded-lg border border-admin-border-subtle bg-background px-2 font-mono text-sm uppercase"
            />
          </div>
          <div>
            <label className="block text-xs font-medium">Trạng thái DB</label>
            <select
              value={activeFilter}
              onChange={(e) =>
                setActiveFilter(e.target.value as "" | "true" | "false")}
              className="mt-1 h-10 rounded-lg border border-admin-border-subtle bg-background px-2 text-sm"
            >
              <option value="">Tất cả</option>
              <option value="true">active = true</option>
              <option value="false">active = false</option>
            </select>
          </div>
          <button
            type="submit"
            className="h-10 rounded-lg bg-neutral-950 px-4 text-sm font-medium text-white"
          >
            Lọc
          </button>
        </form>

        <AdminForbiddenHint
          error={listQuery.error?.message ?? null}
          email={user?.email ?? null}
        />

        <div className="overflow-x-auto rounded-2xl border border-admin-border-subtle bg-admin-card">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr>
                {[
                  "Mã",
                  "Giảm",
                  "Trạng thái",
                  "Lượt dùng",
                  "Gói",
                  "Hiệu lực",
                  "Ghi chú",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    className="border-b border-admin-border-subtle bg-admin-canvas/60 px-3 py-2.5 text-left text-xs font-semibold uppercase text-admin-text-secondary"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {listQuery.isLoading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-admin-text-secondary">
                    Đang tải…
                  </td>
                </tr>
              ) : coupons.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-admin-text-secondary">
                    Chưa có coupon.
                  </td>
                </tr>
              ) : (
                coupons.map((c) => (
                  <tr key={c.code}>
                    <td className="border-b border-admin-border-subtle/80 px-3 py-2.5 font-mono text-xs font-semibold">
                      {c.code}
                    </td>
                    <td className="border-b border-admin-border-subtle/80 px-3 py-2.5">
                      {formatCouponDiscount(c)}
                    </td>
                    <td className="border-b border-admin-border-subtle/80 px-3 py-2.5">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-medium",
                          LIFECYCLE_STYLES[c.lifecycle] ?? "bg-admin-canvas",
                        )}
                      >
                        {lifecycleLabel(c.lifecycle)}
                      </span>
                    </td>
                    <td className="border-b border-admin-border-subtle/80 px-3 py-2.5 tabular-nums">
                      {c.redemption_count}
                      {c.max_redemptions != null ? ` / ${c.max_redemptions}` : ""}
                    </td>
                    <td className="border-b border-admin-border-subtle/80 px-3 py-2.5 text-xs">
                      {c.allowed_package_skus?.length
                        ? c.allowed_package_skus.map(packageSkuLabel).join(", ")
                        : "Mọi gói"}
                    </td>
                    <td className="border-b border-admin-border-subtle/80 px-3 py-2.5 text-xs text-admin-text-secondary">
                      <div>{formatDt(c.valid_from)} →</div>
                      <div>{formatDt(c.valid_until)}</div>
                    </td>
                    <td className="border-b border-admin-border-subtle/80 px-3 py-2.5 text-xs text-admin-text-secondary">
                      {c.note ?? "—"}
                    </td>
                    <td className="border-b border-admin-border-subtle/80 px-3 py-2.5">
                      {c.active ? (
                        <button
                          type="button"
                          disabled={patchMutation.isPending}
                          onClick={() =>
                            patchMutation.mutate({ code: c.code, active: false })
                          }
                          className="text-xs font-medium text-red-800 hover:underline disabled:opacity-50"
                        >
                          Tắt
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={patchMutation.isPending}
                          onClick={() =>
                            patchMutation.mutate({ code: c.code, active: true })
                          }
                          className="text-xs font-medium text-foreground hover:underline disabled:opacity-50"
                        >
                          Bật lại
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
