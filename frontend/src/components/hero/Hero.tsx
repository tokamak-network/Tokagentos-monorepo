import { AgentStage } from "./AgentStage";
import { HeroLeft } from "./HeroLeft";
import { MetricsTicker } from "./MetricsTicker";
import { PlasmaBackdrop } from "./PlasmaBackdrop";

/**
 * Hero section orchestrator. Server component — composes layout only.
 * Interactive bits (HeroLeft clipboard, AgentStage cycling, scenes)
 * are client components.
 */
export function Hero() {
  return (
    <section
      className="hero-v2"
      aria-labelledby="hero-heading"
      data-screen-label="01 Hero"
    >
      <PlasmaBackdrop />

      <div className="container-page hero-v2-inner">
        <HeroLeft />
        <AgentStage />
      </div>

      <MetricsTicker />
    </section>
  );
}
