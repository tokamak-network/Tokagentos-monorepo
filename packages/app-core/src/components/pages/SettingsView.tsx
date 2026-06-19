/**
 * Settings page — minimal "paste a key + RPC URLs, restart" surface.
 *
 * Two inputs:
 *   1. operator private key  → TOKAGENT_PRIVATE_KEY
 *   2. one URL per chain     → per-chain env keys (see quick-config-routes.ts)
 *
 * Submit calls /api/config/quick-setup (same-origin → local agent), which
 * writes config.env via persistConfigEnv() and triggers a runtime restart.
 *
 * Anything richer (cloud wallet provisioning, OS-keychain import, balance
 * reads, per-chain fallback lists) lives in the /wallet page — keep this
 * one ruthlessly simple.
 */

import {
  Button,
  cn,
  Input,
  Label,
  PagePanel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from "@tokagentos/ui";
import { Plus, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { client } from "../../api/client";
import type {
  QuickConfigChain,
  QuickConfigRpcEntry,
  QuickConfigSaveResponse,
} from "../../api/client-quick-config";
import { useApp } from "../../state";

const PRIVATE_KEY_PATTERN = /^0x[0-9a-fA-F]{64}$/;

const CHAIN_OPTIONS: { value: QuickConfigChain; label: string }[] = [
  { value: "ethereum", label: "Ethereum mainnet" },
  { value: "polygon", label: "Polygon" },
  { value: "base", label: "Base" },
  { value: "arbitrum", label: "Arbitrum" },
  { value: "optimism", label: "Optimism" },
  { value: "bsc", label: "BNB Chain" },
];

interface RpcRow {
  // Stable React key — independent of chain so re-selecting chain doesn't
  // remount the row.
  rowId: string;
  chain: QuickConfigChain;
  url: string;
}

function newRowId(): string {
  return `rpc-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultRows(): RpcRow[] {
  return [{ rowId: newRowId(), chain: "ethereum", url: "" }];
}

function isValidUrl(value: string): boolean {
  if (value.length === 0) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function SettingsView({
  inModal,
  onClose: _onClose,
  initialSection: _initialSection,
}: {
  inModal?: boolean;
  onClose?: () => void;
  initialSection?: string;
} = {}) {
  const { setActionNotice } = useApp();

  const [privateKey, setPrivateKey] = useState("");
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [rows, setRows] = useState<RpcRow[]>(defaultRows);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<QuickConfigSaveResponse | null>(
    null,
  );

  // Chains already in use elsewhere in the table — disabled in other rows'
  // selectors so the user can't accidentally send a duplicate to the API
  // (the server enforces this too, but better to prevent than report).
  const chainsInUse = useMemo(
    () => new Set(rows.map((row) => row.chain)),
    [rows],
  );

  const pkValid = PRIVATE_KEY_PATTERN.test(privateKey);
  const rowsValid =
    rows.length === 0 || rows.every((row) => isValidUrl(row.url));
  const canSubmit = pkValid && rowsValid && !busy;

  const updateRow = useCallback((rowId: string, patch: Partial<RpcRow>) => {
    setRows((prev) =>
      prev.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)),
    );
  }, []);

  const removeRow = useCallback((rowId: string) => {
    setRows((prev) => prev.filter((row) => row.rowId !== rowId));
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => {
      const used = new Set(prev.map((row) => row.chain));
      const nextChain =
        CHAIN_OPTIONS.find((opt) => !used.has(opt.value))?.value ?? "ethereum";
      return [...prev, { rowId: newRowId(), chain: nextChain, url: "" }];
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setBusy(true);
    setLastResult(null);
    try {
      const rpcs: QuickConfigRpcEntry[] = rows.map((row) => ({
        chain: row.chain,
        url: row.url.trim(),
      }));
      const result = await client.saveQuickConfig({
        privateKey,
        rpcs,
      });
      setLastResult(result);
      setActionNotice(
        result.restarting
          ? `Saved ${result.written.length} key(s). Restarting agent…`
          : `Saved ${result.written.length} key(s). Restart scheduled for next idle window.`,
        "success",
        4000,
      );
    } catch (err) {
      setActionNotice(
        err instanceof Error ? err.message : "Failed to save settings.",
        "error",
        5000,
      );
    } finally {
      setBusy(false);
    }
  }, [canSubmit, privateKey, rows, setActionNotice]);

  return (
    <div
      data-testid="settings-shell"
      className={cn(
        "h-full overflow-y-auto bg-bg/10 pb-10 pt-6",
        inModal && "min-h-0",
      )}
    >
      <div className="mx-auto w-full max-w-2xl space-y-6 px-4">
        <PagePanel variant="section">
          <div className="p-5 space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
            <p className="text-sm text-muted">
              Configure the agent's wallet. The runtime restarts after saving so
              the new values take effect immediately.
            </p>
          </div>
        </PagePanel>

        <PagePanel variant="section">
          <div className="p-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="settings-private-key" className="text-txt-strong">
                Operator private key
              </Label>
              <div className="flex gap-2">
                <Input
                  id="settings-private-key"
                  type={showPrivateKey ? "text" : "password"}
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value.trim())}
                  placeholder="0x…"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={privateKey.length > 0 && !pkValid}
                  className="rounded-lg bg-bg font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPrivateKey((v) => !v)}
                  aria-label={showPrivateKey ? "Hide key" : "Show key"}
                >
                  {showPrivateKey ? "Hide" : "Show"}
                </Button>
              </div>
              <p className="text-xs text-muted">
                64-character hex, 0x-prefixed. Stored locally in{" "}
                <code className="text-txt">~/.milady/config.env</code>; never
                sent to any remote service.
              </p>
              {privateKey.length > 0 && !pkValid && (
                <p className="text-xs text-danger">
                  Must be 0x followed by exactly 64 hex characters.
                </p>
              )}
            </div>
          </div>
        </PagePanel>

        <PagePanel variant="section">
          <div className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-base font-medium">RPC endpoints</h2>
                <p className="text-xs text-muted">
                  One URL per chain. Each row writes to its canonical env
                  variable.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addRow}
                disabled={rows.length >= CHAIN_OPTIONS.length}
              >
                <Plus className="h-4 w-4" />
                Add chain
              </Button>
            </div>

            {rows.length === 0 ? (
              <p className="text-sm text-muted italic">
                No RPC endpoints — only the private key will be written.
              </p>
            ) : (
              <ul className="space-y-3">
                {rows.map((row) => {
                  const urlInvalid = row.url.length > 0 && !isValidUrl(row.url);
                  return (
                    <li key={row.rowId} className="flex items-start gap-2">
                      <div className="w-44 shrink-0">
                        <Select
                          value={row.chain}
                          onValueChange={(value: string) =>
                            updateRow(row.rowId, {
                              chain: value as QuickConfigChain,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CHAIN_OPTIONS.map((opt) => (
                              <SelectItem
                                key={opt.value}
                                value={opt.value}
                                disabled={
                                  opt.value !== row.chain &&
                                  chainsInUse.has(opt.value)
                                }
                              >
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1 space-y-1">
                        <Input
                          value={row.url}
                          onChange={(e) =>
                            updateRow(row.rowId, { url: e.target.value })
                          }
                          placeholder="https://eth.llamarpc.com"
                          aria-invalid={urlInvalid}
                          className="rounded-lg bg-bg font-mono text-sm"
                        />
                        {urlInvalid && (
                          <p className="text-xs text-danger">
                            Must be an http(s) URL.
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeRow(row.rowId)}
                        aria-label="Remove row"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </PagePanel>

        <PagePanel variant="section">
          <div className="p-5 flex items-center justify-between gap-4">
            <p className="text-xs text-muted">
              Saving will write to <code className="text-txt">config.env</code>{" "}
              and restart the local agent process.
            </p>
            <Button
              type="button"
              variant="default"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
            >
              {busy && <Spinner size={14} />}
              Save & Restart
            </Button>
          </div>
        </PagePanel>

        {lastResult && (
          <PagePanel variant="section">
            <div className="p-5 space-y-2">
              <h3 className="text-sm font-medium">Last save</h3>
              <p className="text-xs text-muted">
                Wrote {lastResult.written.length} key(s):{" "}
                <code className="text-txt">
                  {lastResult.written.join(", ")}
                </code>
              </p>
              <p className="text-xs text-muted">
                {lastResult.restarting
                  ? "Runtime restart triggered."
                  : "Runtime restart scheduled."}
              </p>
            </div>
          </PagePanel>
        )}
      </div>
    </div>
  );
}
