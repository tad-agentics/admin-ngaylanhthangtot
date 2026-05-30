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

function isActiveSub(iso: string | null) {
  if (!iso) return false;
  return new Date(iso).getTime() > Date.now();
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
  const [showLegacyCredits, setShowLegacyCredits] = useState(false);
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
    <div className="space-y-3">
      <p className="text-sm text-admin-text-secondary">
        Tối đa 100 hồ sơ mới nhất. Sửa gói/luận thủ công sẽ có khi deploy{" "}
        <code className="rounded bg-admin-canvas px-1 text-[11px]">
          admin-user-entitlements
        </code>{" "}
        (repo app user). Hiện chỉ xem entitlement và xoá user.
      </p>

      <button
        type="button"
        onClick={() => setShowLegacyCredits((v) => !v)}
        className="text-xs font-medium text-admin-text-secondary underline-offset-2 hover:underline"
      >
        {showLegacyCredits ? "Ẩn" : "Hiện"} cột nạp lượng (legacy)
      </button>

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
            <Th>Gói lịch</Th>
            <Th>Luận BT</Th>
            <Th>Tiểu vận</Th>
            {showLegacyCredits ? <Th>Lượng</Th> : null}
            {showLegacyCredits ? <Th>Nạp lượng</Th> : null}
            <Th>Tạo</Th>
            <Th>Xoá</Th>
          </tr>
        </thead>
        <tbody>
          {profiles.map((p) => {
            const isSelf = p.id === currentUserId;
            const busy = busyId === p.id;
            const subActive = isActiveSub(p.subscription_expires_at);
            const tvActive = isActiveSub(p.tieu_van_reading_expires_at);
            return (
              <tr key={p.id} className="hover:bg-black/[0.02]">
                <Td className="font-mono text-xs" title={p.id}>
                  {shortId(p.id)}
                </Td>
                <Td>{p.email ?? "—"}</Td>
                <Td className="text-xs">
                  {p.subscription_expires_at ? (
                    <span
                      className={cn(
                        "rounded-md px-2 py-0.5 font-medium",
                        subActive
                          ? "bg-emerald-100 text-emerald-900"
                          : "bg-admin-canvas text-admin-text-secondary",
                      )}
                    >
                      {formatDt(p.subscription_expires_at)}
                    </span>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td className="text-xs">
                  {p.bazi_reading_unlocked_at ? (
                    <span className="rounded-md bg-emerald-100 px-2 py-0.5 font-medium text-emerald-900">
                      Đã mở
                    </span>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td className="text-xs">
                  {p.tieu_van_reading_expires_at ? (
                    <span
                      className={cn(
                        "rounded-md px-2 py-0.5 font-medium",
                        tvActive
                          ? "bg-emerald-100 text-emerald-900"
                          : "bg-admin-canvas text-admin-text-secondary",
                      )}
                    >
                      {formatDt(p.tieu_van_reading_expires_at)}
                    </span>
                  ) : (
                    "—"
                  )}
                </Td>
                {showLegacyCredits ? (
                  <Td className="tabular-nums">{p.credits_balance ?? "—"}</Td>
                ) : null}
                {showLegacyCredits ? (
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
                  </Td>
                ) : null}
                <Td className="whitespace-nowrap text-xs">
                  {formatDt(p.created_at)}
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
    </div>
  );
}
