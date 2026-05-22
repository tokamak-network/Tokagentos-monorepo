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
    t: "WALLET",
    side: "evm",
    msg: "balance check · mainnet · 0.42 ETH",
    tone: "gold",
  },
  {
    t: "LLM",
    side: "anthropic",
    msg: "claude-sonnet-4-5 · 412 tok in",
    tone: "mute",
  },
  {
    t: "x402",
    side: "EIP-3009",
    msg: "sign authorization · 0.014 PTON",
    tone: "ok",
  },
  {
    t: "AGENT",
    side: "op:steward",
    msg: '"top up Aave if health < 1.6"',
    tone: "mute",
  },
  {
    t: "CHAIN",
    side: "polygon",
    msg: "supply 800 USDC → aPolUSDC",
    tone: "gold",
  },
  {
    t: "VAULT",
    side: "PTON",
    msg: "allowlisted tx settled · ec71…2a8b",
    tone: "ok",
  },
  {
    t: "LLM",
    side: "anthropic",
    msg: "stream complete · 612 tok out",
    tone: "mute",
  },
  {
    t: "WALLET",
    side: "evm",
    msg: "sign EIP-712 · session jwt mint",
    tone: "gold",
  },
  {
    t: "x402",
    side: "gateway",
    msg: "settle 0.214 PTON · job ec71…",
    tone: "ok",
  },
  {
    t: "AGENT",
    side: "tick",
    msg: "loop 4,219 · 12ms · ok",
    tone: "mute",
  },
  {
    t: "CHAIN",
    side: "mainnet",
    msg: "consumeCredits batch · 0.65 PTON",
    tone: "ok",
  },
];

const MAX_LINES = 6;
const TICK_MS = 1200;

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
      {/* Title bar — collapses to a compact view on mobile */}
      <div className="flex items-center justify-between gap-3 border-border border-b bg-surface px-3 py-3 md:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full bg-[#ff5f56]"
          />
          <span
            aria-hidden="true"
            className="hidden h-2 w-2 shrink-0 rounded-full bg-[#ffbd2e] sm:inline-block"
          />
          <span
            aria-hidden="true"
            className="hidden h-2 w-2 shrink-0 rounded-full bg-[#27c93f] sm:inline-block"
          />
          {/* Short title on mobile, full path on desktop */}
          <span className="ml-2 truncate font-mono text-[11px] text-fg-dim md:ml-3">
            <span className="sm:hidden">steward · daemon</span>
            <span className="hidden sm:inline">
              ~/agents/steward · daemon mode · streaming /v1/messages
            </span>
          </span>
        </div>
        <div className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-live md:gap-2">
          <span aria-hidden="true" className="live-dot" />
          live
        </div>
      </div>

      <div className="bg-surface-2 p-3 font-mono text-[11.5px] leading-relaxed sm:p-5 sm:text-[12.5px]">
        <div className="min-h-[16rem] space-y-1.5 sm:min-h-[18rem]">
          {lines.map((l, idx) => (
            <div
              key={l.id}
              className="grid grid-cols-[auto_1fr] items-baseline gap-x-2 transition-opacity duration-300 sm:flex sm:flex-wrap sm:gap-x-3"
              style={{
                opacity: 0.2 + (idx / Math.max(lines.length, 1)) * 0.8,
              }}
            >
              {/* Mobile: tag + side on first row (inline), msg on second row */}
              <span
                className={`inline-block min-w-[3rem] rounded border border-border px-1.5 py-px text-center text-[9.5px] tracking-[0.06em] sm:min-w-[3.4rem] sm:text-[10px] ${toneClass(
                  l.tone,
                )}`}
              >
                {l.t}
              </span>
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 sm:contents">
                {/* Timestamp hidden on mobile to save horizontal real estate */}
                <span className="hidden text-fg-faint sm:inline">{l.time}</span>
                <span className="text-fg-dim">{l.side}</span>
                <span className="min-w-0 break-words text-fg">{l.msg}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
