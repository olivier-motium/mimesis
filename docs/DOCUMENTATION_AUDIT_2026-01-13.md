# Documentation Audit Report

**Date**: 2026-01-13 (Updated)
**Auditor**: Claude Code (automated exhaustive audit via /docupdate)
**Repository**: mimesis
**Audit Method**: 3 parallel exploration agents (Inventory, Coverage, Staleness)

---

## Part A: Documentation Inventory

### Overview Statistics

| Metric | Value |
|--------|-------|
| Total .md files | 128 |
| Total lines | ~168,000 |
| Entry point | `docs/index.md` |
| Broken internal links | 11+ (mostly external docs) |
| Orphaned files | 4 (identified) |
| Code documentation coverage | 34% |

### Directory Structure

**File Distribution:**
| Category | File Count | Description |
|----------|------------|-------------|
| Core Mimesis Docs | 55 | Project documentation |
| Claude Code Toolkit | 45 | External reference docs |
| External References | 28 | Logfire, PydanticAI imported docs |

```
docs/
├── index.md                    # Main hub ✅
├── getting-started.md          # Setup guide
├── cli-reference.md            # CLI flags
├── contributing.md             # Contribution guide ⚠️ (has issues)
├── ui-components.md            # UI hierarchy
├── architecture/               # System design (8 files)
│   ├── commander.md            # Commander architecture
│   ├── gateway.md              # Gateway architecture
│   ├── fleet-db.md             # SQLite schema
│   ├── session-lifecycle.md    # Session states
│   ├── knowledge-base.md       # KB architecture ✅ (exists)
│   └── configuration-reference.md ⚠️ (staleness issues)
├── api/                        # API docs (3 files)
│   ├── endpoints.md            # REST endpoints ✅ (recently updated)
│   ├── gateway-protocol.md     # WebSocket protocol
│   └── daemon-api.md           # Daemon internal API
├── guides/                     # How-to guides
│   └── testing.md              # Testing strategies
├── operations/                 # Ops docs (4 files)
│   ├── deployment.md           # Production setup ⚠️ (status file format)
│   ├── configuration.md        # Environment vars
│   └── telemetry.md            # Logfire integration
├── claude-code/                # Claude Code toolkit (45+ files)
├── Logfire_cleaned/            # Logfire KB (20+ files)
└── PydanticAI/                 # PydanticAI KB (40+ files) ⚠️ (broken links)
```

### Broken Internal Links

**External Documentation (Imported artifacts):**
| Source File | Broken Link | Issue |
|-------------|-------------|-------|
| `PydanticAI/*.md` | `../deferred-tools.md` | Non-existent in import |
| `PydanticAI/*.md` | `../agents.md` | Non-existent in import |
| `PydanticAI/*.md` | 9+ other references | Import artifacts |

**Internal Documentation:**
| Source File | Broken Link | Issue |
|-------------|-------------|-------|
| `contributing.md` | `lib/` directory reference | Directory doesn't exist |
| `architecture/gateway.md` | `#ring-buffer-implementation` | Anchor missing |
| `api/daemon-api.md` | `../lib/schema.ts` | Path incorrect |
| `guides/testing.md` | `../SPEC_5.md` | File removed |
| `claude-code/README.md` | `./commands/deploy.md` | File doesn't exist |
| `operations/configuration.md` | `#db-path` | Anchor missing |

### Orphaned Files

**Identified Orphans (not linked from any index):**
| File | Lines | Notes |
|------|-------|-------|
| `/commander-module-export.md` | 12,139 | Large export dump, should archive |
| `/docs/DOCUMENTATION_AUDIT_2026-01-13.md` | 337 | This report (expected to be standalone) |
| `/.claude/doc-audit-2026-01-13-commander.md` | 292 | Old audit, archive or remove |
| `/.claude/test-reports/fleet-commander-e2e-2026-01-12.md` | 258 | Test report, move to proper location |

**Additional Unlisted Content:**
- `docs/claude-code/commands/*.md` - Individual command docs not indexed
- `docs/PydanticAI/examples/*.md` - Example files not discoverable
- `docs/Logfire_cleaned/integrations/*.md` - Integration guides buried

---

## Part B: Structural Recommendations

### Critical Issues (P0 - Blocks Onboarding)

#### 1. Status File Format Inconsistency (CRITICAL)

