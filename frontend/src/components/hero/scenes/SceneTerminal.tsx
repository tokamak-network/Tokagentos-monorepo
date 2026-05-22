"use client";

import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";

type Tone = "gold" | "ok" | "mute";
type LogTemplate = { t: string; side: string; msg: string; tone: Tone };
type LogLine = LogTemplate & { time: string; id: number };

const TEMPL: LogTemplate[] = [
  {
    t: "WALLET",
    side: "mainnet",
    msg: "balance · 0.4218 ETH · 14,029 USDC",
    tone: "gold",
  },
  {
    t: "LLM",
    side: "sonnet-4-5",
    msg: "stream open · 412 tok in",
    tone: "mute",
  },
  {
    t: "AGENT",
    side: "steward",
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
    msg: "allowlist ok · tx ec71…2a8b",
    tone: "ok",
  },
  {
    t: "LLM",
    side: "sonnet-4-5",
    msg: "stream close · 612 tok out",
    tone: "mute",
  },
  { t: "x402", side: "gateway", msg: "settle 0.0142 PTON", tone: "ok" },
];

const TICK_MS = 850;
const BUFFER = 7;

function fmtTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function SceneTerminal() {
  const reduced = usePrefersReducedMotion();
  const [lines, setLines] = useState<LogLine[]>([]);
  const idRef = useRef(0);

  useEffect(() => {
    // Seed deterministically via real `new Date()` only on the client to
    // avoid an SSR/CSR mismatch on the timestamp column.
    let i = 0;
    const push = () => {
      const tmpl = TEMPL[i % TEMPL.length];
      const time = fmtTime(new Date());
      setLines((prev) =>
        [...prev, { ...tmpl, time, id: idRef.current++ }].slice(-BUFFER),
      );
      i++;
    };

    if (reduced) {
      // Render a single full snapshot — no rolling tick.
      for (let k = 0; k < BUFFER; k++) push();
      return;
    }

    push();
    const id = window.setInterval(push, TICK_MS);
    return () => window.clearInterval(id);
  }, [reduced]);

  return (
    <div className="sc-term">
      <div className="sc-term-head">
        <span className="sc-term-dot r" />
        <span className="sc-term-dot y" />
        <span className="sc-term-dot g" />
        <span className="sc-term-path">~/agents/steward · daemon</span>
      </div>
      <div className="sc-term-body">
        {lines.map((l, i) => (
          <div
            key={l.id}
            className="sc-log"
            style={{ opacity: 0.3 + (i / Math.max(lines.length, 1)) * 0.7 }}
          >
            <span className="sc-log-t">{l.time}</span>
            <span className={`sc-log-tag log-${l.tone}`}>{l.t}</span>
            <span className="sc-log-side">{l.side}</span>
            <span className="sc-log-msg">{l.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
