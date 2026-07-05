#!/usr/bin/env python3
"""
Fetches real financial data for a stock ticker using Yahoo Finance.
Outputs a structured markdown report for the Investor Council skill.

Usage:
    python3 fetch_stock.py NVDA
    python3 fetch_stock.py AAPL MSFT TSLA

Requirements:
    pip3 install yfinance
"""

import re
import sys
import warnings
warnings.filterwarnings("ignore")

# Valid Yahoo Finance symbols: letters, digits, and . - ^ = (e.g. BRK.B, BTC-USD, ^GSPC)
TICKER_RE = re.compile(r"^[A-Za-z0-9.\-^=]{1,15}$")

try:
    import yfinance as yf
except ImportError:
    # stderr, not stdout — this module is also imported by mcp_server.py,
    # where stdout is the MCP protocol channel
    print("ERROR: yfinance not installed. Run: pip3 install yfinance", file=sys.stderr)
    sys.exit(1)


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


def clean(text, max_len=80, fallback="N/A"):
    """Sanitize text that arrives from the Yahoo API before it is embedded in
    the report: strip characters that would break markdown tables or let a
    hostile payload masquerade as instructions, and cap the length."""
    if not isinstance(text, str):
        return fallback
    return re.sub(r"[\r\n|`<>]", " ", text)[:max_len].strip() or fallback


def fetch(ticker_symbol):
    ticker_symbol = str(ticker_symbol).strip()
    if not TICKER_RE.match(ticker_symbol):
        return "ERROR: invalid ticker symbol (letters, digits, . - ^ = only, max 15 chars)."

    try:
        ticker = yf.Ticker(ticker_symbol.upper())
        info = ticker.info
    except Exception:
        # yfinance raises on some malformed symbols (e.g. 12-char strings are
        # treated as ISINs -> "Invalid ISIN number"). Funnel into the same
        # graceful message as an empty/priceless result instead of leaking.
        return f"ERROR: Could not fetch data for {ticker_symbol.upper()}. Check the ticker symbol."

    if not info or (info.get("regularMarketPrice") is None and info.get("currentPrice") is None):
        return f"ERROR: Could not fetch data for {ticker_symbol.upper()}. Check the ticker symbol."

    name = clean(info.get("longName") or info.get("shortName"), fallback=ticker_symbol.upper())
    sector = clean(info.get("sector"))
    industry = clean(info.get("industry"))
    currency = clean(info.get("currency"), max_len=8, fallback="USD")

    price = info.get("currentPrice") or info.get("regularMarketPrice")
    market_cap = info.get("marketCap")
    pe_trailing = info.get("trailingPE")
    pe_forward = info.get("forwardPE")
    # newer yfinance versions dropped "pegRatio" from info; "trailingPegRatio" remains
    peg = info.get("pegRatio") or info.get("trailingPegRatio")
    pb = info.get("priceToBook")
    ps = info.get("priceToSalesTrailing12Months")
    ev_ebitda = info.get("enterpriseToEbitda")

    revenue_growth = info.get("revenueGrowth")
    earnings_growth = info.get("earningsGrowth")
    earnings_quarterly_growth = info.get("earningsQuarterlyGrowth")

    gross_margins = info.get("grossMargins")
    operating_margins = info.get("operatingMargins")
    profit_margins = info.get("profitMargins")
    roe = info.get("returnOnEquity")
    roa = info.get("returnOnAssets")

    debt_to_equity = info.get("debtToEquity")
    current_ratio = info.get("currentRatio")
    quick_ratio = info.get("quickRatio")
    total_cash = info.get("totalCash")
    total_debt = info.get("totalDebt")
    free_cashflow = info.get("freeCashflow")
    operating_cashflow = info.get("operatingCashflow")

    # Yahoo Finance sometimes returns dividend yield as a raw decimal already multiplied
    # Use trailingAnnualDividendYield which is reliably a decimal (e.g. 0.0003 = 0.03%)
    dividend_yield = info.get("trailingAnnualDividendYield") or info.get("dividendYield")
    if dividend_yield and dividend_yield > 0.5:
        # Sanity cap — no real stock yields >50%; bad data from Yahoo
        dividend_yield = None
    payout_ratio = info.get("payoutRatio")

    week52_high = info.get("fiftyTwoWeekHigh")
    week52_low = info.get("fiftyTwoWeekLow")
    beta = info.get("beta")

    target_mean = info.get("targetMeanPrice")
    recommendation = clean(info.get("recommendationKey"), max_len=20).upper()
    analyst_count = info.get("numberOfAnalystOpinions")

    pct_from_high = None
    if price and week52_high:
        pct_from_high = (price - week52_high) / week52_high * 100

    # Council-specific flags
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

    output = f"""## 📊 Real Market Data — {name} ({ticker_symbol.upper()})
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
*Council: use the real numbers above in your analysis. Reference specific metrics by name. Do not guess or use placeholder values when real data is available.*
"""
    return output.strip()


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 fetch_stock.py TICKER [TICKER2 ...]")
        print("Example: python3 fetch_stock.py NVDA AAPL TSLA")
        sys.exit(1)

    for i, ticker in enumerate(sys.argv[1:]):
        try:
            print(fetch(ticker))
            if i < len(sys.argv) - 2:
                print("\n---\n")
        except Exception as e:
            print(f"ERROR fetching {ticker}: {e}")


if __name__ == "__main__":
    main()
