#!/usr/bin/env bash
# Smoke-tests the investor-council skill against the local plugin directory.
# Usage: bash smoke.sh [plugin-dir]
# Default plugin-dir: repo root (two levels up from this script).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="${1:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"

run() {
  local label="$1"; local prompt="$2"
  echo ""
  echo "━━━ $label ━━━"
  echo "$prompt" | claude --plugin-dir "$PLUGIN_DIR" -p --output-format text 2>&1
}

echo "Investor Council — smoke test"
echo "Plugin dir: $PLUGIN_DIR"
echo "Claude: $(claude --version 2>/dev/null || echo 'unknown')"

run "Full council (TL;DR table)" \
  "/investor-council NVIDIA at 35x P/E — is it worth buying?"

run "Single investor deep-dive" \
  "/investor-council buffett What does Buffett think about index funds?"

run "Ghost warning (3x leverage crypto)" \
  "/investor-council ghost I want to leverage 3x into crypto yield farming"

run "Bias detector (anchoring + sunk cost)" \
  "/investor-council bias I bought Tesla at \$400, it's \$180 now, feels like a deal"

run "Bear case stress test" \
  "/investor-council devil Apple stock"

echo ""
echo "━━━ smoke test complete ━━━"
