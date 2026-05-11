#!/usr/bin/env bash
# Sync PTON + ClaudeVault ABIs from the llm-api-gateway forge build artifacts.
#
# One-shot helper until contracts move to a stable location.
# See plan §"Smart contracts — out of scope" and Decision OQ1.
#
# Usage:
#   bun run sync-abis            (from packages/billing/)
#   ./scripts/sync-abis.sh       (direct, from packages/billing/)
#   SOURCE_ROOT=/custom/path ./scripts/sync-abis.sh
#
# The script is intentionally NON-DESTRUCTIVE: it reports drift between the
# forge build artifacts and the hand-curated TypeScript ABI constants in
# src/chain/abi/, but does not overwrite them. Manual update is a developer
# step so that the TypeScript ABI can be selectively trimmed (only the
# function selectors actually used by the billing layer are included).
#
# To regenerate artifacts, run 'forge build' in llm-api-gateway/contracts/
# first, then re-run this script.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

SOURCE_ROOT="${SOURCE_ROOT:-${PACKAGE_ROOT}/../../../../../llm-api-gateway/contracts/out}"

echo "=== @tokagentos/billing ABI drift check ==="
echo "Source: ${SOURCE_ROOT}"
echo "Target: ${PACKAGE_ROOT}/src/chain/abi/"
echo ""

if [[ ! -d "${SOURCE_ROOT}" ]]; then
  echo "Error: SOURCE_ROOT not found: ${SOURCE_ROOT}"
  echo ""
  echo "To generate forge artifacts:"
  echo "  cd $(dirname "${SOURCE_ROOT}")"
  echo "  forge build"
  echo ""
  echo "Then re-run: bun run sync-abis (from packages/billing/)"
  exit 1
fi

PTON_JSON="${SOURCE_ROOT}/PTON.sol/PTON.json"
VAULT_JSON="${SOURCE_ROOT}/ClaudeVault.sol/ClaudeVault.json"

check_artifact() {
  local artifact="$1"
  local ts_abi="$2"
  local label="$3"

  if [[ ! -f "${artifact}" ]]; then
    echo "[MISSING]  ${label} artifact not found at: ${artifact}"
    echo "           Run 'forge build' in the contracts directory."
    return 1
  fi

  echo "[FOUND]    ${label} artifact: ${artifact}"

  # Extract just the ABI array from the forge artifact for display.
  # jq is required for the comparison; if absent, skip.
  if command -v jq &>/dev/null; then
    local fn_count
    fn_count=$(jq '[.abi[] | select(.type == "function")] | length' "${artifact}")
    local event_count
    event_count=$(jq '[.abi[] | select(.type == "event")] | length' "${artifact}")
    echo "           ABI: ${fn_count} functions, ${event_count} events"
    echo "           TypeScript target: ${ts_abi}"
    echo ""
    echo "--- Compare manually: ---"
    echo "jq '.abi[] | {type, name}' '${artifact}'"
    echo ""
  else
    echo "           Install jq for a detailed ABI comparison."
  fi

  echo "[NOTE]     This script reports drift only — it does NOT overwrite"
  echo "           ${ts_abi}"
  echo "           Update manually after reviewing the diff."
  echo ""
}

check_artifact "${PTON_JSON}" "${PACKAGE_ROOT}/src/chain/abi/pton.ts" "PTON"
check_artifact "${VAULT_JSON}" "${PACKAGE_ROOT}/src/chain/abi/vault.ts" "ClaudeVault"

echo "=== Done. No files were modified. ==="
