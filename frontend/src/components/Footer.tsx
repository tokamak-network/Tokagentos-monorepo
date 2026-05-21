import Link from "next/link";

const COLUMNS = [
  {
    label: "Network",
    links: [
      { href: "https://x402.org/", label: "x402", external: true },
      { href: "https://tokamak.network", label: "tokamak", external: true },
    ],
  },
  {
    label: "Community",
    links: [
      {
        href: "https://github.com/tokamak-network/Tokagentos-monorepo",
        label: "github",
        external: true,
      },
      { href: "https://x.com/tokagent", label: "twitter", external: true },
      { href: "#blog", label: "blog" },
    ],
  },
];

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-border border-t bg-elev pt-16 pb-10">
      <div className="container-page">
        <div className="grid gap-10 sm:grid-cols-2">
          {COLUMNS.map((col) => (
            <div key={col.label}>
              <p className="font-mono text-[11px] text-fg-dim tracking-[0.14em] uppercase">
                {col.label}
              </p>
              <ul className="mt-4 space-y-2">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      {...(l.external
                        ? { target: "_blank", rel: "noreferrer noopener" }
                        : {})}
                      className="font-mono text-[13px] text-fg-muted hover:text-fg"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-border border-t pt-6 md:flex-row md:items-center md:justify-between">
          <p className="font-mono text-[11px] text-fg-dim">
            © {year} tokagentOS · MIT · fork of elizaOS
          </p>
          <p className="font-mono text-[12px] text-fg-muted italic">
            Don&apos;t trust. Verify with math.
          </p>
        </div>
      </div>
    </footer>
  );
}
