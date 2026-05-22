import { useId } from "react";

type Props = { size?: number };

/**
 * Compact plasma-ring symbol used inside agent-stage scenes (chat avatar,
 * x402 agent node). Same visual language as the global Logo's symbol but
 * scoped to the hero so id collisions are avoided.
 */
export function PlasmaRing({ size = 20 }: Props) {
  const id = useId();
  const glowId = `pr-glow-${id}`;
  const strokeId = `pr-stroke-${id}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
      style={{ flexShrink: 0, display: "block" }}
    >
      <defs>
        <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f3ba2f" stopOpacity="0.85" />
          <stop offset="55%" stopColor="#f0b90b" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#f0b90b" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={strokeId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f3ba2f" />
          <stop offset="100%" stopColor="#d8a000" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="18" fill={`url(#${glowId})`} />
      <circle
        cx="20"
        cy="20"
        r="14"
        fill="none"
        stroke={`url(#${strokeId})`}
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
  );
}
