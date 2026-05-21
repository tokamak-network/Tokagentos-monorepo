"use client";

import { useEffect, useRef, useState } from "react";

type Tone = "gold" | "ok" | "mute";
type LogTemplate = {
  t: string;
  side: string;
  msg: string;
  tone: Tone;
};

const TEMPLATE: LogTemplate[] = [
  {
    t: "PERPS",
    side: "HL",
    msg: "open BTC-PERP × 3.2 @ 67,481.50",
    tone: "gold",
  },
  {
    t: "YIELD",
    side: "AAVE",
    msg: "supply 12,400 USDC → aPolUSDC",
    tone: "ok",
  },
  {
    t: "STRAT",
    side: "engine",
    msg: "rebalance triggered · drift 0.42%",
    tone: "mute",
  },
  {
    t: "POLY",
    side: "gamma",
    msg: "BUY YES 4,200 · Fed cut Nov ≥ 25bps @ 0.71",
    tone: "gold",
  },
  {
    t: "VAULT",
    side: "PTON",
    msg: "settle 0.214 PTON · job ec71…2a8b",
    tone: "ok",
  },
  {
    t: "PERPS",
    side: "HL",
    msg: "close ETH-PERP +0.83% · pnl +312.40",
    tone: "ok",
  },
  {
    t: "AGENT",
    side: "op:steward",
    msg: '"drawdown -1.8% — pausing perps for 6h"',
    tone: "mute",
  },
  { t: "STRAT", side: "engine", msg: "tick 4,219 · 12ms · ok", tone: "mute" },
  {
    t: "YIELD",
    side: "AAVE",
    msg: "withdraw 800 USDC · health 1.84",
    tone: "gold",
  },
  {
    t: "VAULT",
    side: "PTON",
    msg: "topup 50 USDC → 49.92 TON → 49.86 PTON",
    tone: "ok",
  },
  {
    t: "POLY",
    side: "gamma",
    msg: "redeem winning shares · 1,840 USDC",
    tone: "ok",
  },
  {
    t: "PERPS",
    side: "HL",
    msg: "funding accrual -0.0091% · BTC long",
    tone: "mute",
  },
];

const MAX_LINES = 9;
const TICK_MS = 1100;

type Line = LogTemplate & { time: string; id: number };

function ts() {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(
    d.getMilliseconds(),
    3,
  )}`;
}

function toneClass(tone: Tone) {
  switch (tone) {
    case "gold":
      return "text-accent";
    case "ok":
      return "text-live";
    case "mute":
      return "text-fg-dim";
  }
}

export function AgentTicker() {
  const [lines, setLines] = useState<Line[]>([]);
  const idRef = useRef(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (reduced) {
      // Render a static block of 6 lines with epoch-shaped timestamps.
      setLines(
        TEMPLATE.slice(0, 6).map((t, i) => ({
          ...t,
          time: ts(),
          id: i,
        })),
      );
      return;
    }
    let i = 0;
    const push = () => {
      const tmpl = TEMPLATE[i % TEMPLATE.length];
      setLines((prev) => {
        const next = [...prev, { ...tmpl, time: ts(), id: idRef.current++ }];
        return next.slice(-MAX_LINES);
      });
      i++;
    };
    push();
    const id = window.setInterval(push, TICK_MS);
    return () => window.clearInterval(id);
  }, [reduced]);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between border-border border-b bg-surface px-4 py-3">
        <div className="flex items-center gap-2">
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
            ~/agents/steward · daemon mode · streaming /v1/messages
          </span>
        </div>
        <div className="inline-flex items-center gap-2 font-mono text-[11px] text-live">
          <span aria-hidden="true" className="live-dot" />
          live
        </div>
      </div>
      <div className="bg-surface-2 p-5 font-mono text-[12.5px] leading-relaxed">
        <div className="min-h-[18rem] space-y-1.5">
          {lines.map((l, idx) => (
            <div
              key={l.id}
              className="flex flex-wrap items-baseline gap-x-3 transition-opacity duration-300"
              style={{ opacity: 0.2 + (idx / Math.max(lines.length, 1)) * 0.8 }}
            >
              <span className="text-fg-faint">{l.time}</span>
              <span
                className={`inline-block min-w-[3.4rem] rounded border border-border px-1.5 py-px text-center text-[10px] tracking-[0.06em] ${toneClass(
                  l.tone,
                )}`}
              >
                {l.t}
              </span>
              <span className="text-fg-dim">{l.side}</span>
              <span className="text-fg">{l.msg}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
