"use client";

import { useState } from "react";

type ModeKey = "vault" | "direct" | "both";

type ModeDef = {
  name: ModeKey;
  display: string;
  tag: string;
  best: string;
  desc: string;
  env: string;
};

const MODES: Record<ModeKey, ModeDef> = {
  vault: {
    name: "vault",
    display: "vault",
    tag: "production",
    best: "Capital under management. Audited custody.",
    desc: "Every on-chain call routes through a deployed ClaudeVault contract — per-method allowlists enforced at the chain level. The operator hot key cannot drain funds even if the LLM is compromised.",
    env: "TOKAGENT_EXECUTION_MODE=vault",
  },
  direct: {
    name: "direct",
    display: "direct",
    tag: "dev / demo",
    best: "Development, demos, full chat-driven control.",
    desc: "Operator wallet signs transactions directly via @elizaos/plugin-evm. Chat can drive arbitrary swaps and transfers. Loads plugin-evm; the vault plugins are not active in this mode.",
    env: "TOKAGENT_EXECUTION_MODE=direct",
  },
  both: {
    name: "both",
    display: "both",
    tag: "advanced",
    best: "Fine-grained control. Reduced safety guarantees.",
    desc: "Both code paths loaded; the LLM picks per request. Use only when you understand both modes and need to mix allowlisted execution with raw signing.",
    env: "TOKAGENT_EXECUTION_MODE=both",
  },
};

const GOLD = "#f0b90b";
const STEEL = "#8a8a94";
const LINE = "rgba(138, 138, 148, 0.4)";

function Arrow({
  x1,
  y1,
  x2,
  y2,
  label,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label?: string;
}) {
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={LINE} strokeWidth={1} />
      <polygon
        points={`${x2 - 5},${y2 - 3} ${x2},${y2} ${x2 - 5},${y2 + 3}`}
        fill={STEEL}
      />
      {label && (
        <text
          x={(x1 + x2) / 2}
          y={(y1 + y2) / 2 - 8}
          textAnchor="middle"
          fontFamily="JetBrains Mono"
          fontSize={9}
          fill={STEEL}
        >
          {label}
        </text>
      )}
    </g>
  );
}

function Node({
  x,
  y,
  label,
  type,
  sublabel,
}: {
  x: number;
  y: number;
  label: string;
  type: "agent" | "wallet" | "vault" | "chain" | "ui";
  sublabel?: string;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect
        x={-58}
        y={-22}
        width={116}
        height={44}
        rx={8}
        fill={
          type === "agent" ? "rgba(240, 185, 11, 0.1)" : "rgba(35, 35, 41, 0.7)"
        }
        stroke={
          type === "agent" || type === "vault"
            ? GOLD
            : "rgba(138, 138, 148, 0.34)"
        }
        strokeWidth={type === "vault" ? 1.4 : 1}
      />
      <text
        x={0}
        y={-2}
        textAnchor="middle"
        fontFamily="DM Sans"
        fontSize={13}
        fontWeight={500}
        fill={type === "agent" ? GOLD : "#eaecef"}
      >
        {label}
      </text>
      {sublabel && (
        <text
          x={0}
          y={14}
          textAnchor="middle"
          fontFamily="JetBrains Mono"
          fontSize={9}
          fill={STEEL}
        >
          {sublabel}
        </text>
      )}
    </g>
  );
}

