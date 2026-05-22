"use client";

import { useEffect, useState } from "react";
import { PlasmaRing } from "../PlasmaRing";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";

type Turn = {
  who: "user" | "agent";
  text: string;
  struct?: Record<string, string>;
  ok?: boolean;
};

const TURNS: Turn[] = [
  { who: "user", text: "whats my aave health on polygon?" },
  {
    who: "agent",
    text: "Health factor 1.84 on Polygon. Supplied $284K USDC, borrowed $112K WETH.",
    struct: { health: "1.84", supplied: "$284K", borrowed: "$112K" },
  },
  { who: "user", text: "top up usdc if it drops below 1.6" },
  {
    who: "agent",
    text: "Watching. Will draft a vault tx for review at HF < 1.6.",
    ok: true,
  },
];

export function SceneChat() {
  const reduced = usePrefersReducedMotion();
  // Under reduced motion render all turns immediately, no typing animation.
  const [shown, setShown] = useState<number>(reduced ? TURNS.length : 0);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    if (reduced) {
      setShown(TURNS.length);
      setTyping(false);
      return;
    }
    if (shown >= TURNS.length) return;
    setTyping(true);
    const ms = TURNS[shown].who === "agent" ? 1100 : 700;
    const t = window.setTimeout(() => {
      setTyping(false);
      setShown((s) => s + 1);
    }, ms);
    return () => window.clearTimeout(t);
  }, [shown, reduced]);

  return (
    <div className="sc-chat">
      <div className="sc-chat-head">
        <PlasmaRing size={16} />
        <div>
          <div className="sc-chat-name">steward</div>
          <div className="sc-chat-meta">claude-sonnet-4-5 · vault mode</div>
        </div>
        <span className="sc-chat-status">
          <span className="sc-chat-status-dot" aria-hidden="true" /> online
        </span>
      </div>

      <div className="sc-chat-body">
        {TURNS.slice(0, shown).map((t) => (
          <div key={`${t.who}:${t.text}`} className={`sc-msg sc-msg-${t.who}`}>
            <span className="sc-msg-who">{t.who}</span>
            <div className="sc-msg-text">{t.text}</div>
            {t.struct && (
              <div className="sc-struct">
                {Object.entries(t.struct).map(([k, v]) => (
                  <div key={k}>
                    <span>{k}</span>
                    <strong>{v}</strong>
                  </div>
                ))}
              </div>
            )}
            {t.ok && <div className="sc-ok">⟩ subscribed · alert wired</div>}
          </div>
        ))}
        {typing && shown < TURNS.length && (
          <div
            className={`sc-msg sc-msg-${TURNS[shown].who} sc-typing`}
            aria-hidden="true"
          >
            <span className="sc-msg-who">{TURNS[shown].who}</span>
            <div className="sc-msg-text">
              <span className="sc-typing-dot" />
              <span className="sc-typing-dot" />
              <span className="sc-typing-dot" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
