"use client";

import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import { SceneChat } from "./scenes/SceneChat";
import { SceneTerminal } from "./scenes/SceneTerminal";
import { SceneWallet } from "./scenes/SceneWallet";
import { SceneX402 } from "./scenes/SceneX402";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

type Scene = {
  id: string;
  n: string;
  label: string;
  sub: string;
  comp: ComponentType;
};

const SCENES: Scene[] = [
  {
    id: "chat",
    n: "01",
    label: "Chat agent",
    sub: "message stream",
    comp: SceneChat,
  },
  {
    id: "terminal",
    n: "02",
    label: "Daemon log",
    sub: "live tick",
    comp: SceneTerminal,
  },
  {
    id: "x402",
    n: "03",
    label: "x402 payment",
    sub: "HTTP 402 → settle",
    comp: SceneX402,
  },
  {
    id: "wallet",
    n: "04",
    label: "Multichain wallet",
    sub: "native EVM",
    comp: SceneWallet,
  },
];

const AUTO_MS = 6500; // MUST stay in sync with the progress-bar fill in globals.css.
const SYNC_FLICKER_MS = 5400;
const SYNC_FLICKER_FLASH_MS = 110;

export function AgentStage() {
  const reduced = usePrefersReducedMotion();
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [sync, setSync] = useState(true);

  // Auto-advance through scenes. We keep `idx` in the dep list so that a
  // manual click (prev/next/tab) resets the 6500ms timer instead of letting
  // the previously-scheduled tick fire early on the new scene. The functional
  // setIdx means `idx` is unused inside the effect body — the lint warning
  // is misleading here, hence the suppression.
  // biome-ignore lint/correctness/useExhaustiveDependencies: timer reset on manual scene change requires idx in deps
  useEffect(() => {
    if (paused || reduced) return;
    const id = window.setTimeout(
      () => setIdx((i) => (i + 1) % SCENES.length),
      AUTO_MS,
    );
    return () => window.clearTimeout(id);
  }, [idx, paused, reduced]);

  // Sync indicator briefly flickers gold every ~5.4s with a short flash.
  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => {
      setSync(false);
      window.setTimeout(() => setSync(true), SYNC_FLICKER_FLASH_MS);
    }, SYNC_FLICKER_MS);
    return () => window.clearInterval(id);
  }, [reduced]);

  const scene = SCENES[idx];
  const Comp = scene.comp;
  const feedNumber = 1200 + idx * 120;

  const prev = () => setIdx((i) => (i - 1 + SCENES.length) % SCENES.length);
  const next = () => setIdx((i) => (i + 1) % SCENES.length);

  const syncColor = sync ? "#4dd2a1" : "#f3ba2f";

  return (
    <section
      className="stage"
      aria-roledescription="carousel"
      aria-label="Agent stage: live demos"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="stage-meta stage-meta-tl">
        <span className="stage-meta-k">Feed {scene.n}</span>
        <span className="stage-meta-dot" />
        <span className="stage-meta-v">Stage Live</span>
      </div>

      <div className="stage-meta stage-meta-tr">
        <span className="stage-meta-v">16:9</span>
        <span className="stage-meta-dot" />
        <span className="stage-meta-k">{feedNumber}</span>
      </div>

      <span className="stage-corner stage-corner-tl" aria-hidden="true" />
      <span className="stage-corner stage-corner-tr" aria-hidden="true" />
      <span className="stage-corner stage-corner-bl" aria-hidden="true" />
      <span className="stage-corner stage-corner-br" aria-hidden="true" />

      <div className="stage-viewport">
        {/* The `key` forces a remount each scene change so the stage-in
            keyframe fires; child scene state also resets per scene. */}
        <section
          key={scene.id}
          className="stage-scene"
          aria-roledescription="slide"
          aria-label={`Scene ${idx + 1}: ${scene.label}`}
        >
          <Comp />
        </section>
        <div className="stage-scanlines" aria-hidden="true" />
        <div className="stage-vignette" aria-hidden="true" />
      </div>

      <div className="stage-bar">
        <div className="stage-bar-left">
          <span className="stage-num">{scene.n}</span>
          <div>
            <div className="stage-title">{scene.label}</div>
            <div className="stage-sub">{scene.sub}</div>
          </div>
        </div>

        <div className="stage-bar-mid" role="tablist" aria-label="Scene tabs">
          {SCENES.map((s, i) => {
            const isActive = i === idx;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={`Scene ${i + 1}: ${s.label}`}
                className={`stage-tab${isActive ? " is-active" : ""}`}
                onClick={() => setIdx(i)}
              >
                {/* Re-key on (idx, paused, reduced) so the progress fill
                    restarts on scene change and freezes correctly on hover. */}
                <span
                  key={`${idx}-${paused ? "p" : "r"}-${reduced ? "rm" : "go"}`}
                  className="stage-tab-progress"
                  style={{
                    animationName:
                      isActive && !reduced ? "stage-progress" : "none",
                    animationPlayState:
                      isActive && !paused && !reduced ? "running" : "paused",
                  }}
                />
              </button>
            );
          })}
        </div>

        <div className="stage-bar-right">
          <span className={`stage-sync ${sync ? "is-ok" : "is-warn"}`}>
            <span
              className="stage-sync-dot"
              aria-hidden="true"
              style={{
                background: syncColor,
                boxShadow: `0 0 6px ${syncColor}`,
              }}
            />
            Sync · {sync ? "OK" : "…"}
          </span>
          <div className="stage-arrows">
            <button type="button" onClick={prev} aria-label="Previous scene">
              ←
            </button>
            <button type="button" onClick={next} aria-label="Next scene">
              →
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
