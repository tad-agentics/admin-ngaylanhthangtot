/**
 * Lockup ngang (compact) — bản Primary trong logo kit (nền sáng): mark màu + type đúng Ink / Gold / Muted.
 * Dùng ở workspace switcher sidebar; phần UI khác vẫn giữ trung tính đen-trắng.
 */

type NgayLanhLogoLockupCompactProps = {
  className?: string;
  /** Cỡ mark (px), mặc định 48 — tối thiểu kit 32px */
  markSize?: number;
  /** Dòng phụ mono dưới “Tháng Tốt” */
  meta?: string;
};

/** Mark đúng SVG kit — “01 · Primary — Nền Sáng” */
function LogoMarkBrand({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 140 140"
      className="shrink-0"
      aria-hidden
    >
      <title>Ngày Lành Tháng Tốt</title>
      <circle cx="70" cy="70" r="65" fill="#1d3129" />
      <path
        fill="#c9a84c"
        d="M70,1.5 L73.5,5 L70,8.5 L66.5,5 Z M116,20.5 L119.5,24 L116,27.5 L112.5,24 Z M135,66.5 L138.5,70 L135,73.5 L131.5,70 Z M116,112.5 L119.5,116 L116,119.5 L112.5,116 Z M70,131.5 L73.5,135 L70,138.5 L66.5,135 Z M24,112.5 L27.5,116 L24,119.5 L20.5,116 Z M5,66.5 L8.5,70 L5,73.5 L1.5,70 Z M24,20.5 L27.5,24 L24,27.5 L20.5,24 Z"
      />
      <circle
        cx="70"
        cy="70"
        r="65"
        fill="none"
        stroke="#c9a84c"
        strokeWidth="1.5"
      />
      <circle
        cx="70"
        cy="70"
        r="50"
        fill="none"
        stroke="#9a7c22"
        strokeWidth="1"
      />
      <circle
        cx="70"
        cy="70"
        r="43"
        fill="none"
        stroke="#9a7c22"
        strokeWidth="0.5"
        opacity="0.6"
      />
      <circle cx="70" cy="44" r="2.5" fill="#9a7c22" />
      <circle cx="96" cy="70" r="2.5" fill="#9a7c22" />
      <circle cx="70" cy="96" r="2.5" fill="#9a7c22" />
      <circle cx="44" cy="70" r="2.5" fill="#9a7c22" />
      <text
        x="70"
        y="70"
        textAnchor="middle"
        dominantBaseline="central"
        style={{
          fontFamily: "'Noto Serif SC', serif",
          fontWeight: 700,
          fontSize: 36,
        }}
        fill="#c9a84c"
      >
        吉
      </text>
    </svg>
  );
}

export function NgayLanhLogoLockupCompact({
  className,
  markSize = 48,
  meta = "admin · nội bộ",
}: NgayLanhLogoLockupCompactProps) {
  return (
    <div className={className}>
      <div className="flex items-center gap-2 min-w-0">
        <LogoMarkBrand size={markSize} />
        <div
          className="hidden min-h-[2.75rem] w-px shrink-0 self-stretch bg-[#c9a84c] opacity-80 sm:block"
          aria-hidden
        />
        <div className="min-w-0 flex-1 py-0.5">
          <p
            className="truncate text-[1.35rem] leading-[0.95] tracking-[-0.01em] uppercase text-[#18150e]"
            style={{
              fontFamily: "'Barlow Condensed', system-ui, sans-serif",
              fontWeight: 800,
            }}
          >
            Ngày Lành
          </p>
          <p
            className="mt-0.5 truncate pl-0.5 text-[0.7rem] tracking-[0.28em] uppercase text-[#9a7c22]"
            style={{
              fontFamily: "'Barlow Condensed', system-ui, sans-serif",
              fontWeight: 600,
            }}
          >
            Tháng Tốt
          </p>
          <p
            className="mt-1 truncate pl-0.5 text-[9px] tracking-[0.08em] text-[#7a7050]"
            style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 400 }}
          >
            {meta}
          </p>
        </div>
      </div>
    </div>
  );
}
