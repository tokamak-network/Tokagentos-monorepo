import Link from "next/link";
import { Logo } from "./Logo";

const COLUMNS = [
  {
    label: "Network",
    links: [
      { href: "https://x402.org/", label: "x402", external: true },
      { href: "https://tokamak.network", label: "tokamak", external: true },
      { href: "https://tokagent.network", label: "tokagent", external: true },
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
      {
        href: "https://medium.com/@mehd1b",
        label: "blog",
        external: true,
      },
    ],
  },
];

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-border border-t bg-elev pt-12 pb-8 md:pt-16 md:pb-10">
      <div className="container-page">
        {/* Brand mark — consistent with nav, hero, vault card */}
        <div className="mb-8 md:mb-10">
          <Logo size={20} />
        </div>

        <div className="grid grid-cols-2 gap-6 md:gap-10">
          {COLUMNS.map((col) => (
            <div key={col.label}>
              <p className="font-mono text-[10px] text-fg-dim tracking-[0.12em] uppercase md:text-[11px] md:tracking-[0.14em]">
                {col.label}
              </p>
              <ul className="mt-3 space-y-1.5 md:mt-4 md:space-y-2">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      {...(l.external
                        ? { target: "_blank", rel: "noreferrer noopener" }
                        : {})}
                      className="flex items-baseline justify-between font-mono text-[13px] text-fg-muted hover:text-fg"
                    >
                      <span>{l.label}</span>
                      {l.external && (
                        <span
                          aria-hidden="true"
                          className="text-[10px] text-accent"
                        >
                          ↗
                        </span>
                      )}
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
