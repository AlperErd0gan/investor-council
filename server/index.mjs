#!/usr/bin/env node
// investor-council MCP server — exposes fetch_crypto over stdio.
//
// Zero dependencies: speaks MCP's newline-delimited JSON-RPC directly so the
// plugin needs no `npm install` and pulls in no third-party code.
//
//   node server/index.mjs                         # MCP server (stdio)
//   node server/index.mjs fetch BTC-USD ETH-USD   # CLI, prints markdown

import { report, SYMBOL_RE } from "./report.mjs";
import { VERSION } from "./version.mjs";

const MAX_SYMBOLS = 10;
const MAX_LINE = 1024 * 1024;
const CALL_BUDGET_MS = 60_000; // whole tools/call, not per request (V3)
const MAX_CONCURRENT_CALLS = 4;
const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const TOOL = {
  name: "fetch_crypto",
  description:
    "Fetch live crypto market data from CoinGecko: price, market cap and rank, 24h change and " +
    "volume, all-time high and distance from it, supply. Symbols use the -USD form " +
    "(BTC-USD, ETH-USD). Returns a markdown report with auto-flags keyed to each council " +
    "member's framework. Stocks are not covered.",
  inputSchema: {
    type: "object",
    properties: {
      symbols: {
        type: "array",
        items: { type: "string", pattern: SYMBOL_RE.source },
        minItems: 1,
        maxItems: MAX_SYMBOLS,
        description: 'One or more crypto symbols, e.g. ["BTC-USD", "ETH-USD"]',
      },
    },
    required: ["symbols"],
    additionalProperties: false,
  },
};

async function fetchCrypto(args) {
  const symbols = args?.symbols;
  if (!Array.isArray(symbols) || symbols.length === 0) return { error: "ERROR: no symbols provided" };
  if (symbols.length > MAX_SYMBOLS) return { error: `ERROR: too many symbols (max ${MAX_SYMBOLS} per call)` };

  const deadline = Date.now() + CALL_BUDGET_MS;
  const parts = [];
  // sequential per call; sources.mjs also rate-limits across calls
  for (const sym of symbols) {
    parts.push(
      Date.now() >= deadline
        ? "ERROR: skipped — time budget for this call used up; retry with fewer symbols."
        : await report(sym, { deadline }),
    );
  }
  return { text: parts.join("\n\n---\n\n") };
}

// --- MCP JSON-RPC over stdio ------------------------------------------------------

// Only RpcError messages reach the client; anything else is "Internal error" (V8)
class RpcError extends Error {
  constructor(code, message) {
    super(message);
    this.rpcCode = code;
  }
}

function send(msg) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");
}

let activeCalls = 0;

async function handle(msg) {
  const { id, method, params } = msg;
  const isRequest = id !== undefined && id !== null;

  switch (method) {
    case "initialize": {
      const asked = params?.protocolVersion;
      return {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "investor-council", version: VERSION },
      };
    }
    case "ping":
      return {};
    case "tools/list":
      return { tools: [TOOL] };
    case "tools/call": {
      if (params?.name !== TOOL.name) throw new RpcError(-32602, "Unknown tool");
      if (activeCalls >= MAX_CONCURRENT_CALLS) {
        return { content: [{ type: "text", text: "ERROR: too many concurrent fetch_crypto calls; retry shortly." }], isError: true };
      }
      activeCalls++;
      let out;
      try {
        out = await fetchCrypto(params.arguments);
      } finally {
        activeCalls--;
      }
      return out.error
        ? { content: [{ type: "text", text: out.error }], isError: true }
        : { content: [{ type: "text", text: out.text }] };
    }
    default:
      if (!isRequest) return undefined; // notifications (initialized, cancelled, ...) need no reply
      throw new RpcError(-32601, "Method not found");
  }
}

const validId = (id) => typeof id === "string" || (typeof id === "number" && Number.isFinite(id));

async function onLine(line) {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return send({ id: null, error: { code: -32700, message: "Parse error" } });
  }
  if (!msg || typeof msg !== "object" || Array.isArray(msg) || typeof msg.method !== "string") {
    // responses to our (nonexistent) requests, batches, garbage: reject requests, drop the rest
    if (msg && typeof msg === "object" && "id" in msg && !("result" in msg) && !("error" in msg)) {
      send({ id: validId(msg.id) ? msg.id : null, error: { code: -32600, message: "Invalid request" } });
    }
    return;
  }

  const isRequest = msg.id !== undefined && msg.id !== null;
  if (isRequest && !validId(msg.id)) {
    return send({ id: null, error: { code: -32600, message: "Invalid request: id must be a string or number" } });
  }
  try {
    const result = await handle(msg);
    if (isRequest) send({ id: msg.id, result });
  } catch (e) {
    if (!isRequest) return;
    const error = e instanceof RpcError ? { code: e.rpcCode, message: e.message } : { code: -32603, message: "Internal error" };
    send({ id: msg.id, error });
  }
}

// Newline-delimited reader with a hard per-line byte cap. readline would
// buffer an unterminated line without limit (V2); an oversized line is
// discarded as it streams in and answered with a single error.
function serve() {
  // client went away: nothing left to do, and no stack trace on stderr (V11)
  process.stdout.on("error", () => process.exit(0));

  let chunks = [];
  let size = 0;
  let oversized = false;
  process.stdin.on("data", (buf) => {
    let start = 0;
    for (let nl = buf.indexOf(10); nl !== -1; nl = buf.indexOf(10, start)) {
      const piece = buf.subarray(start, nl);
      start = nl + 1;
      if (oversized || size + piece.length > MAX_LINE) {
        send({ id: null, error: { code: -32600, message: "Request too large" } });
      } else {
        chunks.push(piece);
        onLine(Buffer.concat(chunks).toString("utf8"));
      }
      chunks = [];
      size = 0;
      oversized = false;
    }
    const rest = buf.subarray(start);
    if (oversized) return;
    if (size + rest.length > MAX_LINE) {
      oversized = true;
      chunks = [];
      size = 0;
    } else if (rest.length) {
      chunks.push(Buffer.from(rest));
      size += rest.length;
    }
  });
  process.stdin.on("end", () => {
    if (!oversized && size) onLine(Buffer.concat(chunks).toString("utf8"));
  });
}

// --- CLI ------------------------------------------------------------------------------

async function cli(symbols) {
  if (!symbols.length) {
    console.error("Usage: investor-council-mcp fetch SYMBOL-USD [SYMBOL-USD ...]");
    process.exitCode = 1;
    return;
  }
  const out = await fetchCrypto({ symbols });
  console.log(out.error ?? out.text);
  if (out.error) process.exitCode = 1;
}

process.on("unhandledRejection", () => {
  console.error("investor-council: internal error");
  process.exitCode = 1;
});

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "fetch") cli(rest);
else if (cmd === "--version" || cmd === "-v") console.log(VERSION);
else if (cmd === undefined) serve();
else {
  console.error("Usage: investor-council-mcp [fetch SYMBOL-USD ...] | --version");
  process.exitCode = 1;
}
