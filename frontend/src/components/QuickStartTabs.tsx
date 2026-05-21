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
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div
        role="tablist"
        aria-label="Package manager"
        id={tablistId}
        className="flex border-border border-b"
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
              className={`relative px-5 py-3 font-mono text-[13px] tracking-wide transition-colors ${
                selected ? "text-fg" : "text-fg-muted hover:text-fg"
              }`}
            >
              {tab.label}
              {selected && (
                <span
                  aria-hidden="true"
                  className="-bottom-px absolute inset-x-0 h-[2px] bg-accent"
                />
              )}
            </button>
          );
        })}
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
            className="bg-surface-2 px-5 py-5 font-mono text-[13.5px]"
          >
            <ul className="space-y-2.5">
              {tab.lines.map((line) => (
                <li
                  key={line}
                  className="group flex items-center justify-between gap-4"
                >
                  <span className="text-fg">
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
  );
}
