type Group = {
  label: string;
  items: string[];
};

type Props = {
  groups: Group[];
};

function renderRun(groups: Group[], keyPrefix: string) {
  return groups.map((g, gi) => (
    <span key={`${keyPrefix}-${g.label}`} className="flex items-center gap-3">
      <span className="text-fg-dim">{g.label}</span>
      {g.items.map((it) => (
        <span key={`${keyPrefix}-${g.label}-${it}`} className="text-fg-muted">
          {it}
        </span>
      ))}
      {gi < groups.length - 1 && (
        <span aria-hidden="true" className="px-2 text-fg-faint">
          ·
        </span>
      )}
    </span>
  ));
}

export function MarqueeStrip({ groups }: Props) {
  return (
    <section
      className="marquee-pause relative overflow-hidden border-border border-y py-4"
      aria-label="Supported providers, channels, and chains"
    >
      {/* Edge fades — smooth loop entry/exit on both sides */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-8 bg-gradient-to-r from-page to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 z-[1] w-8 bg-gradient-to-l from-page to-transparent"
      />
      <div className="marquee gap-8 font-mono text-[12px] tracking-wide">
        <div className="flex shrink-0 items-center gap-8 pr-8">
          {renderRun(groups, "a")}
        </div>
        <div
          aria-hidden="true"
          className="flex shrink-0 items-center gap-8 pr-8"
        >
          {renderRun(groups, "b")}
        </div>
      </div>
    </section>
  );
}
