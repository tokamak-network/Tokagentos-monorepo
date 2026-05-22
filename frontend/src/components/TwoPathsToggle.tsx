"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Highlighted } from "@/lib/highlight";

export type Panel = {
  id: string;
  label: string;
  title: string;
  body: string;
  code: string;
  footnote?: { text: string; href?: string };
};

type Props = {
  panels: [Panel, Panel];
  autoAdvanceMs?: number;
  defaultActive?: 0 | 1;
};

export function TwoPathsToggle({
  panels,
  autoAdvanceMs = 6000,
  defaultActive = 0,
}: Props) {
  const [active, setActive] = useState<0 | 1>(defaultActive);
  const [autoOn, setAutoOn] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [reduced, setReduced] = useState(false);
  const announcerRef = useRef<HTMLSpanElement | null>(null);
  const baseId = useId();

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (!autoOn || hovered || reduced || autoAdvanceMs <= 0) return;
    const id = window.setInterval(() => {
      setActive((a) => ((a + 1) % 2) as 0 | 1);
    }, autoAdvanceMs);
    return () => window.clearInterval(id);
  }, [autoOn, hovered, reduced, autoAdvanceMs]);

  const switchTo = useCallback(
    (i: 0 | 1, manual: boolean) => {
      if (active === i) return;
      setActive(i);
      if (manual) {
        setAutoOn(false);
        if (announcerRef.current) {
          announcerRef.current.textContent = `Showing ${panels[i].label} path`;
        }
      }
    },
    [active, panels],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next = (e.key === "ArrowRight" ? active + 1 : active - 1 + 2) % 2;
      switchTo(next as 0 | 1, true);
    }
  };

  return (
    <section
      aria-labelledby={`${baseId}-title`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <span id={`${baseId}-title`} className="sr-only">
        LLM payment path comparison
      </span>

      {/* Mobile: full-width A/B chip buttons per spec */}
      <div
        role="tablist"
        aria-label="Choose an LLM payment path"
        className="flex gap-2 md:hidden"
      >
        {panels.map((p, i) => {
          const selected = i === active;
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${p.id}`}
              id={`${baseId}-tab-${p.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => switchTo(i as 0 | 1, true)}
              onKeyDown={onKeyDown}
              className={`flex flex-1 items-center gap-2 rounded-[10px] border px-3.5 py-3 text-left font-medium text-[12.5px] transition-colors ${
                selected
                  ? "border-accent/[0.42] bg-gradient-to-b from-accent/[0.08] to-elev/[0.8] text-fg shadow-[0_0_0_1px_rgba(240,185,11,0.12)]"
                  : "border-border bg-elev/[0.7] text-fg-muted"
              }`}
            >
              <span
                aria-hidden="true"
                className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-[5px] border border-accent/[0.28] bg-accent/[0.12] font-mono text-[11px] text-accent"
              >
                {String.fromCharCode(65 + i)}
              </span>
              <span className="lowercase">
                {p.label.replace(/^(BYO API KEY|x402 WALLET)$/, (m) =>
                  m === "BYO API KEY" ? "BYO API key" : "x402 wallet",
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Desktop: segmented pill with sliding indicator */}
      <div className="hidden justify-center md:flex">
        <div
          role="tablist"
          aria-label="Choose an LLM payment path"
          className="relative inline-flex items-center rounded-full border border-border bg-surface p-1"
        >
          <span
            aria-hidden="true"
            className="absolute top-1 bottom-1 left-1 rounded-full bg-fg transition-transform duration-200"
            style={{
              width: "calc(50% - 0.25rem)",
              transform: `translateX(${active === 0 ? "0%" : "100%"})`,
              transitionTimingFunction: "var(--ease-out)",
            }}
          />
          {panels.map((p, i) => {
            const selected = i === active;
            return (
              <button
                key={`d-${p.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`${baseId}-panel-${p.id}-d`}
                id={`${baseId}-tab-${p.id}-d`}
                tabIndex={selected ? 0 : -1}
                onClick={() => switchTo(i as 0 | 1, true)}
                onKeyDown={onKeyDown}
                className={`relative z-10 px-5 py-2 font-mono text-[12px] tracking-[0.08em] transition-colors ${
                  selected ? "text-page" : "text-fg-muted"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-10 grid">
        {panels.map((p, i) => {
          const selected = i === active;
          return (
            <div
              key={p.id}
              role="tabpanel"
              id={`${baseId}-panel-${p.id}`}
              aria-labelledby={`${baseId}-tab-${p.id}`}
              aria-hidden={!selected}
              className="col-start-1 row-start-1 transition-opacity duration-300"
              style={{
                opacity: selected ? 1 : 0,
                pointerEvents: selected ? "auto" : "none",
                transitionTimingFunction: "var(--ease-in-out)",
              }}
            >
              <div className="grid items-start gap-8 md:grid-cols-2">
                <figure className="overflow-hidden rounded-xl border border-border bg-surface">
                  <div className="flex items-center gap-2 border-border border-b px-4 py-2.5">
                    <span
                      aria-hidden="true"
                      className="inline-block h-2 w-2 rounded-full bg-accent"
                    />
                    <span className="font-mono text-[11px] text-fg-dim">
                      agent.config.ts
                    </span>
                  </div>
                  <pre className="overflow-x-auto bg-surface-2 p-5 font-mono text-[13px] leading-relaxed">
                    <code>
                      <Highlighted code={p.code} />
                    </code>
                  </pre>
                </figure>
                <div>
                  <h3 className="h2-text text-fg">{p.title}</h3>
                  <p className="mt-4 text-base text-fg-muted leading-relaxed">
                    {p.body}
                  </p>
                  {p.footnote && (
                    <p className="mt-6 font-mono text-[11px] text-fg-dim tracking-wide">
                      {p.footnote.href ? (
                        <a
                          href={p.footnote.href}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="hover:text-accent"
                        >
                          {p.footnote.text}
                        </a>
                      ) : (
                        p.footnote.text
                      )}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <span
        ref={announcerRef}
        aria-live="polite"
        className="sr-only"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
        }}
      />
    </section>
  );
}
