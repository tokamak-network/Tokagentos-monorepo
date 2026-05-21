type Props = {
  number?: string;
  eyebrow: string;
  heading?: string;
  sub?: string;
  headingId?: string;
  centered?: boolean;
};

export function SectionHeader({
  number,
  eyebrow,
  heading,
  sub,
  headingId,
  centered = false,
}: Props) {
  return (
    <div className={centered ? "text-center" : undefined}>
      <p className="font-mono text-[11px] text-fg-dim tracking-[0.14em]">
        {number && <span className="text-accent">{number} / </span>}
        <span>{eyebrow.toUpperCase()}</span>
      </p>
      {heading && (
        <h2 id={headingId} className="h1-text mt-5 text-fg">
          {heading}
        </h2>
      )}
      {sub && (
        <p
          className={`mt-4 text-[16px] text-fg-muted leading-relaxed ${
            centered ? "mx-auto max-w-2xl" : "max-w-2xl"
          }`}
        >
          {sub}
        </p>
      )}
    </div>
  );
}
