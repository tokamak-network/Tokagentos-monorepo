"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";

const SECTIONS = [
  ["quick start", "#scaffold"],
  ["wallet-native", "#wallet"],
  ["pay your llm", "#llm"],
  ["runtime modes", "#modes"],
  ["billing rail", "#billing"],
] as const;

const EXTERNAL = [
  ["tokagent", "https://tokagent.network"],
  ["x402", "https://x402.org/"],
] as const;

export function MobileNav() {
  const [open, setOpen] = useState(false);

  // Close menu on resize past breakpoint or on outside scroll
  useEffect(() => {
    if (!open) return;
    const onResize = () => {
      if (window.innerWidth >= 768) setOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  // Lock body scroll when menu open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-border border-b bg-page/[0.78] backdrop-blur-md md:hidden">
      <div className="container-page flex h-[60px] items-center justify-between gap-2">
        <Link
          href="/"
          aria-label="tokagentOS — home"
          className="flex min-w-0 flex-1 items-center"
          onClick={() => setOpen(false)}
        >
          <Logo size={22} />
        </Link>
        <Link
          href="https://github.com/tokamak-network/Tokagentos-monorepo"
          target="_blank"
          rel="noreferrer noopener"
          aria-label="GitHub"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border-strong px-2.5 py-1.5 font-mono text-[12px] text-fg"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2c-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.47.11-3.07 0 0 .97-.31 3.18 1.18a11.07 11.07 0 015.79 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.6.23 2.78.11 3.07.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.68.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
          </svg>
          <span>github</span>
          <span aria-hidden="true" className="text-[10px] text-fg-dim">
            ↗
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-menu-sheet"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-strong bg-surface-2/60"
        >
          <span className="relative block h-3 w-3.5">
            <span
              aria-hidden="true"
              className="absolute left-0 h-[1.5px] w-full transition-all duration-200"
              style={{
                top: open ? "5px" : "3px",
                transform: open ? "rotate(45deg)" : "none",
                background: open ? "var(--color-accent)" : "var(--color-fg)",
              }}
            />
            <span
              aria-hidden="true"
              className="absolute left-0 h-[1.5px] w-full transition-all duration-200"
              style={{
                top: open ? "5px" : "8px",
                transform: open ? "rotate(-45deg)" : "none",
                background: open ? "var(--color-accent)" : "var(--color-fg)",
              }}
            />
          </span>
        </button>
      </div>

      {open && (
        <div
          id="mobile-menu-sheet"
          className="m-slide-down absolute inset-x-0 top-full border-border border-b bg-elev/[0.96] backdrop-blur-xl"
        >
          <nav className="container-page pt-2 pb-5">
            {SECTIONS.map(([label, href], i) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="m-fade-up flex items-center justify-between border-border border-b py-3.5 font-mono text-[16px] text-fg lowercase tracking-[-0.01em]"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <span>{label}</span>
                <span aria-hidden="true" className="text-fg-dim">
                  →
                </span>
              </Link>
            ))}
            <div className="mt-4 flex gap-5 pt-2">
              {EXTERNAL.map(([label, href]) => (
                <Link
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-mono text-[12px] text-fg-dim lowercase"
                  onClick={() => setOpen(false)}
                >
                  {label} <span className="text-accent">↗</span>
                </Link>
              ))}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
