# Investor Council — Claude Code Skill

Convene a panel of legendary investors to analyze your investment ideas. Each council member
responds in character, applying their own philosophy and mental models to your specific idea.

> **This is an educational simulation only. Not financial advice.**

## Council Members

| Investor | Philosophy | Key Lens |
|---|---|---|
| Warren Buffett | Value investing | Moats, earnings power, long-term |
| Peter Lynch | GARP | "Invest in what you know", PEG ratio |
| Benjamin Graham | Deep value | Margin of safety, book value |
| George Soros | Macro / reflexivity | Global flows, asymmetric bets |
| Ray Dalio | All-weather macro | Debt cycles, diversification |
| Cathie Wood | Disruptive innovation | 5-year exponential growth curves |
| Charlie Munger | Mental models | Inversion, circle of competence |

## Install

```bash
claude plugin install github:alperer09/investor-council
```

## Usage

```
/investor-council Apple stock — is it a buy at current valuations?

/investor-council buffett What does Buffett think about investing in Bitcoin?

/investor-council compare Index funds vs. active stock picking
```

## Examples

**Input:** `/investor-council NVIDIA at current P/E of 35x`

**Output:**
- **Buffett:** Evaluates the moat in GPU/AI infrastructure, questions paying 35x for cyclical semiconductor demand...
- **Lynch:** Excited about the AI "tenbagger" narrative but checks PEG and growth sustainability...
- **Graham:** Flags 35x P/E as dangerously above margin-of-safety thresholds...
- **Soros:** Sees the AI narrative as reflexive — self-fulfilling until it isn't...
- **Dalio:** Checks NVIDIA's place in the current debt/innovation cycle...
- **Wood:** Highest conviction — compounding AI compute demand justifies premium...
- **Munger:** Asks what the business looks like in 10 years if the AI wave plateaus...
- **Council Consensus:** broad agreement on moat quality, disagreement on valuation tolerance...

## Disclaimer

This skill role-plays famous investors based on their **publicly known philosophies, books, and
interviews**. The simulated perspectives are educational approximations, not actual advice from
these individuals or their firms. The real investors may hold views different from what is
simulated here.

**Always consult a licensed financial advisor before making investment decisions.**

## License

MIT
