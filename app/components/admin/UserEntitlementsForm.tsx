import { useState, type FormEvent } from "react";

import {
  fromDatetimeLocalValue,
  isoTimesEqual,
  toDatetimeLocalValue,
} from "~/lib/datetime";
import {
  patchAdminUserEntitlements,
  type AdminUserDetailResponse,
} from "~/lib/admin-users";

type UserEntitlementsFormProps = {
  userId: string;
  profile: AdminUserDetailResponse["profile"];
  onSaved: () => void;
};

export function UserEntitlementsForm({
  userId,
  profile,
  onSaved,
}: UserEntitlementsFormProps) {
  const [subscriptionAt, setSubscriptionAt] = useState(
    toDatetimeLocalValue(profile.subscription_expires_at),
  );
  const [baziUnlock, setBaziUnlock] = useState(
    profile.bazi_reading_unlocked_at != null,
  );
  const [adminNote, setAdminNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!adminNote.trim()) {
      setError("Ghi chú CS là bắt buộc.");
      return;
    }
    const nextSub = fromDatetimeLocalValue(subscriptionAt);
    const hadBazi = profile.bazi_reading_unlocked_at != null;

    const body: Parameters<typeof patchAdminUserEntitlements>[0] = {
      userId,
      adminNote: adminNote.trim(),
    };

    if (!isoTimesEqual(nextSub, profile.subscription_expires_at)) {
      body.subscriptionExpiresAt = nextSub;
    }
    if (baziUnlock !== hadBazi) {
      body.baziReadingUnlock = baziUnlock;
    }

    if (
      !("subscriptionExpiresAt" in body) &&
      !("baziReadingUnlock" in body)
    ) {
      setError("Không có thay đổi so với hiện tại.");
      return;
    }

    setBusy(true);
    try {
      await patchAdminUserEntitlements(body);
      setSuccess("Đã lưu entitlement.");
      setAdminNote("");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className="space-y-4 rounded-2xl border border-admin-border-subtle bg-admin-card p-5"
    >
      <h2 className="text-sm font-semibold text-foreground">Sửa entitlement</h2>
      <p className="text-xs text-admin-text-secondary">
        Không sửa ngày sinh / lá số từ đây. Mọi thay đổi được ghi audit phía server
        (gói lịch, luận Bát tự).
      </p>

      <div>
        <label
          htmlFor="sub-expires"
          className="block text-xs font-medium text-foreground"
        >
          Gói lịch đến
        </label>
        <input
          id="sub-expires"
          type="datetime-local"
          value={subscriptionAt}
          onChange={(e) => setSubscriptionAt(e.target.value)}
          className="mt-1 h-10 w-full max-w-md rounded-lg border border-admin-border-subtle bg-background px-3 text-sm"
        />
        <p className="mt-1 text-[11px] text-admin-text-secondary">
          Để trống = xoá hạn gói lịch
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={baziUnlock}
          onChange={(e) => setBaziUnlock(e.target.checked)}
          className="size-4 rounded border-admin-border-subtle"
        />
        Mở luận Bát tự (vĩnh viễn khi bật)
      </label>

      <div>
        <label
          htmlFor="admin-note"
          className="block text-xs font-medium text-foreground"
        >
          Ghi chú CS (bắt buộc)
        </label>
        <textarea
          id="admin-note"
          required
          rows={2}
          value={adminNote}
          onChange={(e) => setAdminNote(e.target.value)}
          placeholder="Ví dụ: Webhook lỗi, xác nhận chuyển khoản PayOS #123"
          className="mt-1 w-full rounded-lg border border-admin-border-subtle bg-background px-3 py-2 text-sm"
        />
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

      <button
        type="submit"
        disabled={busy}
        className="h-10 rounded-lg bg-neutral-950 px-4 text-sm font-medium text-white disabled:opacity-60"
      >
        {busy ? "Đang lưu…" : "Lưu entitlement"}
      </button>
    </form>
  );
}
