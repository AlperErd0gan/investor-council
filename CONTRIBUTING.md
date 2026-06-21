# Contributing to Investor Council

## Adding a New Investor

1. Add their entry to `skills/investor-council/references/investor-profiles.md` following the existing format:
   - Philosophy (one paragraph)
   - Core frameworks (named tools/ratios they actually used)
   - What they ask first (their signature opening question)
   - What they avoid (specific, not generic)
   - Voice (how they sound, what analogies they use)
   - Signature phrases (verbatim quotes only — no invented lines)

2. Add a row to the council summary table in `skills/investor-council/SKILL.md`

3. Add them to the Ghost Warnings table if they were involved in a notable blowup or publicly warned about one

4. Add them to the Commands section if their name should work as a single deep-dive trigger

5. Update `README.md` council member table

## Adding a Ghost Warning

Ghost warnings must match a **real historical event** with a documented pattern. Format:

```
| Pattern in the idea | Ghost to invoke |
| Leverage + [specific context] | [Event year] — "[one-sentence lesson in quotes]" |
```

Only add if the pattern is specific enough to trigger on real ideas — not on every mention of leverage.

## Adding an Example

Run the command yourself via `claude --plugin-dir . -p --output-format text`, copy the actual output, save to `skills/investor-council/examples/[topic].md`. No invented examples.

## Ground Rules

- No invented investor quotes — only documented public statements
- No financial advice in examples or instructions
- Disclaimer block must remain on every response — do not remove or shorten it
- Keep SKILL.md under 5,000 words — move detail to `references/`
- All PRs must include a live-tested example of the change working

## Disclaimer

All contributions must maintain the educational simulation framing. This project does not constitute financial advice. See `DISCLAIMER.md` for the full legal disclaimer that applies to all contributions.
