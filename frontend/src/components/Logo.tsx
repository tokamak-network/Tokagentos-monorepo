import { useId } from "react";

type Props = {
  size?: number;
  showWordmark?: boolean;
};

/**
 * tokagentOS "Key" mark + wordmark. The mark is a stylized T that doubles
 * as a key (crossbar, stem, two notches, tip) — visual shorthand for
 * "agents that hold their own keys". Inlined SVG so it renders crisp at
 * any size and inherits page styles. Wordmark is rendered as HTML text
 * so it picks up DM Sans from the page.
 *
 * The gradient id is scoped per-instance via useId() — multiple Logos on
 * one page (Nav, MobileNav, Footer, BillingSection) would otherwise share
 * a single `<linearGradient id="logo-key">`, and the first one in DOM
 * order wins `url(#…)` resolution. When that winner lives inside a
 * `display:none` parent (e.g. MobileNav at the desktop breakpoint), every
 * other Logo paints transparent.
 *
 * Source: frontend/tokagentos-key 2/symbols/key.svg (brand kit).
 */
export function Logo({ size = 28, showWordmark = true }: Props) {
  const reactId = useId();
  const gradId = `logo-key-${reactId}`;
  const fill = `url(#${gradId})`;
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg
        viewBox="0 0 40 40"
        width={size}
        height={size}
        aria-hidden={showWordmark ? "true" : undefined}
        role={showWordmark ? undefined : "img"}
        aria-label={showWordmark ? undefined : "tokagentOS"}
        className="shrink-0"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f3ba2f" />
            <stop offset="100%" stopColor="#d8a000" />
          </linearGradient>
        </defs>
        <rect x="6" y="6" width="28" height="6" rx="1.2" fill={fill} />
        <rect
          x="7"
          y="6.5"
          width="26"
          height="1.2"
          fill="rgba(255,255,255,0.42)"
        />
        <rect x="17" y="12" width="6" height="18" fill={fill} />
        <rect x="23" y="22" width="5" height="3.2" fill={fill} />
        <rect x="23" y="27" width="3.5" height="3.2" fill={fill} />
        <rect x="17" y="30" width="6" height="3.5" rx="0.6" fill={fill} />
      </svg>
      {showWordmark && (
        <span className="font-semibold text-[19px] text-fg tracking-tight">
          tokagent<span className="text-accent">OS</span>
        </span>
      )}
    </span>
  );
}
