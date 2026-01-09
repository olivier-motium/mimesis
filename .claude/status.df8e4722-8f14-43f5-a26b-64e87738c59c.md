---
status: completed
updated: 2026-01-09T22:50:00+00:00
task: Investigated Claude usage API endpoints
---

## Summary

Tested `api.anthropic.com/api/oauth/usage` - endpoint exists but rejects all auth methods (OAuth, cookies, API keys).

**Found actual usage endpoint:** `claude.ai/api/organizations/{uuid}/usage`
- Works with browser session cookies
- Returns utilization percentages (five_hour, seven_day, seven_day_sonnet)
- Also: `/api/organizations/{uuid}/rate_limits` for rate limit tier info

The unofficial `api.anthropic.com` endpoint appears reserved for future OAuth support or internal use only.
