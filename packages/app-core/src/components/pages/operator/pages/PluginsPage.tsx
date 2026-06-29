/**
 * Operator Plugins page — runtime extensions you can mount into the agent.
 * Ported from handoff_app/prototype/components/Shell.jsx (PluginsPage).
 *
 * Live: lists the real plugin registry via the self-contained operator gateway
 * (fetchPlugins → GET /api/plugins) and toggles plugins
 * (setPluginEnabled → PUT /api/plugins/:id { enabled }), mirroring the
 * main app's PluginsView. Falls back to mock PLUGINS when the agent server is
 * unavailable or the caller is unauthenticated. The same-origin agent server
 * mounts /api/plugins alongside the operator SPA, so the gateway's
 * base-url-aware fetch reaches it just like the billing helpers reach /v1/*.
 *
 * Database plugins (and plugins with no published package) are filtered out so
 * the card grid surfaces only the user-mountable extensions rather than the
 * internal core plugins.
 */
import { useCallback, useState } from "react";
import { useLive } from "../client-billing";
import {
  fetchPlugins,
  type GwPlugin,
  setPluginEnabled,
} from "../client-gateway";
import { PLUGINS, type PluginEntry } from "../mock";

/** Operator-card display shape (superset of the mock PluginEntry). */
type PluginCard = PluginEntry & { id: string };

/**
 * Minimal visibility filter (inlined — replaces the former plugin-list-utils
 * helpers). Drop database plugins; the card grid surfaces only user-mountable
 * extensions.
 */
function isMountable(p: GwPlugin): boolean {
  if (p.category === "database") return false;
  return true;
}

/** Map a real GwPlugin to the operator card display shape. */
function pluginInfoToCard(p: GwPlugin): PluginCard {
  return {
    id: p.id,
    // Real ids are bare ("telegram", "evm", "x402"); prefer the full package
    // name when present so the @tokagent/<name> header reads naturally.
    name: p.npmName ? p.npmName.replace(/^@tokagent\//, "") : p.id,
    desc: p.description,
    // Derive the kind chip directly from the plugin category.
    kind: p.category ?? "plugin",
    on: p.enabled,
  };
}

async function fetchPluginCards(): Promise<PluginCard[]> {
  const { plugins } = await fetchPlugins();
  return plugins.filter(isMountable).map(pluginInfoToCard);
}

export function PluginsPage({
  plugins = PLUGINS,
}: {
  plugins?: PluginEntry[];
} = {}) {
  const pluginsFetcher = useCallback(() => fetchPluginCards(), []);
  const { data, live: isLive, reload } = useLive(pluginsFetcher);

  // Live cards when the registry loaded; otherwise the mock fallback. The mock
  // PluginEntry shape is a subset of PluginCard, so the render is identical.
  const cards: PluginCard[] =
    data ?? plugins.map((p) => ({ ...p, id: p.name }));

  // Local toggle state, seeded from the current card set. Optimistic so the
  // switch responds instantly; reconciled by reload() after the mutation.
  const [toggles, setToggles] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(cards.map((p) => [p.id, p.on])),
  );

  const onToggle = useCallback(
    async (card: PluginCard) => {
      const next = !(toggles[card.id] ?? card.on);
      // Optimistic flip.
      setToggles((t) => ({ ...t, [card.id]: next }));
      if (!isLive) return; // mock view — local-only toggle, no backend call
      try {
        await setPluginEnabled(card.id, next);
        reload();
      } catch {
        // Mutation failed (unauthorized / restart pending / gateway down) —
        // revert the optimistic flip and keep the current view.
        setToggles((t) => ({ ...t, [card.id]: !next }));
      }
    },
    [isLive, reload, toggles],
  );

  return (
    <div className="page">
      <div className="page-pad">
        <div className="page-head">
          <div>
            <div className="page-eyebrow">runtime extensions</div>
            <h1 className="page-title">Plugins</h1>
            <p className="page-sub">
              Mount features into the agent — DeFi actions, channels, the
              billing rail. Toggle to load.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {isLive ? (
              <span className="chip ok">live</span>
            ) : (
              <span className="chip mute">⟩ example values</span>
            )}
            <button type="button" className="btn btn-ghost">
              Browse registry ↗
            </button>
          </div>
        </div>
        <div className="auto-grid">
          {cards.map((p) => (
            <div key={p.id} className="auto-card">
              <div className="auto-top">
                <span className="auto-name">
                  <span className="auto-glyph">🧩</span> @tokagent/{p.name}
                </span>
                <button
                  type="button"
                  className={`toggle ${(toggles[p.id] ?? p.on) ? "on" : ""}`}
                  onClick={() => onToggle(p)}
                />
              </div>
              <div className="auto-foot" style={{ marginTop: 4 }}>
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--muted-strong)",
                    fontFamily: "DM Sans, sans-serif",
                  }}
                >
                  {p.desc}
                </span>
                <span className="chip mute">{p.kind}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
