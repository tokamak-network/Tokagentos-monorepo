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
      className="marquee-pause overflow-hidden border-border border-y py-4"
      aria-label="Supported providers, channels, and chains"
    >
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
