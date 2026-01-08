# AI Summarizer Service

The summarizer generates AI-powered content for sessions using Claude Sonnet.

## Overview

Each session gets two pieces of AI-generated content:

| Content | Purpose | Caching |
|---------|---------|---------|
| **Goal** | High-level objective (e.g., "Adding dark mode support") | Cached by sessionId |
| **Summary** | Current activity (e.g., "Editing theme.ts, ran tests") | Regenerated each update |

---

## API

**Location:** `packages/daemon/src/summarizer/`

Module structure:

| File | Purpose |
|------|---------|
| `index.ts` | Public exports |
| `summarizer.ts` | Main `generateAISummary`, `generateGoal` |
| `context-extraction.ts` | `extractContext`, `extractEarlyContext` |
| `summaries.ts` | `getWorkingSummary`, `getFallbackSummary` |
| `cache.ts` | LRU cache with TTL eviction |
| `text-utils.ts` | `cleanGoalText` |

### `generateGoal(sessionState)`

Generates a concise goal for the session based on the original prompt and context.

```typescript
import { generateGoal } from './summarizer';

const goal = await generateGoal(sessionState);
// Returns: "Implementing user authentication"
```

**Caching:** Goals are cached by `sessionId` since a session's goal doesn't change.

### `generateAISummary(sessionState)`

Generates a summary of current session activity.

```typescript
import { generateAISummary } from './summarizer';

const summary = await generateAISummary(sessionState);
// Returns: "Reading auth.ts, planning OAuth integration"
```

**Caching:** Not cached - regenerated on each session update for freshness.

---

## How It Works

1. **Input**: Session state including entries, original prompt, and recent activity
2. **Processing**: Sends context to Claude Sonnet API
3. **Output**: Concise, actionable text describing goal/activity

### Goal Generation

The goal is derived from:
- Original user prompt
- First few assistant responses
- Working directory context

Goals are stable - once generated, they persist for the session.

### Summary Generation

Summaries are derived from:
- Recent tool uses (Edit, Read, Bash, etc.)
- Latest assistant text output
- Current session status

Summaries update frequently to reflect current work.

---

## Queue System

Summarization requests are queued to prevent API rate limiting.

**Behavior:**
- Requests are processed with controlled concurrency
- Failed requests are retried with exponential backoff
- Queue ensures fair processing across sessions

---

## Configuration

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude API key (required) |

### Model Used

- **Model**: Claude Sonnet (fast, cost-effective)
- **Max tokens**: Configured for concise responses
- **Temperature**: Low for consistent output

---

## Integration

The summarizer is called from `server.ts` when publishing session updates:

```typescript
// In server.ts publishSession()
const [goal, summary] = await Promise.all([
  generateGoal(sessionState),
  generateAISummary(sessionState),
]);
```

Both calls are parallelized for efficiency.

---

## Caching Strategy

### Why Cache Goals?

1. **Stability**: Session goals don't change mid-session
2. **Cost**: Reduces API calls
3. **Speed**: Cached goals return instantly

### Why Not Cache Summaries?

1. **Freshness**: Activity changes frequently
2. **Relevance**: Stale summaries are confusing
3. **Value**: Users expect current status

### Cache Invalidation

- Cache is in-memory only
- Cleared on daemon restart
- No TTL (goals persist for session lifetime)
