import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const SERVER = fileURLToPath(new URL("../server/index.mjs", import.meta.url));

// Send newline-delimited JSON-RPC lines, close stdin, collect responses by id.
function rpc(lines) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("error", reject);
    child.on("close", (code) => {
      const msgs = out.split("\n").filter(Boolean).map((l) => JSON.parse(l));
      resolve({ code, msgs, byId: Object.fromEntries(msgs.map((m) => [m.id, m])) });
    });
    for (const l of lines) child.stdin.write((typeof l === "string" ? l : JSON.stringify(l)) + "\n");
    child.stdin.end();
  });
}

const init = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } } };
const inited = { jsonrpc: "2.0", method: "notifications/initialized" };
const call = (id, args, name = "fetch_crypto") => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });

test("initialize, tools/list, ping", async () => {
  const { code, msgs, byId } = await rpc([init, inited, { jsonrpc: "2.0", id: 2, method: "tools/list" }, { jsonrpc: "2.0", id: 3, method: "ping" }]);
  assert.equal(code, 0);
  assert.equal(msgs.length, 3, "notification must not get a reply");
  assert.equal(byId[1].result.protocolVersion, "2025-06-18");
  assert.equal(byId[1].result.serverInfo.name, "investor-council");
  assert.deepEqual(byId[2].result.tools.map((t) => t.name), ["fetch_crypto"]);
  assert.deepEqual(byId[3].result, {});
});

test("unknown protocol version falls back to latest supported", async () => {
  const { byId } = await rpc([{ ...init, params: { ...init.params, protocolVersion: "1999-01-01" } }]);
  assert.match(byId[1].result.protocolVersion, /^\d{4}-\d{2}-\d{2}$/);
});

test("tool errors are isError results, never crashes", async () => {
  const { code, byId } = await rpc([
    init,
    call(2, { symbols: [] }),
    call(3, { symbols: Array(11).fill("BTC-USD") }),
    call(4, { symbols: ["a;rm -rf /"] }),
    call(5, {}),
  ]);
  assert.equal(code, 0);
  assert.equal(byId[2].result.isError, true);
  assert.match(byId[2].result.content[0].text, /no symbols provided/);
  assert.match(byId[3].result.content[0].text, /too many symbols/);
  assert.match(byId[4].result.content[0].text, /invalid symbol/);
  assert.equal(byId[5].result.isError, true);
});

test("protocol errors: unknown tool, unknown method, bad JSON", async () => {
  const { byId, msgs } = await rpc([init, call(2, { symbols: ["BTC-USD"] }, "rm"), { jsonrpc: "2.0", id: 3, method: "nope" }, "{not json"]);
  assert.equal(byId[2].error.code, -32602);
  assert.equal(byId[3].error.code, -32601);
  assert.ok(msgs.some((m) => m.id === null && m.error.code === -32700));
});

test("live: BTC-USD and ETH-USD", { skip: !process.env.LIVE }, async () => {
  const { byId } = await rpc([init, call(2, { symbols: ["BTC-USD", "ETH-USD"] })]);
  const text = byId[2].result.content[0].text;
  assert.match(text, /Bitcoin \(BTC-USD\)/);
  assert.match(text, /Ethereum \(ETH-USD\)/);
  assert.match(text, /Current Price \| USD \d/);
  assert.match(text, /\n---\n/);
});
