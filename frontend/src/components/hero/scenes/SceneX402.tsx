"use client";

import { useEffect, useState } from "react";
import { PlasmaRing } from "../PlasmaRing";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";

const PHASE_MS = 1200; // 4 phases × 1200ms = 4800ms cycle; phase 5 idles before resetting.

type FlowProps = {
  active: boolean;
  reverse?: boolean;
  label: string;
  goldDim?: boolean;
};

function FlowArrow({ active, reverse, label, goldDim }: FlowProps) {
  return (
    <div className="sc-flow">
      <svg
        viewBox="0 0 120 24"
        height="24"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <line
          x1="6"
          y1="12"
          x2="114"
          y2="12"
          stroke="rgba(138,138,148,0.32)"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        {active && (
          <circle r="2.5" fill={goldDim ? "#f3ba2f" : "#4dd2a1"}>
            <animate
              attributeName="cx"
              from={reverse ? 114 : 6}
              to={reverse ? 6 : 114}
              dur="1s"
              repeatCount="indefinite"
            />
          </circle>
        )}
      </svg>
      <div className="sc-flow-label" style={{ opacity: active ? 1 : 0.3 }}>
        {label}
      </div>
    </div>
  );
}

export function SceneX402() {
  const reduced = usePrefersReducedMotion();
  // 5-state cycle: 0=idle, 1=request, 2=quote, 3=sign, 4=settled (then loops).
  const [phase, setPhase] = useState<number>(reduced ? 4 : 0);

  useEffect(() => {
    if (reduced) {
      setPhase(4);
      return;
    }
    const id = window.setInterval(() => {
      setPhase((p) => (p + 1) % 5);
    }, PHASE_MS);
    return () => window.clearInterval(id);
  }, [reduced]);

  return (
    <div className="sc-x402">
      <div className="sc-x402-nodes">
        <div className={`sc-node${phase >= 1 ? " is-on" : ""}`}>
          <PlasmaRing size={20} />
          <div className="sc-node-name">agent</div>
          <div className="sc-node-sub">treasurer</div>
        </div>

        <FlowArrow active={phase >= 1} label="POST /v1/messages" />

        <div className={`sc-node${phase >= 2 ? " is-on" : ""}`}>
          <div className="sc-node-icn">{"{ }"}</div>
          <div className="sc-node-name">gateway</div>
          <div className="sc-node-sub">x402</div>
        </div>
      </div>

      <FlowArrow
        active={phase >= 3}
        reverse
        label="402 · pay 0.014 PTON"
        goldDim
      />

      <div className="sc-x402-cards">
        <div className={`sc-x402-card${phase >= 1 ? " is-on" : ""}`}>
          <div className="sc-x402-step">01</div>
          <div className="sc-x402-h">Request</div>
          <div className="sc-x402-p">Agent calls /v1/messages</div>
        </div>
        <div className={`sc-x402-card${phase >= 2 ? " is-on" : ""}`}>
          <div className="sc-x402-step">02</div>
          <div className="sc-x402-h">402 Quote</div>
          <div className="sc-x402-p">0.014 PTON required</div>
        </div>
        <div className={`sc-x402-card${phase >= 3 ? " is-on" : ""}`}>
          <div className="sc-x402-step">03</div>
          <div className="sc-x402-h">Sign EIP-3009</div>
          <div className="sc-x402-p">Local · no popup</div>
        </div>
        <div
          className={`sc-x402-card sc-x402-final${phase >= 4 ? " is-on" : ""}`}
        >
          <div className="sc-x402-step">04</div>
          <div className="sc-x402-h">Settled</div>
          <div className="sc-x402-p">tx 0xec71…2a8b</div>
        </div>
      </div>

      {phase >= 4 && !reduced && (
        <div className="sc-x402-flash" key={`flash-${phase}`}>
          <span>+ 0.014 PTON debited · stream resumed</span>
        </div>
      )}
    </div>
  );
}
