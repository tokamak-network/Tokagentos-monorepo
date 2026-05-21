"use client";

import { useCallback, useState } from "react";

type Props = {
  value: string;
  label: string;
};

export function CopyButton({ value, label }: Props) {
  const [copied, setCopied] = useState(false);

  const onClick = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — no-op.
    }
  }, [value]);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-live="polite"
      className={`shrink-0 px-2 py-1 font-mono text-[12px] transition-colors ${
        copied ? "text-accent" : "text-fg-subtle hover:text-fg"
      }`}
    >
      {copied ? "[copied]" : "[copy]"}
    </button>
  );
}
