#!/usr/bin/env bash
# One-command setup for investor-council skill
set -e

echo "→ Installing investor-council dependencies..."

PACKAGES="yfinance mcp markdown weasyprint"

if command -v uv &>/dev/null; then
  uv pip install $PACKAGES --system 2>/dev/null || \
  uv pip install $PACKAGES 2>/dev/null || \
  pip3 install $PACKAGES --break-system-packages
elif command -v pip3 &>/dev/null; then
  pip3 install $PACKAGES --break-system-packages 2>/dev/null || \
  pip3 install $PACKAGES
else
  echo "ERROR: pip3 or uv not found. Install Python 3 first."
  exit 1
fi

echo "✓ Dependencies installed."
echo ""
echo "→ Verifying..."
python3 -c "import yfinance, mcp, markdown, weasyprint; print('✓ all OK')" 2>/dev/null || \
python3 -c "import yfinance, mcp; print('✓ core OK (weasyprint optional — use pandoc for PDF)')"
echo ""
echo "Done. Restart Claude Code to load the MCP server, then run:"
echo "  /investor-council NVDA"
