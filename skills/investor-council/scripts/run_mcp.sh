#!/usr/bin/env bash
# Launcher for the investor-council MCP server.
# Claude Code may start MCP servers without a shell PATH that includes
# Homebrew, so bare "python3" can resolve to Apple's /usr/bin/python3
# (3.9, no mcp module). Probe candidates and exec the first one that
# actually has the required modules.

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CANDIDATES=(
  "$DIR/../../../.venv/bin/python"
  python3
  /opt/homebrew/bin/python3
  /usr/local/bin/python3
)

for PY in "${CANDIDATES[@]}"; do
  command -v "$PY" >/dev/null 2>&1 || continue
  if "$PY" -c "import mcp, yfinance" >/dev/null 2>&1; then
    exec "$PY" "$DIR/mcp_server.py"
  fi
done

echo "ERROR: no python3 with 'mcp' and 'yfinance' found. Run: bash setup.sh" >&2
exit 1
