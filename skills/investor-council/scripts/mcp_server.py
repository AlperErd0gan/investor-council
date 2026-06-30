#!/usr/bin/env python3
"""
MCP server — exposes fetch_stock as a Claude tool_use tool.

Usage (Claude Code .mcp.json):
    {
      "mcpServers": {
        "investor-council": {
          "command": "python3",
          "args": ["skills/investor-council/scripts/mcp_server.py"]
        }
      }
    }

Requirements:
    pip3 install mcp yfinance
"""

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

try:
    import yfinance as yf
except ImportError:
    print("ERROR: yfinance not installed. Run: pip3 install yfinance", file=sys.stderr)
    sys.exit(1)

import asyncio


# ── formatters ────────────────────────────────────────────────────────────────

def fmt(val, prefix="", suffix="", decimals=2, fallback="N/A"):
    if val is None or (isinstance(val, float) and val != val):
        return fallback
    try:
        if abs(val) >= 1_000_000_000:
            return f"{prefix}{val / 1_000_000_000:.1f}B{suffix}"
        if abs(val) >= 1_000_000:
            return f"{prefix}{val / 1_000_000:.1f}M{suffix}"
        return f"{prefix}{round(val, decimals)}{suffix}"
    except Exception:
        return fallback


def pct(val, fallback="N/A"):
    if val is None or (isinstance(val, float) and val != val):
        return fallback
    try:
        return f"{val * 100:.1f}%"
    except Exception:
        return fallback


# ── core fetch ────────────────────────────────────────────────────────────────

