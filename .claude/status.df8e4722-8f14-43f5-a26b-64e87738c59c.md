---
status: completed
updated: 2026-01-09T22:25:00+00:00
task: Deep investigation of Factory vs Claude Max pricing
---

## Summary

Completed first-principles investigation into whether Factory's cache billing "adds up" (seemed too good to be true).

### Key Findings

1. **Factory's "cached tokens at 1/10th"** is ambiguous - doesn't specify if it means Anthropic's cache tokens
2. **CEO Matan's correction** ("4M tokens ≠ $2.6k") only makes mathematical sense if cache is EXCLUDED from billing
3. **Factory's business model**:
   - Enterprise/wholesale pricing from Anthropic (est. 50-70% off)
   - Context compression reduces tokens processed
   - Cache reads already cheap ($0.50/MTok) become nearly free at volume

### Your Numbers

| Metric | Value |
|--------|-------|
| Current (2× Claude Max) | $400/month |
| Factory Pro (likely) | $20/month |
| Savings | $380/month = $4,560/year |

### Conclusion

The math likely DOES add up. Factory arbitrages enterprise pricing + cache economics. Low-moderate risk (venture-backed, real users, CEO response validates assumptions).

Updated `usage_final.md` with complete analysis and sources.
