---
status: completed
updated: 2026-01-11T11:58:00Z
task: Fleet Commander v4 specification
---

## Summary
Wrote comprehensive Fleet Commander v4 spec using headless `claude -p` architecture instead of subagents. Includes: queue-based commit detection, runner daemon, JSON schema for structured output, analyst.settings.json with permission enforcement, and Commander startup hook.

Committed and pushed to main (e2916b3).

## Key Changes from V3
- Subagents → headless `claude -p --model sonnet`
- Hope-based execution → deterministic queue + runner
- Trust model → `defaultMode: "dontAsk"` enforcement
- Markdown output → `--json-schema` contract

## Next Steps
- Implement Phase 1: Create directory structure and hooks
- Test runner with manual queue entries
- Set up launchd service for runner daemon
