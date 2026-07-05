#!/usr/bin/env bash
# Smoke test for investor-council infra (I1-I10).
# Deterministic, scriptable. Run from anywhere:
#   bash skills/investor-council/scripts/smoke_test.sh
# Exit 0 = all pass. Non-zero = count of failures.

set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FETCH="$DIR/fetch_stock.py"
RUN_MCP="$DIR/run_mcp.sh"
REQ="$DIR/requirements.txt"

PASS=0
FAIL=0
pass() { printf '  \033[32mPASS\033[0m %s\n' "$1"; PASS=$((PASS+1)); }
fail() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; FAIL=$((FAIL+1)); }

# MCP JSON-RPC message sequences
init_msg='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}'
inited_note='{"jsonrpc":"2.0","method":"notifications/initialized"}'
empty_call='{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"fetch_stock","arguments":{"tickers":[]}}}'

echo "== I1: py_compile =="
if python3 -m py_compile "$DIR"/*.py 2>/dev/null; then pass "I1 all scripts compile"; else fail "I1 compile error"; fi

echo "== I2: MCP initialize (normal env) =="
OUT=$(printf '%s\n%s\n' "$init_msg" "$inited_note" | bash "$RUN_MCP" 2>/dev/null)
RC=$?
if echo "$OUT" | grep -q '"serverInfo"' && [ $RC -eq 0 ]; then pass "I2 initialize response, exit 0"; else fail "I2 rc=$RC no serverInfo"; fi

echo "== I3: MCP initialize (stripped env, venv fallback) =="
OUT=$(printf '%s\n%s\n' "$init_msg" "$inited_note" | env -i PATH="/usr/bin:/bin" bash "$RUN_MCP" 2>/dev/null)
RC=$?
if echo "$OUT" | grep -q '"serverInfo"'; then pass "I3 venv fallback works (no -32000)"; else fail "I3 rc=$RC venv fallback broke"; fi

echo "== I4: fetch AAPL — PEG is a number =="
OUT=$(python3 "$FETCH" AAPL 2>/dev/null)
PEG=$(echo "$OUT" | grep 'PEG Ratio' | sed -E 's/.*PEG Ratio \| ([^ ]+) .*/\1/')
if [ -n "$PEG" ] && [ "$PEG" != "N/A" ]; then pass "I4 PEG=$PEG (not N/A)"; else fail "I4 PEG=$PEG"; fi

echo "== I5: fetch FAKETICKER12 — graceful error, no traceback =="
OUT=$(python3 "$FETCH" FAKETICKER12 2>&1)
if echo "$OUT" | grep -qi 'Could not fetch data' && ! echo "$OUT" | grep -q 'Traceback'; then pass "I5 graceful error"; else fail "I5 traceback or wrong msg"; fi

echo "== I6: fetch NVDA AAPL — two reports + separator =="
OUT=$(python3 "$FETCH" NVDA AAPL 2>/dev/null)
NREP=$(echo "$OUT" | grep -c 'Real Market Data')
if [ "$NREP" -eq 2 ] && echo "$OUT" | grep -qE '^\s*---\s*$'; then pass "I6 two reports + --- separator"; else fail "I6 reports=$NREP or no separator"; fi

echo "== I7: pip install --dry-run resolves =="
# prefer the repo venv's pip; system pip may refuse under PEP 668
# (externally-managed env), so mirror setup.sh's --break-system-packages
VENV_PIP="$(dirname "$FETCH")/../../../.venv/bin/pip"
if [ -x "$VENV_PIP" ]; then
  PIP_CMD=("$VENV_PIP" install --dry-run -r "$REQ")
else
  PIP_CMD=(pip3 install --dry-run --break-system-packages -r "$REQ")
fi
if "${PIP_CMD[@]}" >/dev/null 2>&1; then pass "I7 requirements resolve"; else fail "I7 dependency resolution failed"; fi

echo "== I8: MCP tools/call empty tickers — no crash =="
OUT=$(printf '%s\n%s\n%s\n' "$init_msg" "$inited_note" "$empty_call" | bash "$RUN_MCP" 2>/dev/null)
# Empty array is rejected gracefully (schema minItems:1 -> isError, or the
# call_tool "no tickers provided" guard). Either is a pass; a crash is not.
if echo "$OUT" | grep -qiE 'no tickers provided|non-empty|validation error' && ! echo "$OUT" | grep -qi 'Traceback'; then pass "I8 empty tickers handled gracefully"; else fail "I8 crash or unhandled"; fi

echo "== I9: fetch KO — dividend yield sane =="
OUT=$(python3 "$FETCH" KO 2>/dev/null)
DY=$(echo "$OUT" | grep 'Dividend Yield' | sed -E 's/.*Dividend Yield \| ([0-9.]+)%.*/\1/')
if [ -n "$DY" ] && awk "BEGIN{exit !($DY>0 && $DY<10)}"; then pass "I9 dividend yield=${DY}% (sane)"; else fail "I9 dividend yield=${DY}%"; fi

echo "== I10: fetch BTC-USD — no crash, N/A equity fields =="
OUT=$(python3 "$FETCH" BTC-USD 2>&1)
if echo "$OUT" | grep -q 'Real Market Data' && ! echo "$OUT" | grep -q 'Traceback'; then pass "I10 no crash"; else fail "I10 crash or no report"; fi

echo
printf 'RESULT: %d passed, %d failed\n' "$PASS" "$FAIL"
exit "$FAIL"
