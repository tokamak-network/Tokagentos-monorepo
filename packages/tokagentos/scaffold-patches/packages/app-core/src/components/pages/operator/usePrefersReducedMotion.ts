/**
 * Tracks the user's `prefers-reduced-motion: reduce` setting.
 *
 * CSS animations are already neutralised globally by the app's
 * `@media (prefers-reduced-motion: reduce)` rule, but JS-driven motion
 * (the A2A edge-activation interval, the settlement-feed auto-prepend, node
 * pulses) must be gated in code. Operator components read this hook to freeze
 * those timers and render a static seeded state instead.
 */
import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    setReduced(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
