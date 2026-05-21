"use client";

import { useEffect, useState } from "react";

const STEPS = [
  {
    cmd: "bunx @tokagent/tokagentos@latest",
    out: "tokagentOS · scaffolding new project…",
  },
  { cmd: "? Project name › steward", out: "✓ Created ./steward/" },
  {
    cmd: "? Template › fullstack-app",
    out: "✓ Wired @tokagentos/* and plugin set",
  },
  {
    cmd: "cd steward && bun install && bun run dev",
    out: "UI → http://localhost:2138 · API → :31337",
  },
] as const;

const STEP_MS = 1900;

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

export function CLIWalkthrough() {
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (reduced) {
      setStep(STEPS.length);
      return;
    }
    const id = window.setInterval(
      () => setStep((s) => (s + 1) % (STEPS.length + 1)),
      STEP_MS,
    );
    return () => window.clearInterval(id);
  }, [reduced]);

  const completed = step === STEPS.length;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex items-center gap-2 border-border border-b bg-surface px-4 py-3">
        <span
          aria-hidden="true"
          className="h-2 w-2 rounded-full bg-[#ff5f56]"
        />
        <span
          aria-hidden="true"
          className="h-2 w-2 rounded-full bg-[#ffbd2e]"
        />
        <span
          aria-hidden="true"
          className="h-2 w-2 rounded-full bg-[#27c93f]"
        />
        <span className="ml-3 font-mono text-[11px] text-fg-dim">
          ~/projects · zsh
        </span>
      </div>
      <div className="space-y-3 bg-surface-2 p-5 font-mono text-[13.5px] leading-relaxed">
        {STEPS.slice(0, step + (completed ? 0 : 1)).map((s, i) => (
          <div key={s.cmd}>
            <div className="flex flex-wrap gap-x-2">
              <span className="text-fg-dim">$</span>
              <span className="text-fg">{s.cmd}</span>
            </div>
            {(i < step || completed) && (
              <div className="ml-3 text-fg-muted">{s.out}</div>
            )}
          </div>
        ))}
        {completed && (
          <div className="flex items-center gap-2 pt-2 text-accent">
            <span aria-hidden="true" className="live-dot" />
            <span>Agent loop running. Open the UI to chat. ▍</span>
          </div>
        )}
        {!completed && (
          <div className="flex items-center gap-2">
            <span className="text-fg-dim">$</span>
            <span aria-hidden="true" className="term-cursor" />
          </div>
        )}
      </div>
    </div>
  );
}
