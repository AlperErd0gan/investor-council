# Investor Council — Claude Code Skill

![Investor Council Banner](https://raw.githubusercontent.com/AlperErd0gan/investor-council/main/assets/banner.png)
*Banner generated with [Gemini](https://gemini.google.com)*

> ## ⚠️ IMPORTANT LEGAL DISCLAIMER
>
> **This is a fictional educational simulation. It is NOT financial advice.**
>
> - All investor personas are AI-generated approximations based solely on each person's
>   **publicly available books, interviews, shareholder letters, and documented philosophies**.
> - This project has **no affiliation with, endorsement from, or connection to** Warren Buffett,
>   Peter Lynch, Benjamin Graham (estate), George Soros, Ray Dalio, Cathie Wood, Charlie Munger
>   (estate), Berkshire Hathaway, ARK Invest, Bridgewater Associates, or any related firms.
> - **Nothing in this skill constitutes financial advice, investment advice, or any recommendation
>   to buy, sell, or hold any security, asset, or financial instrument.**
> - Simulated perspectives are approximations and may differ entirely from the real individuals'
>   actual views — past, present, or future.
> - Investing involves risk. You may lose money. Always consult a **licensed financial advisor**
>   regulated in your jurisdiction before making any investment decision.
> - By installing or using this skill you acknowledge it is for **educational and entertainment
>   purposes only.**

---

## What It Does

Convenes a fictional panel of 7 legendary investors, each analyzing your investment idea through
their own publicly documented philosophy. The value is in seeing genuine disagreement between
radically different frameworks — not in getting a recommendation.

## Council Members

| Member | Known For | Key Framework |
|---|---|---|
| Warren Buffett | Value investing | Moats, owner earnings, hold forever |
| Peter Lynch | GARP | "Invest in what you know", PEG ratio |
| Benjamin Graham | Deep value | Margin of safety, net-nets |
| George Soros | Macro / reflexivity | Self-reinforcing narrative loops |
| Ray Dalio | All-weather macro | Debt cycles, risk parity |
| Cathie Wood | Disruptive innovation | Wright's Law, 5-year TAM |
| Charlie Munger | Mental models | Inversion, lollapalooza effects |

## Install

### Claude Code (plugin — skill + MCP server)

```bash
# 1. add this repo as a marketplace
claude plugin marketplace add AlperErd0gan/investor-council

# 2. install the plugin from it
claude plugin install investor-council@investor-council
```

Update:

```bash
claude plugin marketplace update investor-council
```

The only requirement is **Node.js 18.17+** on your `PATH`. There is no Python, no `pip`, and no `npm install`.
The MCP server has zero dependencies and runs straight from the plugin folder.

### Other MCP clients (Claude Desktop, Cursor, …) — via npm

```json
{
  "mcpServers": {
    "investor-council": {
      "command": "npx",
      "args": ["-y", "investor-council-mcp@1.3.0"]
    }
  }
}
```

CLI, handy for checking the data yourself:

```bash
npx -y investor-council-mcp@1.3.0 fetch BTC-USD ETH-USD
```

## Data sources

| Asset | Source | Notes |
|---|---|---|
| Crypto (`BTC-USD`, `ETH-USD`, …) | [CoinGecko](https://www.coingecko.com/en/api) public API, via the bundled MCP tool `fetch_crypto` | Price, market cap and rank, 24h change, distance from ATH, supply. Free, keyless, no account or email |
| Stocks, ETFs, indices | Claude's web search | Price, P/E, PEG, margins, ROE, debt, growth. The skill cites the source and as-of date for each figure, and applies the council's auto-flag thresholds |

Stock figures from web search are less consistent than a structured feed. Check the cited
sources before relying on any number.

## Security

- The MCP server has **zero runtime dependencies** and contacts only `api.coingecko.com`.
  Redirects are refused, responses are size- and time-capped, and symbols are validated before
  they reach a URL. It sends no personal data: no email, account or API key.
- Text from upstream APIs is stripped down to letters, digits and basic punctuation before it
  reaches the model, so a hostile coin name can't inject markdown, links or instructions.
- Upstream requests are rate-limited (≤2 in flight, ≥500 ms apart) to respect CoinGecko's
  public tier, and each tool call has a 60 s budget. Stdin lines are capped at 1 MB.
- The skill pre-approves only the fetch tool and writes inside `~/investor-council-exports/`.
  Web searches and shell commands (pandoc, the CLI fallback) still ask you first.
- PDF export runs pandoc with raw TeX/HTML disabled and `--sandbox`. HTML export carries a CSP
  that blocks scripts and network loads.
- Full audit: [docs/SECURITY-AUDIT.md](docs/SECURITY-AUDIT.md).
- The npm package is published from CI with [provenance](https://docs.npmjs.com/generating-provenance-statements).

Report vulnerabilities privately via GitHub Security Advisories, not public issues.

## Usage

```
/investor-council NVIDIA at 35x P/E — worth buying?
/investor-council buffett What does Buffett's framework say about Bitcoin?
/investor-council compare Index funds vs individual stock picking
/investor-council devil Apple stock — argue the bear case
/investor-council debate Bitcoin as a store of value
/investor-council ghost I want to leverage up on crypto yield farming
/investor-council bias I bought Tesla at $400, now $180, feels like a deal
```

## Commands

| Command | What It Does |
|---|---|
| `/investor-council [idea]` | Full 7-member TL;DR table |
| `/investor-council [name] [idea]` | Single investor deep-dive |
| `/investor-council compare [A] vs [B]` | Head-to-head council vote |
| `/investor-council devil [idea]` | All members argue bear case |
| `/investor-council bull [idea]` | All members argue bull case |
| `/investor-council debate [idea]` | Two opposed members argue directly |
| `/investor-council ghost [idea]` | Historical blowup patterns that match |
| `/investor-council bias` | Detect cognitive biases in your framing |

## License

MIT — free to use, modify, and distribute with attribution.

## Contributing

PRs welcome. All contributions must maintain the educational disclaimer and must not introduce
any content that could be construed as financial advice.
