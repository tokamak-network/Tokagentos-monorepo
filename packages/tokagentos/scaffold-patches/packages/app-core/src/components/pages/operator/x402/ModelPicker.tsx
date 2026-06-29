/**
 * x402 · Active model picker — pin the gateway-wide model.
 *
 * A small inline segmented control over the gateway's model catalogue
 * (GET /v1/model → { active, models }); selecting one PUTs /v1/model then
 * reloads. Real-data only: when the gateway returns no data the section is
 * hidden (no mock). Self-contained: ../client-billing only.
 */
import { useCallback, useState } from "react";
import { getActiveModel, setActiveModel, useLive } from "../client-billing";

export function ModelPicker() {
  const { data, live, reload } = useLive(getActiveModel);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onPick = useCallback(
    async (model: string) => {
      if (saving) return;
      setSaving(model);
      setError(null);
      try {
        await setActiveModel(model);
        reload();
      } catch {
        setError("Could not set the active model — sign in to the gateway.");
      } finally {
        setSaving(null);
      }
    },
    [saving, reload],
  );

  // Real-data only: hide the section entirely when the gateway returns nothing.
  if (!live || !data) return null;

  // /v1/model.models is an array of { id, label, … } objects; fall back to the
  // active id when the catalogue is absent. Normalise to { id, label }.
  const catalog: { id: string; label: string }[] = (data.models ?? []).map(
    (m) => ({ id: m.id, label: m.label ?? m.id }),
  );
  const list =
    catalog.length > 0
      ? catalog
      : data.active
        ? [{ id: data.active, label: data.active }]
        : [];
  if (list.length === 0) return null;

  return (
    <>
      <div className="sec-head">
        <div>
          <div className="sec-title">
            <span className="num">MDL</span> Active model
          </div>
          <div className="sec-sub">
            The gateway-wide model every chat call routes through.
          </div>
        </div>
        <span className="chip ok">live</span>
      </div>

      <div className="card">
        <div
          role="group"
          aria-label="Active model"
          style={{ display: "flex", gap: 7, flexWrap: "wrap" }}
        >
          {list.map((m) => {
            const active = data.active === m.id;
            return (
              <button
                key={m.id}
                type="button"
                className={`token-btn ${active ? "is-active" : ""}`}
                onClick={() => onPick(m.id)}
                disabled={saving != null}
                aria-pressed={active}
                style={{
                  flexDirection: "row",
                  padding: "8px 14px",
                  minWidth: 0,
                }}
              >
                <span className="token-sym">
                  {saving === m.id ? "…" : m.label}
                </span>
              </button>
            );
          })}
        </div>
        {error && (
          <div
            className="mono"
            style={{ marginTop: 12, fontSize: 12, color: "var(--gold-hi)" }}
          >
            {error}
          </div>
        )}
      </div>
    </>
  );
}
