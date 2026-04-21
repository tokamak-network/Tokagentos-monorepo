#!/bin/bash
# Build Rust WASM module for Supabase Edge Functions

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
RUST_DIR="$PROJECT_DIR/rust"
OUTPUT_DIR="$PROJECT_DIR/functions/tokagent-chat-wasm/wasm"

echo "🔧 Building tokagentOS Rust WASM module..."
echo "   Source: $RUST_DIR"
echo "   Output: $OUTPUT_DIR"

# Check for wasm-pack
if ! command -v wasm-pack &> /dev/null; then
    echo "❌ wasm-pack is not installed."
    echo "   Install it with: cargo install wasm-pack"
    echo "   Or: curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh"
    exit 1
fi

# Build WASM
cd "$RUST_DIR"

echo ""
echo "📦 Running wasm-pack build..."
wasm-pack build --target web --out-dir "$OUTPUT_DIR" --release

echo ""
echo "✅ WASM build complete!"
echo ""
echo "Files generated:"
ls -la "$OUTPUT_DIR"

echo ""
echo "Next steps:"
echo "  1. Deploy the edge function:"
echo "     supabase functions deploy tokagent-chat-wasm"
echo ""
echo "  2. Test locally:"
echo "     supabase functions serve tokagent-chat-wasm --env-file .env"










