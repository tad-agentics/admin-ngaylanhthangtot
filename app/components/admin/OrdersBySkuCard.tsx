import { formatVnd } from "~/lib/admin-stats";
import type { RevenueBucketVnd } from "~/lib/admin-stats";

import { WidgetHeader } from "./AdminTopBar";

const SKU_LABELS: Record<string, string> = {
  goi_1thang: "Gói 3 tháng",
  goi_6thang: "Gói 6 tháng",
  goi_12thang: "Gói 12 tháng",
  luan_bat_tu: "Luận Bát tự",
  le: "SKU lẻ (le)",
};

type OrdersBySkuCardProps = {
  ordersBySku: Record<string, number>;
  revenueByBucketVnd: RevenueBucketVnd;
  loading?: boolean;
};

export function OrdersBySkuCard({
  ordersBySku,
  revenueByBucketVnd,
  loading,
}: OrdersBySkuCardProps) {
  const skuRows = Object.entries(ordersBySku).sort((a, b) => b[1] - a[1]);

  return (
    <section className="rounded-2xl border border-admin-border-subtle bg-admin-card p-5 sm:p-6">
      <WidgetHeader
        title="Doanh thu theo nhóm & SKU"
        subtitle="Đơn paid — Direction C"
      />

      {loading ? (
        <div className="mt-4 h-24 animate-pulse rounded-lg bg-admin-canvas" />
      ) : (
        <>
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-admin-canvas px-3 py-2.5">
              <dt className="text-xs text-admin-text-secondary">Gói lịch</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                {formatVnd(revenueByBucketVnd.subscription)}
              </dd>
            </div>
            <div className="rounded-xl bg-admin-canvas px-3 py-2.5">
              <dt className="text-xs text-admin-text-secondary">Luận add-on</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                {formatVnd(revenueByBucketVnd.addon)}
              </dd>
            </div>
            <div className="rounded-xl bg-admin-canvas px-3 py-2.5">
              <dt className="text-xs text-admin-text-secondary">SKU lẻ</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                {formatVnd(revenueByBucketVnd.legacy)}
              </dd>
            </div>
          </dl>

          {skuRows.length > 0 ? (
            <ul className="mt-5 divide-y divide-admin-border-subtle rounded-xl border border-admin-border-subtle">
              {skuRows.map(([sku, count]) => (
                <li
                  key={sku}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                >
                  <span className="min-w-0 truncate font-mono text-xs">{sku}</span>
                  <span className="shrink-0 text-admin-text-secondary">
                    {SKU_LABELS[sku] ?? "—"}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {count} đơn
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-admin-text-secondary">
              Chưa có đơn paid.
            </p>
          )}
        </>
      )}
    </section>
  );
}
