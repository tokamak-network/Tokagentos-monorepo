/**
 * Operator brand mark — the chosen "key" logo + lockup.
 * Ported from handoff_app/prototype/components/Logo.jsx (MarkKey + KeyLockup).
 */
import { useId } from "react";

const GOLD = "#f0b90b";
const GOLD_HI = "#f3ba2f";
const GOLD_DEEP = "#d8a000";

export function KeyMark({ size = 28 }: { size?: number }) {
  const id = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      style={{ flexShrink: 0, display: "block" }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`key-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={GOLD_HI} />
          <stop offset="100%" stopColor={GOLD_DEEP} />
        </linearGradient>
      </defs>
      <rect
        x="6"
        y="6"
        width="28"
        height="6"
        rx="1.2"
        fill={`url(#key-${id})`}
      />
      <rect
        x="7"
        y="6.5"
        width="26"
        height="1.2"
        fill="rgba(255,255,255,0.42)"
      />
      <rect x="17" y="12" width="6" height="18" fill={`url(#key-${id})`} />
      <rect x="23" y="22" width="5" height="3.2" fill={`url(#key-${id})`} />
      <rect x="23" y="27" width="3.5" height="3.2" fill={`url(#key-${id})`} />
      <rect
        x="17"
        y="30"
        width="6"
        height="3.5"
        rx="0.6"
        fill={`url(#key-${id})`}
      />
    </svg>
  );
}

export function KeyLockup({ size = 20 }: { size?: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: size * 0.5,
        fontFamily: '"DM Sans", system-ui, sans-serif',
        fontWeight: 600,
        fontSize: size,
        letterSpacing: "-0.028em",
        color: "var(--text-strong)",
        lineHeight: 1,
      }}
    >
      <KeyMark size={size * 1.2} />
      <span style={{ display: "inline-flex", alignItems: "baseline" }}>
        <span>tokagent</span>
        <span style={{ color: GOLD }}>OS</span>
      </span>
    </span>
  );
}
