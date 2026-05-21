type Props = {
  size?: number;
  showWordmark?: boolean;
};

/**
 * Plasma ring symbol + wordmark. Inlined SVG so the symbol renders crisp
 * at any size and inherits page styles. Wordmark is rendered as HTML text
 * so it picks up DM Sans from the page.
 */
export function Logo({ size = 28, showWordmark = true }: Props) {
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
          <radialGradient id="logo-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f3ba2f" stopOpacity="0.85" />
            <stop offset="55%" stopColor="#f0b90b" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#f0b90b" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="logo-stroke" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f3ba2f" />
            <stop offset="100%" stopColor="#d8a000" />
          </linearGradient>
        </defs>
        <circle cx="20" cy="20" r="18" fill="url(#logo-glow)" />
        <circle
          cx="20"
          cy="20"
          r="14"
          fill="none"
          stroke="url(#logo-stroke)"
          strokeWidth="1.4"
        />
        <ellipse
          cx="20"
          cy="20"
          rx="9"
          ry="3.6"
          fill="none"
          stroke="#f0b90b"
          strokeWidth="1.2"
          opacity="0.95"
        />
        <circle cx="20" cy="20" r="1.8" fill="#f3ba2f" />
        <circle
          cx="20"
          cy="20"
          r="3.4"
          fill="none"
          stroke="#f0b90b"
          strokeWidth="0.6"
          opacity="0.45"
        />
      </svg>
      {showWordmark && (
        <span className="font-semibold text-[19px] text-fg tracking-tight">
          tokagent<span className="text-accent">OS</span>
        </span>
      )}
    </span>
  );
}
