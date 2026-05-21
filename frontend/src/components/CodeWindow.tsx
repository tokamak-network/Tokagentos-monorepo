import { Highlighted } from "@/lib/highlight";
import { LiveBadge } from "./LiveBadge";

type Props = {
  filename: string;
  code: string;
  live?: boolean;
  trailingNote?: string;
  cursor?: boolean;
};

export function CodeWindow({
  filename,
  code,
  live = false,
  trailingNote,
  cursor = false,
}: Props) {
  return (
    <figure className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between border-border border-b bg-surface px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 rounded-full bg-accent"
          />
          <span className="font-mono text-[12px] text-fg-muted tracking-wide">
            {filename}
          </span>
          {live && (
            <span className="ml-3 inline-flex items-center gap-2">
              <LiveBadge label="Live" />
              <span className="font-mono text-[11px] text-live tracking-[0.12em]">
                LIVE
              </span>
            </span>
          )}
        </div>
        {trailingNote && (
          <span className="font-mono text-[11px] text-fg-dim">
            {trailingNote}
          </span>
        )}
      </div>
      <pre className="overflow-x-auto bg-surface-2 p-5 font-mono text-[13px] text-fg leading-relaxed">
        <code>
          <Highlighted code={code} />
          {cursor && <span aria-hidden="true" className="term-cursor" />}
        </code>
      </pre>
    </figure>
  );
}