function ModeDiagram({ mode }: { mode: ModeKey }) {
  return (
    <svg
      viewBox="0 0 720 280"
      width="100%"
      height={280}
      aria-label={`Diagram of ${mode} execution mode`}
    >
      <defs>
        <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <path
            d="M 24 0 L 0 0 0 24"
            fill="none"
            stroke="rgba(138,138,148,0.06)"
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect width={720} height={280} fill="url(#grid)" />

      {mode === "direct" && (
        <>
          <Node
            x={110}
            y={140}
            label="agent"
            type="agent"
            sublabel="StrategyRunner"
          />
          <Arrow x1={168} y1={140} x2={322} y2={140} label="sign" />
          <Node
            x={380}
            y={140}
            label="hot wallet"
            type="wallet"
            sublabel="0xA9c1…"
          />
          <Arrow x1={438} y1={140} x2={552} y2={140} label="tx" />
          <Node
            x={610}
            y={140}
            label="chain"
            type="chain"
            sublabel="ethereum"
          />
        </>
      )}

      {mode === "vault" && (
        <>
          <Node
            x={110}
            y={80}
            label="react ui"
            type="ui"
            sublabel="localhost:2138"
          />
          <Node
            x={110}
            y={200}
            label="agent"
            type="agent"
            sublabel="StrategyRunner"
          />
          <Arrow x1={168} y1={80} x2={322} y2={110} label="msg" />
          <Arrow x1={168} y1={200} x2={322} y2={170} label="intent" />
          <Node
            x={380}
            y={140}
            label="ClaudeVault"
            type="vault"
            sublabel="0x0913…4F5c"
          />
          <Arrow x1={438} y1={140} x2={552} y2={140} label="allowlisted tx" />
          <Node
            x={610}
            y={140}
            label="chain"
            type="chain"
            sublabel="ethereum"
          />
          <ellipse
            cx={380}
            cy={140}
            rx={84}
            ry={36}
            fill="none"
            stroke="rgba(240,185,11,0.32)"
            strokeWidth={1}
            strokeDasharray="2 4"
          />
          <text
            x={380}
            y={196}
            textAnchor="middle"
            fontFamily="JetBrains Mono"
            fontSize={9}
            fill="rgba(240,185,11,0.78)"
          >
            EIP-3009 · allowlist
          </text>
        </>
      )}

      {mode === "both" && (
        <>
          <Node
            x={110}
            y={80}
            label="agent"
            type="agent"
            sublabel="picks per call"
          />
          <Node
            x={110}
            y={200}
            label="agent"
            type="agent"
            sublabel="picks per call"
          />
          <Arrow x1={168} y1={80} x2={322} y2={80} label="raw" />
          <Arrow x1={168} y1={200} x2={322} y2={200} label="intent" />
          <Node
            x={380}
            y={80}
            label="hot wallet"
            type="wallet"
            sublabel="0xA9c1…"
          />
          <Node
            x={380}
            y={200}
            label="ClaudeVault"
            type="vault"
            sublabel="0x0913…4F5c"
          />
          <Arrow x1={438} y1={80} x2={552} y2={120} label="tx" />
          <Arrow x1={438} y1={200} x2={552} y2={160} label="tx" />
          <Node
            x={610}
            y={140}
            label="chain"
            type="chain"
            sublabel="ethereum"
          />
        </>
      )}
    </svg>
  );
}

export function ModesSection() {
  const [active, setActive] = useState<ModeKey>("vault");
  const m = MODES[active];

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[320px_1fr] lg:gap-12">
      {/* Picker — 3-up grid on mobile (per spec), vertical stack on lg+ */}
      <div
        className="grid grid-cols-3 gap-2 lg:flex lg:flex-col lg:gap-2.5"
        role="tablist"
        aria-label="Runtime modes"
      >
        {(Object.keys(MODES) as ModeKey[]).map((k) => {
          const v = MODES[k];
          const isActive = active === k;
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(k)}
              className={`flex flex-col items-start gap-1 rounded-[10px] border p-3 text-left transition-colors lg:flex-row lg:items-center lg:justify-between lg:gap-3 lg:p-4 ${
                isActive
                  ? "border-accent/[0.42] bg-gradient-to-b from-accent/[0.1] to-surface/[0.8]"
                  : "border-border bg-surface/[0.7] hover:border-border-strong"
              }`}
            >
              <span
                className={`font-medium font-mono text-[14px] lg:text-[18px] ${
                  isActive ? "text-accent" : "text-fg"
                }`}
              >
                {v.display}
              </span>
              <span className="font-mono text-[8.5px] text-fg-dim uppercase tracking-[0.06em] lg:text-[10px] lg:tracking-[0.08em]">
                {v.tag}
              </span>
              {/* Long-form "best for" copy hidden on mobile (3-up pills are dense),
                  shown on desktop layout */}
              <div className="hidden text-[12px] text-fg-dim leading-relaxed lg:mt-2 lg:block lg:w-full">
                {v.best}
              </div>
            </button>
          );
        })}
      </div>

      {/* Diagram + meta */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-4 sm:p-6">
        <div className="absolute top-3 left-4 z-[1] font-mono text-[10px] text-fg-dim uppercase tracking-[0.08em] sm:top-4 sm:left-5">
          mode_diagram · {m.display}
        </div>
        {/* On phones the diagram scales down responsively; on larger screens it
            uses the full container width. Min-width set just high enough that
            13px node labels remain legible at typical phone widths. */}
        <div className="-mx-1 overflow-x-auto pt-6 sm:mx-0">
          <div className="min-w-[420px] px-1 sm:min-w-0 sm:px-0">
            <ModeDiagram mode={active} />
          </div>
        </div>
        <div className="border-border border-t pt-5">
          <div className="mb-3 flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="font-medium text-[20px] text-fg sm:text-[22px]">
              {m.display} mode
            </span>
            <span className="rounded-md border border-border bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-fg-dim uppercase tracking-[0.06em]">
              {m.tag}
            </span>
          </div>
          <p className="max-w-[58ch] text-[14px] text-fg-muted leading-relaxed sm:text-base">
            {m.desc}
          </p>
          <code className="mt-4 block w-full overflow-x-auto rounded-md border border-border bg-surface-2 px-3 py-1.5 font-mono text-[11.5px] text-fg sm:inline-block sm:w-auto sm:text-[12px]">
            <span className="text-fg-dim">.env →</span> {m.env}
          </code>
        </div>
      </div>
    </div>
  );
}
