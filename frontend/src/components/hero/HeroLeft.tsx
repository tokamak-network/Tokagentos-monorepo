"use client";

import { useState } from "react";

const CLI_CMD = "bunx @tokagent/tokagentos@latest";

const META: Array<[string, string]> = [
  ["EST.", "2017"],
  ["NETWORK", "Tokamak"],
  ["LICENSE", "MIT"],
  ["RUNTIME", "Bun ≥ 1.3"],
];

export function HeroLeft() {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(CLI_CMD).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  };

  return (
    <div className="hero-v2-left">
      <div className="hero-eyebrow">
        <span className="hero-eyebrow-dot" aria-hidden="true" />
        <span>Sovereign Agent Layer</span>
      </div>

      <h1 id="hero-heading" className="hero-v2-h1">
        AI agents that <span className="gold-grad">hold their own keys.</span>
      </h1>

      <p className="hero-v2-lede">
        tokagentOS is Tokamak&apos;s open-source framework for autonomous agents
        with a native EVM wallet baked into every runtime. Bring your own LLM
        key, or let the agent&apos;s wallet pay per call via{" "}
        <a
          href="https://x402.org"
          target="_blank"
          rel="noreferrer noopener"
          className="hero-inline-link"
        >
          x402
        </a>
        .
      </p>

      <div className="hero-v2-actions">
        <button
          type="button"
          className="hero-cli"
          onClick={copy}
          aria-label={`Copy install command: ${CLI_CMD}`}
          title="Click to copy"
        >
          <span className="hero-cli-prompt" aria-hidden="true">
            $
          </span>
          <span className="hero-cli-cmd">{CLI_CMD}</span>
          <span
            className={`hero-cli-copy${copied ? " is-copied" : ""}`}
            aria-live="polite"
          >
            {copied ? "copied ✓" : "copy"}
          </span>
        </button>

        <a href="#agent-log" className="hero-btn-secondary">
          See an agent run <span aria-hidden="true">↘</span>
        </a>
      </div>

      <dl className="hero-v2-meta">
        {META.map(([k, v]) => (
          <div key={k} className="hero-meta-cell">
            <dt className="hero-meta-k">{k}</dt>
            <dd className="hero-meta-v">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
