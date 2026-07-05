#!/usr/bin/env python3
"""
MCP server — exposes fetch_stock as a Claude tool_use tool.

The fetch/formatting logic lives in fetch_stock.py (single source of truth);
this file only wraps it in an MCP stdio server.

Usage (Claude Code .mcp.json — via run_mcp.sh, which picks a python3
that actually has the mcp + yfinance modules):
    {
      "mcpServers": {
        "investor-council": {
          "command": "bash",
          "args": ["${CLAUDE_PLUGIN_ROOT}/skills/investor-council/scripts/run_mcp.sh"]
        }
      }
    }

Requirements:
    pip3 install mcp yfinance
"""

import os
import sys
import warnings
warnings.filterwarnings("ignore")

try:
    import mcp.server.stdio
    import mcp.types as types
    from mcp.server import Server
except ImportError:
    print("ERROR: mcp not installed. Run: pip3 install mcp", file=sys.stderr)
    sys.exit(1)

# Allow import of the sibling fetch_stock module regardless of the cwd
# the MCP host launches us from.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch_stock import fetch  # noqa: E402  (also validates yfinance is installed)

import asyncio


server = Server("investor-council")


@server.list_tools()
async def list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="fetch_stock",
            description=(
                "Fetch real-time stock metrics from Yahoo Finance for one or more ticker symbols. "
                "Returns a structured markdown report with valuation, growth, profitability, "
                "balance sheet, dividend, analyst consensus, and auto-flags keyed to each "
                "council member's frameworks (Graham margin-of-safety, Lynch PEG, Buffett ROE, etc.)."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "tickers": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "One or more ticker symbols, e.g. [\"NVDA\", \"AAPL\"]",
                        "minItems": 1,
                    }
                },
                "required": ["tickers"],
            },
        )
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[types.TextContent]:
    if name != "fetch_stock":
        raise ValueError(f"Unknown tool: {name}")

    tickers = arguments.get("tickers", [])
    if not tickers:
        return [types.TextContent(type="text", text="ERROR: no tickers provided")]

    parts = []
    for ticker in tickers:
        try:
            parts.append(fetch(ticker))
        except Exception as e:
            parts.append(f"ERROR fetching {ticker}: {e}")

    return [types.TextContent(type="text", text="\n\n---\n\n".join(parts))]


async def main():
    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options(),
        )


if __name__ == "__main__":
    asyncio.run(main())
