---
status: completed
updated: 2026-01-12T09:34:00Z
task: Investigate and test Claude headless authentication
---

## Summary
Tested Commander without ANTHROPIC_API_KEY - it works! Since user has no API credits, this confirms headless mode (`claude -p`) IS using OAuth/Max subscription in Claude Code v2.1.5.

## Key Finding (Updated)
Previous GitHub issues about headless OAuth not working may be outdated. Testing confirms:
- Commander works without ANTHROPIC_API_KEY
- No API credits on Console account → would fail if using API billing
- Therefore headless mode uses OAuth/Max subscription ✓

The earlier API costs were likely from when ANTHROPIC_API_KEY was set in the environment, causing headless mode to prefer API over OAuth.
