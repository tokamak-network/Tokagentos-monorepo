import Link from "next/link";
import { Logo } from "./Logo";

const LINKS = [
  { href: "https://tokagent.network", label: "tokagent", external: true },
  { href: "https://x402.org/", label: "x402", external: true },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-50 border-border border-b bg-page/70 backdrop-blur-md">
      <div className="container-page flex h-16 items-center justify-between">
        <Link
          href="/"
          aria-label="tokagentOS — home"
          className="flex items-center"
        >
          <Logo size={36} />
        </Link>
        <nav className="hidden items-center gap-6 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              {...(l.external
                ? { target: "_blank", rel: "noreferrer noopener" }
                : {})}
              className="font-mono text-[13px] text-fg-muted hover:text-fg"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <Link
          href="https://github.com/tokamak-network/Tokagentos-monorepo"
          target="_blank"
          rel="noreferrer noopener"
          className="rounded-md border border-border px-3 py-1.5 font-mono text-[12px] text-fg-muted hover:border-border-strong hover:text-fg"
        >
          github
          <span aria-hidden="true" className="ml-1 text-fg-dim">
            ↗
          </span>
        </Link>
      </div>
    </header>
  );
}
