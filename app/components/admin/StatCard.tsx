import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

function MiniSparkline({ className }: { className?: string }) {
  const heights = [40, 65, 45, 80, 55, 90, 48, 72, 58, 85, 62, 78, 52, 88];
  return (
    <div
      className={cn("flex h-10 items-end gap-px opacity-90", className)}
      aria-hidden
    >
      {heights.map((h, i) => (
        <div
          key={i}
          className="w-1 rounded-sm bg-admin-chart-existing/25"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

type StatCardProps = {
  label: string;
  value: string;
  delta: string;
  footnote?: string;
  icon?: ReactNode;
};

export function StatCard({ label, value, delta, footnote, icon }: StatCardProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-admin-border-subtle bg-admin-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-admin-text-secondary">{label}</p>
          <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
        </div>
        <MiniSparkline className="hidden shrink-0 sm:flex" />
      </div>
      <div className="mt-4 flex items-end justify-between gap-2">
        <span className="flex size-8 items-center justify-center rounded-full bg-admin-canvas text-admin-text-secondary ring-1 ring-admin-border-subtle">
          {icon}
        </span>
        <div className="text-right">
          <p className="text-sm font-semibold text-admin-positive">{delta}</p>
          {footnote ? (
            <p className="text-[11px] text-admin-text-secondary">{footnote}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
