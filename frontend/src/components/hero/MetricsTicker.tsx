type Tone = "ok" | "gold" | "mute";
type Item = { label: string; value: string; sub: string; tone: Tone };

const ITEMS: Item[] = [
  { label: "AGENTS LIVE", value: "8,247", sub: "+184 24h", tone: "ok" },
  { label: "VAULT TVL", value: "$1.42M", sub: "PTON · mainnet", tone: "gold" },
  {
    label: "LLM CALLS / 24H",
    value: "312,408",
    sub: "+8.1% 7d",
    tone: "ok",
  },
  { label: "x402 SETTLED", value: "41,392", sub: "EIP-3009", tone: "gold" },
  { label: "NETWORKS", value: "12", sub: "EVM · L1+L2", tone: "mute" },
  {
    label: "CODE CHANGES",
    value: "+6,529,929",
    sub: "biweekly",
    tone: "mute",
  },
  { label: "ACTIVE FORKS", value: "47", sub: "open source", tone: "mute" },
  { label: "LICENSE", value: "MIT", sub: "fork of elizaOS", tone: "mute" },
];

function Row({ keyPrefix }: { keyPrefix: string }) {
  return (
    <>
      {ITEMS.map((it) => (
        <span key={`${keyPrefix}-${it.label}`} className="ticker-item">
          <span className="ticker-k">{it.label}</span>
          <span className={`ticker-v ticker-v-${it.tone}`}>{it.value}</span>
          <span className="ticker-sub">{it.sub}</span>
          <span className="ticker-sep" />
        </span>
      ))}
    </>
  );
}

/**
 * Full-width scrolling band below the hero. The track contains two
 * sequential copies of the same row so the `translateX(-50%)` keyframe
 * loops seamlessly. Hover anywhere on the band pauses the scroll via CSS
 * (`.ticker:hover .ticker-track { animation-play-state: paused }`).
 */
export function MetricsTicker() {
  return (
    <section className="ticker" aria-label="Live tokagentOS network metrics">
      <div className="ticker-fade ticker-fade-l" aria-hidden="true" />
      <div className="ticker-fade ticker-fade-r" aria-hidden="true" />
      <div className="ticker-track">
        <Row keyPrefix="a" />
        <Row keyPrefix="b" />
      </div>
    </section>
  );
}
