import { useId } from "react";

export interface LogoProps {
  /** Pixel size of the square key mark. */
  size?: number;
  /** Render the "tokagentOS" wordmark next to the mark. */
  showWordmark?: boolean;
  /** Extra classes on the root span (layout/visibility control). */
  className?: string;
  /** Extra classes on the wordmark text (e.g. responsive hiding). */
  wordmarkClassName?: string;
}

/**
 * tokagentOS "Key" mark + wordmark — the canonical brand lockup used on
 * www.tokagentos.com. The mark is a stylized T that doubles as a key
 * (crossbar, stem, two notches, tip): visual shorthand for "agents that
 * hold their own keys". Inlined SVG so it stays crisp at any size and
 * inherits page styles. The wordmark is HTML text so it picks up the
 * app's DM Sans body font.
 *
 * The gradient id is scoped per-instance via useId() — multiple Logos on
 * one page (header + companion overlay) would otherwise share a single
 * `<linearGradient id>` and the first in DOM order wins `url(#…)`
 * resolution, painting the others transparent.
 */
export function Logo({
  size = 24,
  showWordmark = true,
  className,
  wordmarkClassName,
}: LogoProps) {
  const reactId = useId();
  const gradId = `logo-key-${reactId}`;
  const fill = `url(#${gradId})`;
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <svg
        viewBox="0 0 40 40"
        width={size}
        height={size}
        role="img"
        aria-label="tokagentOS"
        className="shrink-0"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f3ba2f" />
            <stop offset="100%" stopColor="#d8a000" />
          </linearGradient>
        </defs>
        <rect x="6" y="6" width="28" height="6" rx="1.2" fill={fill} />
        <rect x="7" y="6.5" width="26" height="1.2" fill="rgba(255,255,255,0.42)" />
        <rect x="17" y="12" width="6" height="18" fill={fill} />
        <rect x="23" y="22" width="5" height="3.2" fill={fill} />
        <rect x="23" y="27" width="3.5" height="3.2" fill={fill} />
        <rect x="17" y="30" width="6" height="3.5" rx="0.6" fill={fill} />
      </svg>
      {showWordmark && (
        <span
          aria-hidden="true"
          className={`font-semibold text-[19px] leading-none tracking-tight text-txt-strong ${
            wordmarkClassName ?? ""
          }`}
        >
          tokagent<span className="text-accent">OS</span>
        </span>
      )}
    </span>
  );
}
