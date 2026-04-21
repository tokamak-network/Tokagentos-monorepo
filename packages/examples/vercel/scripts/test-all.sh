#!/bin/bash
# Run all tests for tokagentOS Vercel Edge Functions
#
# Usage:
#   ./scripts/test-all.sh                    # Test local dev server
#   ./scripts/test-all.sh https://your-app.vercel.app  # Test deployed

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

ENDPOINT="${1:-http://localhost:3000}"

echo "🧪 Running tokagentOS Vercel Edge Function Tests"
echo "📍 Endpoint: $ENDPOINT"
echo ""

# Test with TypeScript client
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Running TypeScript test client..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if command -v bun &> /dev/null; then
    bun run test-client.ts --endpoint "$ENDPOINT"
else
    npx ts-node test-client.ts --endpoint "$ENDPOINT"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Running Python test client..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
python3 test-client.py --endpoint "$ENDPOINT"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All tests completed!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"










