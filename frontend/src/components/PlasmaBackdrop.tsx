/**
 * Decorative plasma-ring backdrop for the hero.
 * Concentric containment rings + gradient glow + animated core dot.
 * Hidden below md — at 900x900 it overflows narrow viewports and
 * adds visual noise that competes with the hero copy on phones.
 */
export function PlasmaBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -top-32 -right-44 hidden h-[900px] w-[900px] opacity-80 md:block"
    >
      <svg
        viewBox="0 0 900 900"
        width="100%"
        height="100%"
        aria-hidden="true"
        role="presentation"
      >
        <defs>
          <radialGradient id="hero-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f3ba2f" stopOpacity="0.36" />
            <stop offset="40%" stopColor="#f0b90b" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#f0b90b" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ring-stroke" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f3ba2f" stopOpacity="0.9" />
            <stop offset="50%" stopColor="#f0b90b" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#d8a000" stopOpacity="0" />
          </linearGradient>
        </defs>
        <circle cx="450" cy="450" r="420" fill="url(#hero-glow)" />
        {[420, 360, 300, 240, 180, 120].map((r, i) => (
          <circle
            key={r}
            cx="450"
            cy="450"
            r={r}
            fill="none"
            stroke="url(#ring-stroke)"
            strokeWidth={i === 0 ? 1.4 : 0.8}
            opacity={1 - i * 0.13}
          />
        ))}
        <ellipse
          cx="450"
          cy="450"
          rx="280"
          ry="90"
          fill="none"
          stroke="#f3ba2f"
          strokeWidth="1"
          opacity="0.55"
        />
        <ellipse
          cx="450"
          cy="450"
          rx="220"
          ry="60"
          fill="none"
          stroke="#f3ba2f"
          strokeWidth="1"
          opacity="0.4"
          transform="rotate(-12 450 450)"
        />
        <ellipse
          cx="450"
          cy="450"
          rx="160"
          ry="36"
          fill="none"
          stroke="#f3ba2f"
          strokeWidth="1"
          opacity="0.3"
          transform="rotate(18 450 450)"
        />
        <circle cx="450" cy="450" r="8" fill="#f3ba2f">
          <animate
            attributeName="r"
            values="6;10;6"
            dur="3.4s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.7;1;0.7"
            dur="3.4s"
            repeatCount="indefinite"
          />
        </circle>
      </svg>
      {/* Mobile substitute: a single subtle radial gradient driven by CSS
          (much lighter than the 900px SVG). Lives above for visibility but
          we keep the SVG above this for desktop. Below md only the gradient
          shows because the SVG is display:none. */}
    </div>
  );
}

/**
 * Lightweight CSS-only glow for small viewports — replaces the 900px SVG
 * backdrop with a single radial gradient that respects the hero's box.
 */
export function PlasmaBackdropMobile() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 md:hidden"
      style={{
        background:
          "radial-gradient(ellipse 90% 60% at 80% 0%, rgba(240,185,11,0.10), transparent 70%)",
      }}
    />
  );
}
