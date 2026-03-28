import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  ChevronDown,
  CreditCard,
  LayoutDashboard,
  LayoutPanelTop,
  Settings,
  Shield,
  SlidersHorizontal,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";

import { NgayLanhLogoLockupCompact } from "~/components/brand/NgayLanhLogoLockupCompact";
import { cn } from "~/lib/utils";

type NavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
};

const mainMenu: NavItem[] = [
  { id: "overview", label: "Tổng quan", icon: LayoutDashboard },
  { id: "users", label: "Người dùng", icon: Users },
  { id: "payments", label: "Giao dịch & PayOS", icon: CreditCard },
  { id: "reports", label: "Báo cáo", icon: BarChart3 },
];

const creditsMenu: NavItem[] = [
  { id: "ledger", label: "Sổ lượng (ledger)", icon: Wallet },
  { id: "feature-costs", label: "Giá tính năng", icon: SlidersHorizontal },
];

const managementMenu: NavItem[] = [
  { id: "site-banner", label: "Banner đầu trang", icon: LayoutPanelTop },
  { id: "app-config", label: "Cấu hình app", icon: Settings },
  { id: "roles", label: "Vai trò & quyền", icon: Shield },
];

type AdminSidebarProps = {
  activeId: string;
  onNavigate?: (id: string) => void;
  onSignOut?: () => void;
};

function NavSection({
  title,
  items,
  activeId,
  onNavigate,
}: {
  title: string;
  items: NavItem[];
  activeId: string;
  onNavigate?: (id: string) => void;
}) {
  return (
    <div className="mt-6 first:mt-0">
      <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-admin-text-secondary/80">
        {title}
      </p>
      <ul className="mt-2 space-y-0.5">
        {items.map(({ id, label, icon: Icon }) => {
          const active = activeId === id;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onNavigate?.(id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors",
                  active
                    ? "bg-admin-card text-foreground"
                    : "text-admin-text-secondary hover:bg-black/[0.03] hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon
                  className={cn(
                    "size-[18px] shrink-0",
                    active ? "text-foreground" : "text-admin-text-secondary",
                  )}
                  strokeWidth={1.75}
                />
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function AdminSidebar({
  activeId,
  onNavigate,
  onSignOut,
}: AdminSidebarProps) {
  return (
    <aside className="flex w-[min(100%,280px)] shrink-0 flex-col border-r border-admin-border-subtle bg-admin-sidebar px-4 py-5">
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-2xl border border-admin-border-subtle bg-admin-card px-2 py-2.5 text-left transition hover:bg-admin-canvas"
      >
        <NgayLanhLogoLockupCompact className="min-w-0 flex-1" markSize={44} />
        <ChevronDown className="size-4 shrink-0 self-center text-admin-text-secondary" />
      </button>

      <nav className="mt-6 flex-1 overflow-y-auto pb-6">
        <NavSection
          title="Menu chính"
          items={mainMenu}
          activeId={activeId}
          onNavigate={onNavigate}
        />
        <NavSection
          title="Lượng & giá"
          items={creditsMenu}
          activeId={activeId}
          onNavigate={onNavigate}
        />
        <NavSection
          title="Quản trị"
          items={managementMenu}
          activeId={activeId}
          onNavigate={onNavigate}
        />
        <div className="mt-6 border-t border-admin-border-subtle pt-6">
          <ul className="space-y-0.5">
            <li>
              <button
                type="button"
                onClick={() => onNavigate?.("settings")}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors",
                  activeId === "settings"
                    ? "bg-admin-card text-foreground"
                    : "text-admin-text-secondary hover:bg-black/[0.03] hover:text-foreground",
                )}
              >
                <Settings
                  className="size-[18px] shrink-0 text-admin-text-secondary"
                  strokeWidth={1.75}
                />
                Cài đặt
              </button>
            </li>
          </ul>
        </div>
      </nav>

      <div className="mt-auto border-t border-admin-border-subtle pt-4">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <span className="flex size-9 items-center justify-center rounded-full bg-admin-canvas text-admin-text-secondary ring-1 ring-admin-border-subtle">
            <UserRound className="size-4" strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1 text-xs">
            <p className="truncate font-medium text-foreground">Tài khoản admin</p>
            <p className="truncate text-admin-text-secondary">Supabase Auth</p>
          </div>
          {onSignOut ? (
            <button
              type="button"
              onClick={() => void onSignOut()}
              className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium text-admin-text-secondary hover:bg-black/[0.04] hover:text-foreground"
            >
              Đăng xuất
            </button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
