// Regression tests for docs/SECURITY-AUDIT.md — one block per finding.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { report } from "../server/report.mjs";

const SERVER = fileURLToPath(new URL("../server/index.mjs", import.meta.url));
const SKILL = readFileSync(new URL("../skills/investor-council/SKILL.md", import.meta.url), "utf8");
const WORKFLOWS = ["ci.yml", "publish.yml"].map((f) => readFileSync(new URL(`../.github/workflows/${f}`, import.meta.url), "utf8"));

function rpcRaw(chunks) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SERVER], { stdio: ["pipe", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("close", () => resolve(out.split("\n").filter(Boolean).map((l) => JSON.parse(l))));
    for (const c of chunks) child.stdin.write(c);
    child.stdin.end();
  });
}
const line = (o) => JSON.stringify(o) + "\n";
const init = line({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });

async function withFetch(fake, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = fake;
  try {
    return await fn();
  } finally {
    globalThis.fetch = real;
  }
}

test("V1: pandoc export disables raw TeX/HTML and runs sandboxed", () => {
  const cmds = SKILL.split("\n").filter((l) => /^\s*pandoc /.test(l));
  assert.ok(cmds.length > 0);
  for (const c of cmds) assert.match(c, /-f markdown-raw_tex-raw_html-raw_attribute --sandbox/);
});

test("V2: oversized line is dropped without buffering, server keeps serving", async () => {
  const big = "x".repeat(3 * 1024 * 1024);
  const msgs = await rpcRaw([big.slice(0, 1e6), big.slice(1e6), "\n", init]);
  assert.equal(msgs[0].error.message, "Request too large");
  assert.equal(msgs[1].result.serverInfo.name, "investor-council");
});

test("V3: upstream concurrency is capped across parallel reports", async () => {
  let inflight = 0;
  let peak = 0;
  await withFetch(
    async () => {
      peak = Math.max(peak, ++inflight);
      await new Promise((r) => setTimeout(r, 30));
      inflight--;
      return new Response("{}", { status: 404 });
    },
    () => Promise.all(Array.from({ length: 6 }, (_, i) => report(`CONC${i}-USD`))),
  );
  assert.ok(peak <= 2, `peak ${peak}`);
});

test("V3: expired call budget fails fast instead of hanging", async () => {
  const out = await withFetch(
    () => assert.fail("must not fetch past the deadline"),
    () => report("DEADLN-USD", { deadline: Date.now() - 1 }),
  );
  assert.match(out, /time budget exceeded/);
});

test("V5: chunked body over the cap is aborted mid-stream", async () => {
  let pulled = 0;
  const out = await withFetch(
    async () =>
      new Response(
        new ReadableStream({
          pull(c) {
            pulled++;
            c.enqueue(new Uint8Array(512 * 1024));
          },
        }),
        { status: 200 },
      ),
    () => report("HUGE-USD"),
  );
  assert.match(out, /too large/);
  assert.ok(pulled < 8, `read ${pulled} chunks`);
});

test("V6: WebSearch is not pre-approved; V7: fallback args are single-quoted", () => {
  const allowed = /^allowed-tools: "(.*)"$/m.exec(SKILL)[1];
  assert.ok(!allowed.includes("WebSearch"));
  assert.ok(!/\bBash\b/.test(allowed) && !/\bRead\b/.test(allowed));
  for (const l of SKILL.split("\n").filter((l) => / fetch '/.test(l) || / fetch "/.test(l) || / fetch [A-Z]/.test(l))) {
    assert.doesNotMatch(l, /fetch "|fetch [A-Z]/, l);
  }
});

test("V8: unknown tool name is not reflected; V9: non-scalar ids rejected", async () => {
  const msgs = await rpcRaw([
    init,
    line({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "<script>evil</script>", arguments: {} } }),
    line({ jsonrpc: "2.0", id: { x: 1 }, method: "ping" }),
    line({ jsonrpc: "2.0", id: [1], method: "ping" }),
  ]);
  const byId = Object.fromEntries(msgs.filter((m) => m.id !== null).map((m) => [m.id, m]));
  assert.equal(byId[2].error.message, "Unknown tool");
  const nullIds = msgs.filter((m) => m.id === null);
  assert.equal(nullIds.length, 2);
  for (const m of nullIds) assert.equal(m.error.code, -32600);
});

test("V10: __proto__ argument keys are inert", async () => {
  const msgs = await rpcRaw([
    init,
    '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"fetch_crypto","arguments":{"__proto__":{"symbols":["BTC-USD"]},"constructor":5}}}\n',
  ]);
  assert.match(msgs[1].result.content[0].text, /no symbols provided/);
});

test("V12: workflow actions pinned to commit SHAs, npm not @latest", () => {
  for (const wf of WORKFLOWS) {
    for (const [, ref] of wf.matchAll(/uses: [\w./-]+@(\S+)/g)) assert.match(ref, /^[0-9a-f]{40}$/);
    assert.ok(!wf.includes("@latest"));
  }
});

test("V13: HTML export requires a restrictive CSP", () => {
  assert.ok(SKILL.includes(`content="default-src 'none'; style-src 'unsafe-inline'"`));
});