**Problem**: Documentation references legacy status file format while code uses new session-scoped format.

| What Docs Say | What Code Uses |
|---------------|----------------|
| `.claude/status.md` | `.claude/status.v5.<session_id>.md` |

**Files with incorrect references**:
| File | Lines Affected |
|------|----------------|
| `docs/getting-started.md` | 48, 58, 132 |
| `docs/operations/deployment.md` | 206 |
| `docs/architecture/configuration-reference.md` | 38 |

**Fix**: Update all references to:
```
.claude/status.v5.<session_id>.md
```

#### 2. Undocumented Port 4450 (Durable Streams)

**Problem**: `server.ts` runs `DurableStreamTestServer` on port 4450, but this port is not documented in any port allocation table.

**Evidence**:
```typescript
// packages/daemon/src/server.ts
const durableServer = new DurableStreamTestServer(4450);
```

**Fix**: Either document port 4450 in configuration-reference.md port table, or remove if legacy.

#### 3. Contributing.md Wrong Directory Structure

**Problem**: `contributing.md` references a `lib/` directory structure that doesn't exist.

**Current**: References `lib/` directory
**Actual**: Code lives in `packages/daemon/src/` and `packages/ui/src/`

**Fix**: Update to reflect monorepo structure with `packages/` directory.

### Structural Improvements

#### Proposed New Structure

```
docs/
├── index.md                    # Hub (keep, expand)
├── getting-started.md          # Quick start
├── architecture/
│   ├── overview.md             # NEW: High-level system diagram
│   ├── commander.md            # Commander (update)
│   ├── gateway.md              # Gateway (update)
│   ├── session-lifecycle.md    # Sessions (good)
│   ├── fleet-db.md             # Database (good)
│   ├── knowledge-base.md       # NEW: KB system docs
│   └── configuration-reference.md
├── api/
│   ├── rest-api.md             # Rename from endpoints.md
│   ├── gateway-protocol.md     # WebSocket (good)
│   └── kb-api.md               # NEW: KB API reference
├── guides/
│   ├── testing.md              # Testing (update)
│   ├── development.md          # NEW: Dev workflow
│   └── troubleshooting.md      # NEW: Common issues
├── operations/
│   ├── deployment.md           # Production (good)
│   ├── configuration.md        # Env vars (update)
│   └── telemetry.md            # Observability (good)
├── reference/                  # NEW: Move external KBs here
│   ├── claude-code/
│   ├── pydantic-ai/
│   └── logfire/
└── archive/                    # NEW: Historical specs
    └── specs/
        ├── SPEC_1.md through SPEC_5.md
```

---

## Part C: Content Findings

### Code Coverage Analysis

**Overall Coverage**: 34% (63 of 181 source files have documentation coverage)

#### Package-Level Breakdown

| Package | Source Files | Documented | Coverage |
|---------|--------------|------------|----------|
| `packages/daemon` | 96 | 45 | 47% |
| `packages/ui` | 85 | 18 | 21% |
| **Total** | **181** | **63** | **34%** |

#### Well-Documented Areas (✅)

| Module | Documentation | Quality |
|--------|---------------|---------|
| Commander Architecture | `docs/architecture/commander.md` | Good |
| Gateway Protocol | `docs/api/gateway-protocol.md` | Good |
| Fleet DB Schema | `docs/architecture/fleet-db.md` | Good |
| Session Lifecycle | `docs/architecture/session-lifecycle.md` | Good |
| Configuration | `docs/architecture/configuration-reference.md` | Good |
| Deployment | `docs/operations/deployment.md` | Good |
| Knowledge Base | `docs/architecture/knowledge-base.md` | Good |
| REST API Endpoints | `docs/api/endpoints.md` | Recently updated |

#### Critical Undocumented Modules (P1 - High Priority)

| Module | Files | Location | Impact |
|--------|-------|----------|--------|
| **Gateway Handlers** | 5 | `packages/daemon/src/gateway/handlers/` | Core event processing |
| **Custom UI Hooks** | 10 | `packages/ui/src/hooks/` | useGateway internals, useCommanderEvents |
| **Job System** | 2 | `job-manager.ts`, `job-runner.ts` | Headless job execution |
| **Tools & Registry** | 3+ | `packages/daemon/src/tools/` | Completely undocumented |

#### Medium Priority Undocumented (P2)

