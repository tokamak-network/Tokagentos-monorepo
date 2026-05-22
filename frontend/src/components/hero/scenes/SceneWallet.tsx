"use client";

import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";

type Chain = {
  name: string;
  short: string;
  color: string;
  amount: string;
  symbol: string;
  usd: string;
};

const CHAINS: Chain[] = [
  {
    name: "mainnet",
    short: "ETH",
    color: "#627eea",
    amount: "0.4218",
    symbol: "ETH",
    usd: "$1,328",
  },
  {
    name: "base",
    short: "BASE",
    color: "#0052ff",
    amount: "14,029",
    symbol: "USDC",
    usd: "$14,029",
  },
  {
    name: "arbitrum",
    short: "ARB",
    color: "#28a0f0",
    amount: "2.81",
    symbol: "ETH",
    usd: "$8,847",
  },
  {
    name: "polygon",
    short: "POL",
    color: "#8247e5",
    amount: "284K",
    symbol: "USDC",
    usd: "$284K",
  },
  {
    name: "optimism",
    short: "OP",
    color: "#ff0420",
    amount: "0.92",
    symbol: "ETH",
    usd: "$2,896",
  },
  {
    name: "titan",
    short: "TON",
    color: "#f0b90b",
    amount: "1,284",
    symbol: "PTON",
    usd: "$641",
  },
];

const CYCLE_MS = 4500;
const ACTIVE_MS = 1600;

export function SceneWallet() {
  const reduced = usePrefersReducedMotion();
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    if (reduced) {
      setSigning(false);
      return;
    }
    const id = window.setInterval(() => {
      setSigning(true);
      window.setTimeout(() => setSigning(false), ACTIVE_MS);
    }, CYCLE_MS);
    return () => window.clearInterval(id);
  }, [reduced]);

  return (
    <div className="sc-wal">
      <div className="sc-wal-head">
        <div>
          <div className="sc-wal-label">native wallet</div>
          <div className="sc-wal-addr">0xA9c1…3E4f</div>
        </div>
        <div className="sc-wal-total">
          <div className="sc-wal-total-k">total</div>
          <div className="sc-wal-total-v">$311,783</div>
        </div>
      </div>

      <div className="sc-wal-grid">
        {CHAINS.map((c) => (
          <div key={c.name} className="sc-wal-row">
            <div className="sc-wal-chain">
              <span
                className="sc-wal-dot"
                style={{
                  background: c.color,
                  boxShadow: `0 0 8px ${c.color}66`,
                }}
              />
              <span className="sc-wal-chain-n">{c.name}</span>
              <span className="sc-wal-chain-s">{c.short}</span>
            </div>
            <div className="sc-wal-amt">
              <span>{c.amount}</span>
              <em>{c.symbol}</em>
            </div>
            <div className="sc-wal-usd">{c.usd}</div>
          </div>
        ))}
      </div>

      <div className={`sc-wal-sign${signing ? " is-active" : ""}`}>
        <span className="sc-wal-sign-dot" aria-hidden="true" />
        {signing ? (
          <span>signing · EIP-712 · supply 800 USDC → aPolUSDC</span>
        ) : (
          <span className="sc-wal-sign-idle">
            idle · listening for chat command
          </span>
        )}
      </div>
    </div>
  );
}
