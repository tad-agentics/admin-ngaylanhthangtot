import { useState, type ReactNode } from "react";

import type { AdminProfileRow } from "~/lib/admin-data";
import { adminAddCredits, adminDeleteUser } from "~/lib/admin-user-actions";
import { cn } from "~/lib/utils";

function shortId(id: string) {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…`;
}

function formatDt(iso: string) {
  try {
    return new Date(iso).toLocaleString("vi-VN", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-admin-border-subtle bg-admin-card/80">
      <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
        {children}
      </table>
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th className="border-b border-admin-border-subtle bg-admin-canvas/60 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-admin-text-secondary">
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <td
      title={title}
      className={cn(
        "border-b border-admin-border-subtle/80 px-3 py-2.5 text-foreground",
        className,
      )}
    >
      {children}
    </td>
  );
}

type UsersAdminPanelProps = {
  profiles: AdminProfileRow[];
  currentUserId: string;
  onMutateSuccess: () => void;
};

export function UsersAdminPanel({
  profiles,
  currentUserId,
  onMutateSuccess,
}: UsersAdminPanelProps) {
  const [amountByUser, setAmountByUser] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  async function handleAddCredits(userId: string) {
    setRowError(null);
    const raw = (amountByUser[userId] ?? "").trim();
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) {
      setRowError("Nhập số lượng nguyên dương (ví dụ 10).");
      return;
    }
    setBusyId(userId);
    try {
      await adminAddCredits(userId, n);
      setAmountByUser((prev) => ({ ...prev, [userId]: "" }));
      onMutateSuccess();
    } catch (e) {
      setRowError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(p: AdminProfileRow) {
    setRowError(null);
    const ok = window.confirm(
      `Xoá vĩnh viễn tài khoản và dữ liệu Auth gắn với:\n${p.email ?? p.id}\n\nThao tác không hoàn tác.`,
    );
    if (!ok) return;
    setBusyId(p.id);
    try {
      await adminDeleteUser(p.id);
      onMutateSuccess();
    } catch (e) {
      setRowError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-admin-text-secondary">
        Tối đa 100 hồ sơ mới nhất. Nạp lượng ghi{" "}
        <code className="rounded bg-admin-canvas px-1 text-[11px]">credit_ledger</code>{" "}
        qua Edge{" "}
        <code className="rounded bg-admin-canvas px-1 text-[11px]">
          admin-user-actions
        </code>
        .
      </p>
      {rowError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
          {rowError}
        </div>
      ) : null}
      <TableWrap>
        <thead>
          <tr>
            <Th>Hồ sơ</Th>
            <Th>Email</Th>
            <Th>Tên</Th>
            <Th>Lượng</Th>
            <Th>Gói đến</Th>
            <Th>Tạo</Th>
            <Th>Nạp lượng</Th>
            <Th>Xoá</Th>
          </tr>
        </thead>
        <tbody>
          {profiles.map((p) => {
            const isSelf = p.id === currentUserId;
            const busy = busyId === p.id;
            return (
              <tr key={p.id} className="hover:bg-black/[0.02]">
                <Td className="font-mono text-xs" title={p.id}>
                  {shortId(p.id)}
                </Td>
                <Td>{p.email ?? "—"}</Td>
                <Td>{p.display_name ?? "—"}</Td>
                <Td className="tabular-nums">{p.credits_balance ?? "—"}</Td>
                <Td className="text-xs">
                  {p.subscription_expires_at
                    ? formatDt(p.subscription_expires_at)
                    : "—"}
                </Td>
                <Td className="whitespace-nowrap text-xs">
                  {formatDt(p.created_at)}
                </Td>
                <Td className="min-w-[140px]">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      disabled={busy}
                      placeholder="Số lượng"
                      value={amountByUser[p.id] ?? ""}
                      onChange={(e) =>
                        setAmountByUser((prev) => ({
                          ...prev,
                          [p.id]: e.target.value,
                        }))
                      }
                      className="w-24 rounded-lg border border-admin-border-subtle bg-background px-2 py-1 text-xs tabular-nums"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleAddCredits(p.id)}
                      className="rounded-lg bg-foreground px-2.5 py-1 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
                    >
                      Nạp
                    </button>
                  </div>
                  <p className="mt-1 text-[10px] text-admin-text-secondary">
                    Cộng dồn vào số dư hiện tại
                  </p>
                </Td>
                <Td className="whitespace-nowrap">
                  <button
                    type="button"
                    disabled={busy || isSelf}
                    title={
                      isSelf
                        ? "Không thể xoá chính tài khoản đang đăng nhập"
                        : "Xoá user khỏi Auth"
                    }
                    onClick={() => void handleDelete(p)}
                    className="rounded-lg border border-red-200 bg-red-50/80 px-2.5 py-1 text-xs font-medium text-red-900 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Xoá
                  </button>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
      {profiles.length === 0 ? (
        <p className="text-sm text-admin-text-secondary">Chưa có người dùng.</p>
      ) : null}
      <p className="mt-4 text-xs text-admin-text-secondary">
        Deploy{" "}
        <code className="rounded bg-admin-canvas px-1 text-[11px]">admin-user-actions</code>, secret{" "}
        <code className="rounded bg-admin-canvas px-1 text-[11px]">ADMIN_EMAILS</code>, và chạy migration{" "}
        <code className="rounded bg-admin-canvas px-1 text-[11px]">
          20260328120000_admin_grant_credits.sql
        </code>{" "}
        (RPC <code className="rounded bg-admin-canvas px-1 text-[11px]">admin_grant_credits</code> — một
        transaction, an toàn khi nhiều admin thao tác). Nếu thiếu cột trên{" "}
        <code className="rounded bg-admin-canvas px-1 text-[11px]">credit_ledger</code>, chỉnh SQL trong
        migration.
      </p>
    </div>
  );
}
