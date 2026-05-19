#!/usr/bin/env bash
# setup-secrets.sh — push every required secret to Fly for tokagent-billing-server.
#
# Reads tokagentos/scripts/billing-server/.env.prod (gitignored) and pushes
# every BILLING_* secret to Fly in a single batch. Idempotent: re-running
# overwrites whatever is currently set on Fly.
#
# Prerequisites:
#   - flyctl installed (https://fly.io/docs/flyctl/install/)
#   - flyctl auth login completed
#   - Fly app `tokagent-billing-server` already created
#     (flyctl apps create tokagent-billing-server --region fra)
#
# Usage:
#   bash tokagentos/scripts/billing-server/setup-secrets.sh
#
# Safety:
#   - Validates every required secret is present + non-empty BEFORE touching Fly.
#   - Validates loose format (postgres URL prefix, 0x-prefixed key, hex auth secret).
#   - Single batched `flyctl secrets set` call so the deploy machine only
#     restarts ONCE, not 6 times.

set -euo pipefail

APP="tokagent-billing-server"

# Resolve script location → repo root → .env.prod
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ENV_FILE="${SCRIPT_DIR}/.env.prod"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "✗ ${ENV_FILE} not found." >&2
  echo "  Run: cp ${SCRIPT_DIR}/.env.prod.example ${ENV_FILE}" >&2
  echo "  Then fill in every <fill-in> value." >&2
  exit 1
fi

# Load .env.prod into the current shell. Strip comments + blank lines.
# shellcheck disable=SC1090
set -a
source <(/usr/bin/sed -E 's/[[:space:]]+#.*$//; s/^[[:space:]]*#.*$//; /^[[:space:]]*$/d' "${ENV_FILE}")
set +a

REQUIRED=(
  BILLING_DATABASE_URL
  BILLING_AUTH_SECRET
  BILLING_OPERATOR_PRIVATE_KEY
  BILLING_CHAIN_RPC_URL
  BILLING_MAINNET_RPC_URL
  BILLING_LITELLM_API_KEY
)

# ── Validation pass ─────────────────────────────────────────────────────────
missing=()
for var in "${REQUIRED[@]}"; do
  val="${!var-}"
  if [[ -z "${val}" || "${val}" == "<fill-in>" ]]; then
    missing+=("${var}")
  fi
done
if (( ${#missing[@]} > 0 )); then
  echo "✗ The following required secrets are missing or still <fill-in>:" >&2
  printf '   - %s\n' "${missing[@]}" >&2
  echo "Edit ${ENV_FILE} and fill them in, then re-run." >&2
  exit 1
fi

# Loose format checks (catch the most common typos before they hit Fly).
if [[ ! "${BILLING_DATABASE_URL}" =~ ^postgres(ql)?:// ]]; then
  echo "✗ BILLING_DATABASE_URL must start with postgres:// or postgresql://" >&2
  exit 1
fi
if [[ ! "${BILLING_OPERATOR_PRIVATE_KEY}" =~ ^0x[a-fA-F0-9]{64}$ ]]; then
  echo "✗ BILLING_OPERATOR_PRIVATE_KEY must be 0x followed by 64 hex chars (32 bytes)." >&2
  exit 1
fi
if [[ ! "${BILLING_AUTH_SECRET}" =~ ^[a-fA-F0-9]{64}$ ]]; then
  echo "⚠  BILLING_AUTH_SECRET is not 64 hex chars. Generate with: openssl rand -hex 32" >&2
fi

# ── Push to Fly ─────────────────────────────────────────────────────────────
echo "Pushing ${#REQUIRED[@]} secrets to Fly app ${APP}…"
flyctl secrets set \
  BILLING_DATABASE_URL="${BILLING_DATABASE_URL}" \
  BILLING_AUTH_SECRET="${BILLING_AUTH_SECRET}" \
  BILLING_OPERATOR_PRIVATE_KEY="${BILLING_OPERATOR_PRIVATE_KEY}" \
  BILLING_CHAIN_RPC_URL="${BILLING_CHAIN_RPC_URL}" \
  BILLING_MAINNET_RPC_URL="${BILLING_MAINNET_RPC_URL}" \
  BILLING_LITELLM_API_KEY="${BILLING_LITELLM_API_KEY}" \
  --app "${APP}"

echo ""
echo "✓ Secrets pushed. Fly is restarting the app with the new secrets."
echo "  Tail logs:    flyctl logs --app ${APP}"
echo "  Smoke test:   bun tokagentos/scripts/billing-server/check-readiness.ts https://<your-billing-server-domain> --full"
