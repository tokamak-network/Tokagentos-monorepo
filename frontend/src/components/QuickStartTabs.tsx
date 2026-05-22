"use client";

import { useCallback, useId, useRef, useState } from "react";
import { CopyButton } from "./CopyButton";

type Tab = {
  id: string;
  label: string;
  lines: string[];
};

type Props = {
  tabs: Tab[];
  defaultTab: string;
};

export function QuickStartTabs({ tabs, defaultTab }: Props) {
  const [active, setActive] = useState(defaultTab);
  const tablistId = useId();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      const idx = tabs.findIndex((t) => t.id === active);
      let next = idx;
      if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
      else if (e.key === "ArrowLeft")
        next = (idx - 1 + tabs.length) % tabs.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = tabs.length - 1;
      else return;
      e.preventDefault();
      const nextId = tabs[next].id;
      setActive(nextId);
      tabRefs.current[nextId]?.focus();
    },
    [active, tabs],
  );

  return (
    <div>
      {/* Segmented pill capsule above the panel — matches mobile spec exactly,
          stays subtle on desktop where the eyebrow + header carry the section. */}
      <div
        role="tablist"
        aria-label="Package manager"
        id={tablistId}
        className="mb-3 inline-flex gap-1 rounded-lg border border-border bg-elev p-[3px]"
      >
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[tab.id] = el;
              }}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${tablistId}-panel-${tab.id}`}
              id={`${tablistId}-tab-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(tab.id)}
              onKeyDown={onKeyDown}
              className={`rounded-md px-3 py-1.5 font-mono text-[12px] lowercase transition-colors ${
                selected
                  ? "bg-accent/[0.12] text-accent-hi"
                  : "text-fg-dim hover:text-fg"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex items-center gap-2 border-border border-b bg-elev px-3 py-2.5 sm:px-4">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full bg-[#ff5f56]"
          />
          <span
            aria-hidden="true"
            className="hidden h-2 w-2 rounded-full bg-[#ffbd2e] sm:inline-block"
          />
          <span
            aria-hidden="true"
            className="hidden h-2 w-2 rounded-full bg-[#27c93f] sm:inline-block"
          />
          <span className="ml-auto font-mono text-[10px] text-fg-dim">
            ~/projects · zsh
          </span>
        </div>

        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <div
              key={tab.id}
              role="tabpanel"
              id={`${tablistId}-panel-${tab.id}`}
              aria-labelledby={`${tablistId}-tab-${tab.id}`}
              hidden={!selected}
              className="bg-surface-2 px-4 py-4 font-mono text-[12.5px] sm:px-5 sm:py-5 sm:text-[13.5px]"
            >
              <ul className="space-y-2.5">
                {tab.lines.map((line) => (
                  <li
                    key={line}
                    className="group flex items-center justify-between gap-3 sm:gap-4"
                  >
                    <span className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-fg">
                      <span className="select-none text-fg-dim">$ </span>
                      {line}
                    </span>
                    <CopyButton value={line} label={`Copy command: ${line}`} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