| Module | Files | Location |
|--------|-------|----------|
| **Data Table Cells** | 8 | `packages/ui/src/components/cells/` |
| **Commander Components** | 3 | History, Input, StreamDisplay |
| **PTY Management** | 2 | `pty-manager.ts`, `ws-server.ts` |
| **Fleet DB Repositories** | 4+ | Repository implementations |
| **OpsTable Utilities** | 2 | Table helper functions |

### Staleness Assessment

#### Documents Requiring Update (HIGH Priority)

| Document | Issue | Severity | Line Refs |
|----------|-------|----------|-----------|
| `getting-started.md` | Status file format wrong | **CRITICAL** | 48, 58, 132 |
| `deployment.md` | Status file format wrong | **CRITICAL** | 206 |
| `configuration-reference.md` | Status file format wrong | **CRITICAL** | 38 |
| `contributing.md` | References non-existent `lib/` structure | HIGH | Multiple |
| `configuration.md` | xterm.js outdated reference | HIGH | — |

#### Documents That Are Current (Recently Updated)

| Document | Status | Notes |
|----------|--------|-------|
| `docs/index.md` | ✅ Current | Main hub well-maintained |
| `docs/architecture/knowledge-base.md` | ✅ Current | Recently created |
| `docs/api/endpoints.md` | ✅ Current | KB endpoints added |
| `docs/architecture/fleet-db.md` | ✅ Current | Schema documented |
| `docs/api/gateway-protocol.md` | ✅ Current | Protocol complete |
| `docs/operations/telemetry.md` | ✅ Current | Logfire integration |

### All Issues by Priority

#### P0 - Critical (Blocks Onboarding)

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| 1 | Status file format inconsistency | 3 docs | Update to `status.v5.<session_id>.md` |
| 2 | Port 4450 undocumented | server.ts | Document or remove DurableStreams |
| 3 | Contributing guide wrong structure | contributing.md | Update to `packages/` structure |

#### P1 - High (Major Documentation Gaps)

| # | Issue | Files Affected | Fix |
|---|-------|----------------|-----|
| 4 | Gateway handlers undocumented | 5 files | Create handler docs |
| 5 | Custom UI hooks undocumented | 10 files | Create hooks reference |
| 6 | Job system undocumented | 2 files | Document job flow |
| 7 | Tools/registry undocumented | 3+ files | Create tools docs |

#### P2 - Medium (Important Missing)

| # | Issue | Files Affected |
|---|-------|----------------|
| 8 | Data table cells undocumented | 8 files |
| 9 | Commander components undocumented | 3 files |
| 10 | PTY management internals | 2 files |
| 11 | Fleet DB repositories | 4+ files |
| 12 | OpsTable utilities | 2 files |

#### P3 - Low (Cleanup)

| # | Issue | Notes |
|---|-------|-------|
| 13 | Orphaned files (4) | Archive or link properly |
| 14 | PydanticAI broken links (11+) | External doc artifacts |
| 15 | Minor timeout wording | Configuration consistency |

---

## Part D: Proposed Index Updates

### Updated docs/index.md Quick Links

```markdown
## Quick Links

| I want to... | Read this |
|--------------|-----------|
| Get started quickly | [Getting Started](getting-started.md) |
| Run in production | [Deployment Guide](operations/deployment.md) |
| Configure the app | [Configuration Reference](architecture/configuration-reference.md) |
| Understand Commander | [Commander Architecture](architecture/commander.md) |
| Understand the Knowledge Base | [Knowledge Base System](architecture/knowledge-base.md) | ← NEW
| Understand the CLI | [CLI Reference](cli-reference.md) |
| Learn the architecture | [README](../README.md) |
| Contribute to the project | [Contributing Guide](contributing.md) |
```

### New Key Concepts Entry

```markdown
| **Knowledge Base** | Two-layer distilled project knowledge (Intent 30% / Reality 70%) for `/improve` suggestions | [KB Architecture](architecture/knowledge-base.md) |
```

### New Developer Documentation Entry

```markdown
| [Knowledge Base API](api/kb-api.md) | KB sync and query endpoints |
| [UI Hooks Reference](ui-hooks.md) | React hooks documentation | ← NEW
```

---

## Part E: Summary Statistics

### Quantitative Summary

