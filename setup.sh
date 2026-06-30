#!/usr/bin/env bash
# One-command setup for investor-council skill
set -e

echo "→ Installing investor-council dependencies..."

if command -v uv &>/dev/null; then
  uv pip install yfinance mcp --system 2>/dev/null || \
  uv pip install yfinance mcp 2>/dev/null || \
  pip3 install yfinance mcp --break-system-packages
elif command -v pip3 &>/dev/null; then
  pip3 install yfinance mcp --break-system-packages 2>/dev/null || \
  pip3 install yfinance mcp
else
  echo "ERROR: pip3 or uv not found. Install Python 3 first."
  exit 1
fi

echo "✓ Dependencies installed."
echo ""
echo "→ Verifying..."
python3 -c "import yfinance, mcp; print('✓ yfinance and mcp OK')"
echo ""
echo "Done. Restart Claude Code to load the MCP server, then run:"
echo "  /investor-council NVDA"
