/** Shared building blocks for the prose engine screens. */

import {
  ITEM_STATUS_LABEL,
  ITEM_STATUS_STYLE,
  type GateResult,
  type ProseItemStatus,
} from "~/lib/prose";
import { cn } from "~/lib/utils";

export function StatusPill({ status }: { status: ProseItemStatus }) {
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        ITEM_STATUS_STYLE[status] ?? "bg-admin-canvas",
      )}
    >
      {ITEM_STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function GateList({ gates }: { gates: GateResult[] }) {
  if (!gates?.length) {
    return <p className="text-xs text-admin-text-secondary">Chưa chạy gate nào.</p>;
  }
  return (
    <ul className="space-y-1">
      {gates.map((g, i) => (
        <li
          key={`${g.gate}-${i}`}
          className={cn(
            "flex items-start gap-2 rounded-lg px-2 py-1 text-xs",
            g.ok
              ? "text-admin-text-secondary"
              : g.severity === "fail"
                ? "bg-red-50 text-red-900"
                : "bg-amber-50 text-amber-950",
          )}
        >
          <span className="mt-px shrink-0 font-mono">{g.ok ? "✓" : g.severity === "fail" ? "✕" : "⚑"}</span>
          <span>
            <span className="font-medium">{g.gate}</span> — {g.detail}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * EDS-flavoured page preview (approximation — parchment/ink/forest palette,
 * serif body). The real render happens in the site repo's template; this is
 * for judging prose in context, not pixel parity.
 */
export function buildPreviewHtml(
  templateKey: string,
  itemKey: string,
  output: Record<string, unknown> | null,
): string {
  const esc = (s: unknown) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  let body = "";
  if (!output) {
    body = `<p class="muted">Chưa có output.</p>`;
  } else if (templateKey.startsWith("p1")) {
    const phanTich = Array.isArray(output.phanTich) ? output.phanTich : [];
    body = `
      <div class="answer"><p>${esc(output.tomTat)}</p></div>
      <h2>Luận giải</h2>
      ${phanTich.map((p) => `<p>${esc(p)}</p>`).join("")}
      <div class="goiy"><strong>Gợi ý.</strong> ${esc(output.goiY)}</div>`;
  } else if (templateKey.startsWith("p2")) {
    const luuY = Array.isArray(output.luuY) ? output.luuY : [];
    body = `
      <p class="kicker">Ngày tốt ${esc(output.short)}</p>
      <p>${esc(output.intro)}</p>
      <h2>Lưu ý</h2>
      <ul>${luuY.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
  } else {
    body = Object.entries(output)
      .map(([k, v]) => `<h2>${esc(k)}</h2><p>${esc(typeof v === "string" ? v : JSON.stringify(v, null, 2))}</p>`)
      .join("");
  }
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<style>
  body{margin:0;padding:28px 24px;background:#e4dfd6;color:#18150e;
    font-family:Lora,Georgia,"Times New Roman",serif;font-size:15.5px;line-height:1.65;}
  .frame{max-width:560px;margin:0 auto;}
  .kicker{font-family:"Barlow Condensed","Arial Narrow",sans-serif;text-transform:uppercase;
    letter-spacing:.08em;font-size:13px;color:#9a7c22;margin:0 0 10px;}
  h2{font-family:"Barlow Condensed","Arial Narrow",sans-serif;text-transform:uppercase;
    letter-spacing:.05em;font-size:15px;line-height:1.25;margin:26px 0 8px;color:#1d3129;}
  .answer{background:#1d3129;border-radius:10px;padding:16px 18px;margin-bottom:8px;}
  .answer p{color:#f0ead9;margin:0;}
  .goiy{border-top:1px solid rgba(24,21,14,.25);margin-top:22px;padding-top:14px;font-size:14.5px;}
  ul{padding-left:20px;} li{margin-bottom:8px;}
  .muted{color:rgba(24,21,14,.55);}
  header{font-family:"Barlow Condensed","Arial Narrow",sans-serif;text-transform:uppercase;
    letter-spacing:.1em;font-size:12px;color:rgba(24,21,14,.5);margin-bottom:18px;}
</style></head><body><div class="frame">
<header>Xem thử trong bố cục · ${esc(itemKey)}</header>
${body}
</div></body></html>`;
}
