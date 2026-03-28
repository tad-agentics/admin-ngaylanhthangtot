import { useMemo, useState } from "react";

import type { AdminMonthlyDatum } from "~/lib/admin-stats";
import { formatVnd } from "~/lib/admin-stats";
import { cn } from "~/lib/utils";

import { WidgetHeader } from "./AdminTopBar";

const ROWS = 14;

type Range = "week" | "month" | "year";

type RevenueTrendCardProps = {
  monthly: AdminMonthlyDatum[];
  chartScaleMaxM: number;
  totalRevenueVnd: number;
  loading?: boolean;
  error?: string | null;
};

function buildYTicks(maxM: number) {
  const m = Math.max(maxM, 0.000_001);
  const step = m / 4;
  return [4, 3, 2, 1, 0].map((i) => Math.round((step * i + Number.EPSILON) * 100) / 100);
}

export function RevenueTrendCard({
  monthly,
  chartScaleMaxM,
  totalRevenueVnd,
  loading,
  error,
}: RevenueTrendCardProps) {
  const [range, setRange] = useState<Range>("month");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const yTicks = useMemo(() => buildYTicks(chartScaleMaxM), [chartScaleMaxM]);

  const maxM = useMemo(() => {
    return Math.max(
      chartScaleMaxM,
      0.000_001,
      ...monthly.map((d) => d.leM + d.subscriptionM),
    );
  }, [chartScaleMaxM, monthly]);

  const columns = useMemo(() => {
    return monthly.map((d) => {
      const scale = ROWS / maxM;
      let nSub = Math.round(d.subscriptionM * scale);
      let nLe = Math.round(d.leM * scale);
      const total = nSub + nLe;
      if (total > ROWS) {
        const r = ROWS / total;
        nSub = Math.max(0, Math.floor(nSub * r));
        nLe = ROWS - nSub;
      }
      return {
        ...d,
        nSub,
        nLe,
      };
    });
  }, [monthly, maxM]);

  const hovered = hoverIndex !== null ? columns[hoverIndex] : null;

  if (error) {
    return (
      <section className="rounded-2xl border border-admin-border-subtle bg-admin-card p-5 sm:p-6">
        <WidgetHeader title="Xu hướng doanh thu" />
        <p className="mt-4 text-sm text-red-600">{error}</p>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="rounded-2xl border border-admin-border-subtle bg-admin-card p-5 sm:p-6">
        <WidgetHeader title="Xu hướng doanh thu" />
        <div className="mt-8 h-[220px] animate-pulse rounded-lg bg-admin-canvas" />
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-admin-border-subtle bg-admin-card p-5 sm:p-6">
      <WidgetHeader
        title="Xu hướng doanh thu"
        subtitle={`Tổng đã thanh toán: ${formatVnd(totalRevenueVnd)}`}
      />

      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="inline-flex items-center gap-2 text-admin-text-secondary">
            <span className="size-2.5 rounded-full bg-admin-chart-new ring-1 ring-admin-border-subtle" />
            Gói lẻ (lượng)
          </span>
          <span className="inline-flex items-center gap-2 text-admin-text-secondary">
            <span className="size-2.5 rounded-full bg-admin-chart-existing" />
            Gói thời hạn
          </span>
        </div>

        <div
          className="inline-flex rounded-full border border-admin-border-subtle bg-admin-canvas p-0.5 text-xs font-semibold"
          role="tablist"
          aria-label="Khoảng thời gian"
        >
          {(
            [
              { id: "week" as const, label: "Tuần" },
              { id: "month" as const, label: "Tháng" },
              { id: "year" as const, label: "Năm" },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={range === id}
              title="Biểu đồ hiện theo 12 tháng (Tuần/Năm sắp nối)"
              onClick={() => setRange(id)}
              className={cn(
                "rounded-full px-3 py-1.5 transition",
                range === id
                  ? "bg-admin-card text-foreground ring-1 ring-neutral-300"
                  : "text-admin-text-secondary hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="sr-only">
        Mười hai tháng gần nhất: doanh thu PayOS đã paid, tách gói lẻ và gói
        thời hạn.
      </p>

      <div className="relative mt-8 flex gap-2 sm:gap-3">
        <div className="flex w-11 shrink-0 flex-col justify-between pb-6 text-right text-[10px] font-medium tabular-nums text-admin-text-secondary sm:w-12 sm:text-[11px]">
          {yTicks.map((t, i) => (
            <span key={i}>{t === 0 ? "0" : `${t}M`}</span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          {hovered ? (
            <div
              className="pointer-events-none absolute -top-1 z-10 hidden -translate-x-1/2 sm:block"
              style={{
                left: `calc(${(hoverIndex! + 0.5) * (100 / columns.length)}% )`,
              }}
            >
              <div className="min-w-[160px] rounded-xl border border-admin-border-subtle bg-admin-card px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-admin-text-secondary">
                  {hovered.label}
                </p>
                <p className="mt-1.5 text-xs text-foreground">
                  <span className="text-admin-text-secondary">Gói lẻ: </span>
                  <span className="font-semibold tabular-nums">
                    {formatVnd(hovered.leRevenueVnd)}
                  </span>
                </p>
                <p className="text-xs text-foreground">
                  <span className="text-admin-text-secondary">Thời hạn: </span>
                  <span className="font-semibold tabular-nums">
                    {formatVnd(hovered.subscriptionRevenueVnd)}
                  </span>
                </p>
              </div>
              <div
                className="mx-auto mt-1 h-8 w-px border-l border-dashed border-admin-text-secondary/40"
                aria-hidden
              />
            </div>
          ) : null}

          <div
            className="flex h-[200px] items-stretch gap-1 sm:h-[220px] sm:gap-1.5"
            onMouseLeave={() => setHoverIndex(null)}
          >
            {columns.map((col, i) => (
              <div
                key={col.key}
                className="relative flex min-w-0 flex-1 flex-col-reverse gap-px"
                onMouseEnter={() => setHoverIndex(i)}
              >
                {Array.from({ length: col.nSub }).map((_, j) => (
                  <div
                    key={`sub-${j}`}
                    className="h-2 w-full shrink-0 rounded-[2px] bg-admin-chart-existing sm:h-2.5"
                  />
                ))}
                {Array.from({ length: col.nLe }).map((_, j) => (
                  <div
                    key={`le-${j}`}
                    className="h-2 w-full shrink-0 rounded-[2px] bg-admin-chart-new ring-1 ring-admin-border-subtle/80 sm:h-2.5"
                  />
                ))}
              </div>
            ))}
          </div>

          <div className="mt-2 flex justify-between gap-1 border-t border-admin-border-subtle pt-2">
            {columns.map((col) => (
              <span
                key={col.key}
                className="flex-1 text-center text-[9px] font-semibold text-admin-text-secondary sm:text-[10px]"
              >
                {col.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
