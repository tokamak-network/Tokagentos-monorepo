import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  href: string;
  children: ReactNode;
  tone?: "accent" | "muted";
};

export function InlineLink({ href, children, tone = "accent" }: Props) {
  const external = href.startsWith("http");
  const color =
    tone === "accent" ? "text-accent" : "text-fg-muted hover:text-fg";
  return (
    <Link
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
      className={`group inline-flex items-center gap-1 text-[13px] tracking-wide ${color}`}
    >
      {children}
      <span
        aria-hidden="true"
        className="inline-block transition-transform duration-150 group-hover:translate-x-0.5"
      >
        →
      </span>
    </Link>
  );
}
