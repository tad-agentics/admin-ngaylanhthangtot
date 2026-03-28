import {
  ChevronRight,
  Info,
  MoreHorizontal,
  RefreshCw,
  Search,
} from "lucide-react";

import { cn } from "~/lib/utils";

type AdminTopBarProps = {
  userName?: string;
  breadcrumb?: { parent: string; current: string };
  onRefresh?: () => void;
  refreshing?: boolean;
};

export function AdminTopBar({
  userName = "Admin",
  breadcrumb = { parent: "Tổng quan", current: "Tổng quan" },
  onRefresh,
  refreshing = false,
}: AdminTopBarProps) {
  return (
    <header className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <nav
          className="flex items-center gap-1 text-sm text-admin-text-secondary"
          aria-label="Breadcrumb"
        >
          <span className="font-medium text-foreground">{breadcrumb.parent}</span>
          <ChevronRight className="size-4 opacity-60" strokeWidth={2} />
          <span>{breadcrumb.current}</span>
        </nav>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
          {onRefresh ? (
            <button
              type="button"
              onClick={() => onRefresh()}
              disabled={refreshing}
              className={cn(
                "flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-admin-border-subtle bg-admin-card px-4 text-sm font-medium text-foreground transition hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-60",
              )}
              aria-busy={refreshing}
            >
              <RefreshCw
                className={cn("size-4 shrink-0", refreshing && "animate-spin")}
                strokeWidth={1.75}
                aria-hidden
              />
              Làm mới
            </button>
          ) : null}
          <div className="relative w-full sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-admin-text-secondary"
              strokeWidth={1.75}
            />
            <label htmlFor="admin-search" className="sr-only">
              Tìm kiếm
            </label>
            <input
              id="admin-search"
              type="search"
              placeholder="Tìm kiếm..."
              className="h-10 w-full rounded-full border border-admin-border-subtle bg-admin-card pl-10 pr-4 text-sm text-foreground outline-none ring-0 transition placeholder:text-admin-text-secondary/80 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-950/10"
            />
          </div>
        </div>
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[26px]">
          Chào mừng trở lại, {userName}
        </h1>
      </div>
    </header>
  );
}

export function WidgetHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-admin-text-secondary">
            {title}
          </h2>
          <button
            type="button"
            className="rounded-lg p-1 text-admin-text-secondary transition hover:bg-black/[0.04]"
            aria-label="Thông tin"
          >
            <Info className="size-4" strokeWidth={1.75} />
          </button>
        </div>
        {subtitle ? (
          <p className="mt-1 text-sm font-semibold text-foreground">{subtitle}</p>
        ) : null}
      </div>
      <button
        type="button"
        className="rounded-lg p-1.5 text-admin-text-secondary transition hover:bg-black/[0.04]"
        aria-label="Tùy chọn"
      >
        <MoreHorizontal className="size-5" strokeWidth={1.75} />
      </button>
    </div>
  );
}
