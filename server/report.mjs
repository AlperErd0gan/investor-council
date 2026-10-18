// Builds the council's markdown market-data report for a crypto asset.
// Stocks are not fetched here: the skill gathers their figures via web search.

import { cryptoMarket, SourceError } from "./sources.mjs";

// BTC-USD, ETH-USD, SOL-USD … — the -USD form avoids collisions with stock tickers
export const SYMBOL_RE = /^([A-Za-z0-9]{2,10})-USD$/i;

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// --- formatting ----------------------------------------------------------------

export function fmt(val, { prefix = "", suffix = "", decimals = 2 } = {}) {
  val = num(val);
  if (val === null) return "N/A";
  const abs = Math.abs(val);
  if (abs >= 1e9) return `${prefix}${(val / 1e9).toFixed(1)}B${suffix}`;
  if (abs >= 1e6) return `${prefix}${(val / 1e6).toFixed(1)}M${suffix}`;
  return `${prefix}${Number(val.toFixed(decimals))}${suffix}`;
}

export function pct(val) {
  val = num(val);
  return val === null ? "N/A" : `${(val * 100).toFixed(1)}%`;
}

// Text from external APIs is untrusted: keep only characters a coin name
// needs, so nothing can break a markdown table, smuggle a link, or pose as
// instructions to the model.
export function clean(text, maxLen = 80, fallback = "N/A") {
  if (typeof text !== "string") return fallback;
  const out = text.replace(/[^\p{L}\p{N} .,&'()\-]/gu, " ").replace(/\s+/g, " ");
  return out.slice(0, maxLen).trim() || fallback;
}

// --- markdown ------------------------------------------------------------------------

export function cryptoReport(sym, coin) {
  const c = "USD ";
  const price = num(coin.current_price);
  const ath = num(coin.ath);
  const rank = num(coin.market_cap_rank);
  const change = num(coin.price_change_percentage_24h);
  const fromAth = price && ath ? (price - ath) / ath : null;

  const flags = [];
  if (fromAth !== null && fromAth < -0.5) flags.push(`⚠️ ${(fromAth * 100).toFixed(0)}% from all-time high — Graham: price ≠ value; Soros: is the loop broken?`);
  if (rank !== null && rank > 100) flags.push(`⚠️ Market-cap rank #${rank} — Munger: illiquid speculation`);
  flags.push("🔴 No cash flows — Buffett/Graham: no intrinsic value to anchor a margin of safety");

  return `## 📊 Real Market Data — ${clean(coin.name, 80, sym)} (${sym})
*Source: CoinGecko — prices move fast; verify before acting on it.*

### Overview
| Field | Value |
|---|---|
| Current Price | ${fmt(price, { prefix: c })} |
| Market Cap | ${fmt(coin.market_cap, { prefix: c })} |
| Market-Cap Rank | ${rank ?? "N/A"} |
| 24h Change | ${change === null ? "N/A" : `${change.toFixed(1)}%`} |
| 24h Volume | ${fmt(coin.total_volume, { prefix: c })} |
| All-Time High | ${fmt(ath, { prefix: c })} |
| % from ATH | ${pct(fromAth)} |
| Circulating Supply | ${fmt(coin.circulating_supply, { decimals: 0 })} |
| Max Supply | ${num(coin.max_supply) ? fmt(coin.max_supply, { decimals: 0 }) : "Uncapped / N/A"} |

### 🚩 Auto-Flags for Council
${flags.map((f) => `- ${f}`).join("\n")}

---
*Council: use the real numbers above in your analysis. Reference specific metrics by name.*`;
}

export async function report(symbol, opts = {}) {
  const raw = typeof symbol === "string" ? symbol.trim() : "";
  const match = SYMBOL_RE.exec(raw);
  if (!match) {
    return "ERROR: invalid symbol — use the -USD form, e.g. BTC-USD (2-10 letters/digits before -USD). Stocks are not covered by this tool.";
  }
  const sym = raw.toUpperCase();
  try {
    const coin = await cryptoMarket(match[1], opts);
    return coin && typeof coin === "object"
      ? cryptoReport(sym, coin)
      : `ERROR: no CoinGecko data for ${sym}. Check the symbol, or look it up with web search.`;
  } catch (e) {
    // generic — don't leak internal exception detail into model context
    return e instanceof SourceError
      ? `ERROR: could not fetch ${sym} (${e.message}). Try again shortly.`
      : `ERROR: fetch failed for ${sym}.`;
  }
}
