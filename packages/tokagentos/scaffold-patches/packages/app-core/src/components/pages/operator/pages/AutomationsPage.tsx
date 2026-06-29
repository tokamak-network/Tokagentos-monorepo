/**
 * Operator Automations page — scheduled & on-chain-triggered rules.
 * Ported from handoff_app/prototype/components/Pages.jsx (AutomationsPage).
 *
 * Live: lists the real unified automations (coordinator tasks + triggers + n8n
 * workflows) via `fetchAutomations()` — the same `/api/automations` source the
 * production AutomationsView renders — and toggles a card by arming/pausing its
 * backing trigger via `setTriggerEnabled(triggerId, enabled)`. Falls back to the
 * mock AUTOMATIONS list when the agent runtime is unavailable or the caller is
 * unauthenticated (`/api/automations` throws without a runtime).
 */
import { useCallback, useEffect, useState } from "react";
import { useLive } from "../client-billing";
import {
  fetchAutomations,
  type GwAutomation,
  setTriggerEnabled,
} from "../client-gateway";
import { AUTOMATIONS, type AutomationEntry } from "../mock";

/** Operator card shape with the optional backing trigger id for toggling. */
type AutomationRow = AutomationEntry & { triggerId?: string };

function shortAgo(iso: string | null | undefined): string {
  if (!iso) return "never run";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return "scheduled";
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "ran just now";
  if (min < 60) return `ran ${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `ran ${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `ran ${day}d ago`;
}

/** Build the trigger-condition string, mirroring the main view's schedule text. */
function triggerCondition(item: GwAutomation): string {
  const t = item.trigger;
  if (t) {
    // No discrete triggerType on the summary — derive it from the schedule
    // field that is present (cron → interval → once), matching the routes.
    if (t.cronExpression) {
      return `EVERY ${t.cronExpression}`;
    }
    if (t.intervalMs) {
      return `EVERY ${t.intervalMs}ms`;
    }
    if (t.scheduledAtIso) {
      return `ONCE at ${t.scheduledAtIso}`;
    }
    if (t.instructions) return t.instructions;
  }
  return item.description || "Manual / coordinator automation";
}

/** Last-run footer, derived from the backing trigger or item timestamps. */
function lastRun(item: GwAutomation): string {
  const t = item.trigger;
  if (t?.lastRunAtIso) {
    const ago = shortAgo(t.lastRunAtIso);
    return t.lastStatus ? `${ago} · ${t.lastStatus}` : ago;
  }
  return shortAgo(item.updatedAt);
}

/** Derive a glyph from the automation type/source (no backend emoji field). */
function glyphFor(item: GwAutomation): string {
  if (item.type === "n8n_workflow") return "🧩";
  const t = item.trigger;
  if (t && (t.cronExpression || t.intervalMs || t.scheduledAtIso)) return "⏱️";
  return "🤖";
}

/** Map a real GwAutomation to the operator `AutomationEntry` display shape. */
function automationItemToRow(item: GwAutomation): AutomationRow {
  return {
    glyph: glyphFor(item),
    name: item.title ?? item.id,
    trigger: triggerCondition(item),
    last: lastRun(item),
    on: item.enabled,
    triggerId: item.triggerId,
  };
}

export function AutomationsPage({
  automations = AUTOMATIONS,
}: {
  automations?: AutomationEntry[];
} = {}) {
  const fetcher = useCallback(
    (): Promise<{ automations: GwAutomation[] }> => fetchAutomations(),
    [],
  );
  const { data, live: isLive, reload } = useLive(fetcher);

  const shownAutomations: AutomationRow[] = data
    ? data.automations.map(automationItemToRow)
    : automations;

  // Optimistic per-card on/off state, re-seeded whenever the source changes.
  const [on, setOn] = useState<boolean[]>(() =>
    shownAutomations.map((a) => a.on),
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-seed only when the underlying data identity changes.
  useEffect(() => {
    setOn(shownAutomations.map((a) => a.on));
  }, [data]);

  const onToggle = useCallback(
    (i: number) => {
      // Optimistic flip first so the UI stays responsive.
      let next = false;
      setOn((prev) => {
        next = !prev[i];
        return prev.map((v, j) => (j === i ? !v : v));
      });
      const row = shownAutomations[i];
      if (!isLive || !row?.triggerId) return; // mock view or non-trigger item
      const triggerId = row.triggerId;
      setTriggerEnabled(triggerId, next)
        .then(() => reload())
        .catch(() => {
          // unauthenticated / runtime unavailable — revert the optimistic flip
          setOn((prev) => prev.map((v, j) => (j === i ? !v : v)));
        });
    },
    [shownAutomations, isLive, reload],
  );

  return (
    <div className="page">
      <div className="page-pad">
        <div className="page-head">
          <div>
            <div className="page-eyebrow">scheduled &amp; triggered</div>
            <h1 className="page-title">Automations</h1>
            <p className="page-sub">
              Rules the agent runs on its own — on a schedule or when an
              on-chain condition fires.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {isLive ? (
              <span className="chip ok">live</span>
            ) : (
              <span className="chip mute">⟩ example values</span>
            )}
            <button type="button" className="btn btn-gold">
              + New automation
            </button>
          </div>
        </div>

        <div className="auto-grid">
          {shownAutomations.map((a, i) => (
            <div key={a.triggerId ?? a.name} className="auto-card">
              <div className="auto-top">
                <span className="auto-name">
                  <span className="auto-glyph">{a.glyph}</span> {a.name}
                </span>
                <button
                  type="button"
                  className={`toggle ${on[i] ? "on" : ""}`}
                  onClick={() => onToggle(i)}
                />
              </div>
              <div className="auto-trigger">{a.trigger}</div>
              <div className="auto-foot">
                <span>{a.last}</span>
                <span
                  style={{ color: on[i] ? "var(--ok-bright)" : "var(--muted)" }}
                >
                  {on[i] ? "● armed" : "○ paused"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
