// Data source: CoinGecko public API (crypto). Free and keyless.
// Only this fixed host is ever contacted; user input is validated before it
// reaches a URL, so there is no SSRF surface.

import { VERSION } from "./version.mjs";

const TIMEOUT_MS = 15_000;
const MAX_BYTES = 2 * 1024 * 1024; // a markets response is a few KB
const UA = `investor-council-mcp/${VERSION}`;

// CoinGecko's public tier allows roughly 30 calls/minute; stay polite however
// many tool calls run in parallel (V3).
const MAX_INFLIGHT = 2;
const MIN_GAP_MS = 500;

export class SourceError extends Error {}

// --- request limiter -----------------------------------------------------------

let inflight = 0;
let nextSlot = 0;
const waiters = [];

async function acquire() {
  while (inflight >= MAX_INFLIGHT) await new Promise((r) => waiters.push(r));
  inflight++;
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_GAP_MS;
  if (wait) await new Promise((r) => setTimeout(r, wait));
}

function release() {
  inflight--;
  waiters.shift()?.();
}

// --- HTTP ------------------------------------------------------------------------

// Stream the body and stop at MAX_BYTES, so a chunked response without
// Content-Length can't make us buffer an unbounded amount (V5).
async function readCapped(res) {
  if (Number(res.headers.get("content-length") || 0) > MAX_BYTES) {
    throw new SourceError("upstream response too large");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BYTES) {
      await reader.cancel().catch(() => {});
      throw new SourceError("upstream response too large");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

async function getJSON(url, { deadline = Infinity } = {}) {
  await acquire();
  try {
    const timeout = Math.min(TIMEOUT_MS, deadline - Date.now());
    if (timeout <= 0) throw new SourceError("time budget exceeded");

    let text;
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": UA },
        signal: AbortSignal.timeout(timeout),
        redirect: "error",
      });
      if (res.status === 404) {
        await res.body?.cancel().catch(() => {});
        return null;
      }
      if (!res.ok) throw new SourceError(`upstream returned HTTP ${res.status}`);
      text = await readCapped(res);
    } catch (e) {
      if (e instanceof SourceError) throw e;
      throw new SourceError("network error or timeout");
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new SourceError("upstream returned non-JSON");
    }
  } finally {
    release();
  }
}

// --- CoinGecko ---------------------------------------------------------------

export async function cryptoMarket(symbol, opts) {
  const sym = encodeURIComponent(symbol.toLowerCase());
  const rows = await getJSON(
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&symbols=${sym}`,
    opts,
  );
  if (!Array.isArray(rows) || rows.length === 0) return null;
  // symbols are not unique on CoinGecko; the largest market cap is the one people mean
  return rows.reduce((a, b) => ((b?.market_cap || 0) > (a?.market_cap || 0) ? b : a));
}