def fetch(ticker_symbol: str) -> str:
    ticker = yf.Ticker(ticker_symbol.upper())
    info = ticker.info

    if not info or (info.get("regularMarketPrice") is None and info.get("currentPrice") is None):
        return f"ERROR: Could not fetch data for {ticker_symbol.upper()}. Check the ticker symbol."

    name        = info.get("longName") or info.get("shortName") or ticker_symbol.upper()
    sector      = info.get("sector", "N/A")
    industry    = info.get("industry", "N/A")
    currency    = info.get("currency", "USD")

    price       = info.get("currentPrice") or info.get("regularMarketPrice")
    market_cap  = info.get("marketCap")
    pe_trailing = info.get("trailingPE")
    pe_forward  = info.get("forwardPE")
    peg         = info.get("pegRatio")
    pb          = info.get("priceToBook")
    ps          = info.get("priceToSalesTrailing12Months")
    ev_ebitda   = info.get("enterpriseToEbitda")

    revenue_growth            = info.get("revenueGrowth")
    earnings_growth           = info.get("earningsGrowth")
    earnings_quarterly_growth = info.get("earningsQuarterlyGrowth")

    gross_margins     = info.get("grossMargins")
    operating_margins = info.get("operatingMargins")
    profit_margins    = info.get("profitMargins")
    roe               = info.get("returnOnEquity")
    roa               = info.get("returnOnAssets")

    debt_to_equity   = info.get("debtToEquity")
    current_ratio    = info.get("currentRatio")
    quick_ratio      = info.get("quickRatio")
    total_cash       = info.get("totalCash")
    total_debt       = info.get("totalDebt")
    free_cashflow    = info.get("freeCashflow")
    operating_cashflow = info.get("operatingCashflow")

    dividend_yield = info.get("trailingAnnualDividendYield") or info.get("dividendYield")
    if dividend_yield and dividend_yield > 0.5:
        dividend_yield = None
    payout_ratio = info.get("payoutRatio")

    week52_high  = info.get("fiftyTwoWeekHigh")
    week52_low   = info.get("fiftyTwoWeekLow")
    beta         = info.get("beta")

    target_mean    = info.get("targetMeanPrice")
    recommendation = (info.get("recommendationKey") or "N/A").upper()
    analyst_count  = info.get("numberOfAnalystOpinions")

    pct_from_high = None
    if price and week52_high:
        pct_from_high = (price - week52_high) / week52_high * 100

    flags = []
    if pe_trailing and pe_trailing > 40:
        flags.append(f"⚠️ P/E {pe_trailing:.1f}x — Graham requires strong margin of safety justification above 20x")
    if peg and peg < 1.0:
        flags.append(f"✅ PEG {peg:.2f} — Lynch: below 1.0 is interesting territory")
    if peg and peg > 2.0:
        flags.append(f"⚠️ PEG {peg:.2f} — Lynch: above 2.0 means growth priced in and then some")
    if roe and roe > 0.20:
        flags.append(f"✅ ROE {roe*100:.1f}% — Buffett: above 20% signals durable competitive advantage")
    if debt_to_equity and debt_to_equity > 100:
        flags.append(f"⚠️ Debt/Equity {debt_to_equity:.0f} — Graham/Munger: high leverage = fragility")
    if profit_margins and profit_margins < 0:
        flags.append(f"🔴 Negative profit margin — Graham: no margin of safety on unprofitable business")
    if revenue_growth and revenue_growth > 0.30:
        flags.append(f"✅ Revenue growth {revenue_growth*100:.1f}% — Wood: strong S-curve signal")

    flags_str = "\n".join(f"- {f}" for f in flags) if flags else "- No automatic flags triggered"

    return f"""## 📊 Real Market Data — {name} ({ticker_symbol.upper()})
*Source: Yahoo Finance (via yfinance) — data may be delayed 15min. Verify before acting on it.*

### Overview
| Field | Value |
|---|---|
| Sector | {sector} |
| Industry | {industry} |
| Market Cap | {fmt(market_cap, prefix=currency+" ")} |
| Current Price | {fmt(price, prefix=currency+" ")} |
| 52W Range | {fmt(week52_low)} – {fmt(week52_high)} |
| % from 52W High | {fmt(pct_from_high, suffix="%", decimals=1)} |
| Beta | {fmt(beta, decimals=2)} |

### Valuation
| Metric | Value | Council lens |
|---|---|---|
| P/E Trailing | {fmt(pe_trailing, decimals=1)} | Graham: fair value ~15x; justify above 20x |
| P/E Forward | {fmt(pe_forward, decimals=1)} | Buffett: implied owner earnings yield |
| PEG Ratio | {fmt(peg, decimals=2)} | Lynch: below 1.0 interesting; below 0.5 exciting |
| Price/Book | {fmt(pb, decimals=2)} | Graham: below 1.5 for deep value |
| Price/Sales | {fmt(ps, decimals=2)} | Lynch: varies by sector |
| EV/EBITDA | {fmt(ev_ebitda, decimals=1)} | Dalio: cycle-adjusted comparison |

### Growth
| Metric | Value | Council lens |
|---|---|---|
| Revenue Growth YoY | {pct(revenue_growth)} | Lynch: does it match the PEG thesis? |
| Earnings Growth YoY | {pct(earnings_growth)} | Wood: does it follow Wright's Law curve? |
| Earnings Growth QoQ | {pct(earnings_quarterly_growth)} | Soros: accelerating or decelerating? |

### Profitability
| Metric | Value | Council lens |
|---|---|---|
| Gross Margin | {pct(gross_margins)} | Buffett: pricing power signal |
| Operating Margin | {pct(operating_margins)} | Munger: quality of business model |
| Net Profit Margin | {pct(profit_margins)} | Graham: consistency matters more than level |
| Return on Equity | {pct(roe)} | Buffett: above 15% = strong moat signal |
| Return on Assets | {pct(roa)} | Dalio: capital efficiency across the cycle |

### Balance Sheet & Cash Flow
| Metric | Value | Council lens |
|---|---|---|
| Debt/Equity | {fmt(debt_to_equity, decimals=2)} | Graham: below 0.5 preferred |
| Current Ratio | {fmt(current_ratio, decimals=2)} | Graham: above 2.0 = safe |
| Quick Ratio | {fmt(quick_ratio, decimals=2)} | Graham: liquidity stress test |
| Total Cash | {fmt(total_cash, prefix=currency+" ")} | Buffett: cash as optionality |
| Total Debt | {fmt(total_debt, prefix=currency+" ")} | Munger: leverage = fragility |
| Free Cash Flow | {fmt(free_cashflow, prefix=currency+" ")} | Buffett: the real earnings number |
| Operating Cash Flow | {fmt(operating_cashflow, prefix=currency+" ")} | Buffett: vs reported net income |

### Dividend
| Metric | Value |
|---|---|
| Dividend Yield | {pct(dividend_yield)} |
| Payout Ratio | {pct(payout_ratio)} |

### Analyst Consensus
| Metric | Value |
|---|---|
| Recommendation | {recommendation} |
| Mean Price Target | {fmt(target_mean, prefix=currency+" ")} |
| Analyst Count | {analyst_count or "N/A"} |

### 🚩 Auto-Flags for Council
{flags_str}

---
*Council: use the real numbers above in your analysis. Reference specific metrics by name. Do not guess or use placeholder values when real data is available.*""".strip()


# ── MCP server ────────────────────────────────────────────────────────────────

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