| Metric | Current | Target | Gap |
|--------|---------|--------|-----|
| Total .md files | 128 | — | — |
| Total lines | ~168,000 | — | — |
| Documentation coverage | 34% | 80% | -46% |
| Broken internal links | 11+ | 0 | -11 |
| Identified orphans | 4 | 0 | -4 |
| Stale documents | 5 | 0 | -5 |
| Critical issues | 3 | 0 | -3 |
| High priority gaps | 4 | 0 | -4 |

### Issues by Severity

| Severity | Count | Status |
|----------|-------|--------|
| P0 - Critical | 3 | Action required |
| P1 - High | 4 | Should address soon |
| P2 - Medium | 5 | Queue for future |
| P3 - Low | 3 | Nice to have |
| **Total** | **15** | |

### Priority Action Items

#### Immediate (P0 - Critical)

- [ ] **Fix status file format** in `getting-started.md:48,58,132`, `deployment.md:206`, `configuration-reference.md:38`
- [ ] **Document or remove port 4450** (DurableStreams)
- [ ] **Update contributing.md** - Remove `lib/` references, use `packages/` structure

#### High Priority (P1)

- [ ] **Create gateway handlers docs** - 5 handler files undocumented
- [ ] **Create UI hooks reference** - 10 hooks undocumented
- [ ] **Document job system** - job-manager.ts, job-runner.ts
- [ ] **Document tools/registry** - completely missing

#### Medium Priority (P2)

- [ ] **Document data table cells** - 8 cell renderers
- [ ] **Document Commander components** - History, Input, StreamDisplay
- [ ] **Document PTY internals** - pty-manager.ts, ws-server.ts
- [ ] **Document Fleet DB repos** - repository implementations
- [ ] **Document OpsTable utils** - table helpers

#### Low Priority (P3)

- [ ] **Archive orphaned files** - 4 identified
- [ ] **Consider PydanticAI cleanup** - 11+ broken external links
- [ ] **Consistency pass** - timeout wording

### Files Status

#### Already Good ✅

| File | Notes |
|------|-------|
| `docs/index.md` | Hub well-maintained |
| `docs/architecture/knowledge-base.md` | Recently created |
| `docs/api/endpoints.md` | KB endpoints added |
| `docs/architecture/fleet-db.md` | Schema complete |
| `docs/api/gateway-protocol.md` | Protocol documented |

#### Need Updates ⚠️

| File | Changes | Priority |
|------|---------|----------|
| `docs/getting-started.md` | Fix status file format | P0 |
| `docs/operations/deployment.md` | Fix status file format | P0 |
| `docs/architecture/configuration-reference.md` | Fix status file format, add port 4450 | P0 |
| `docs/contributing.md` | Fix directory structure | P0 |
| `docs/operations/configuration.md` | Update xterm.js reference | P1 |

#### Need Creation 🆕

| File | Purpose | Priority |
|------|---------|----------|
| `docs/architecture/gateway-handlers.md` | Handler documentation | P1 |
| `docs/ui-hooks.md` | UI hooks reference | P1 |
| `docs/architecture/job-system.md` | Job execution flow | P1 |
| `docs/architecture/tools-registry.md` | Tools system | P1 |

---

## Appendix: Audit Methodology

### Audit Execution

This audit was performed using **3 parallel exploration agents** via the `/docupdate` command:

| Agent | Role | Findings |
|-------|------|----------|
| **Inventory Agent** | Count files, map structure, validate links | 128 files, 11+ broken links |
| **Coverage Agent** | Compare code modules to docs | 34% coverage (181 files, 63 documented) |
| **Staleness Agent** | Cross-reference docs with implementation | 3 critical, 2 high issues |

### Verification Checklist

- [x] Every top-level directory checked for .md files
- [x] Every .md file cataloged (128 total)
- [x] Internal links validated
- [x] Code coverage analyzed (34%)
- [x] Staleness issues identified (3 critical, 2 high)
- [x] Concrete fixes provided with line references

### Tools & Approach

```bash
# File inventory
find . -name "*.md" -not -path "./node_modules/*" | wc -l

# Link validation
grep -rn "\]\(" docs/ | grep "\.md"

# Code coverage
find packages -name "*.ts" -not -path "*/node_modules/*" | wc -l
```

---

*Generated by `/docupdate` command - Claude Code automated documentation audit*
*Audit completed: 2026-01-13*
