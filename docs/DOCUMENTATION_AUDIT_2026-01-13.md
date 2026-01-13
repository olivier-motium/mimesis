# Documentation Audit Report

**Date**: 2026-01-13
**Auditor**: Claude Code (automated exhaustive audit)
**Repository**: mimesis

---

## Part A: Documentation Inventory

### Overview Statistics

| Metric | Value |
|--------|-------|
| Total .md files | 112 |
| Total lines | 149,128 |
| Entry point | `docs/index.md` |
| Broken internal links | 6 |
| Orphaned files | 15 |

### Directory Structure

```
docs/
├── index.md                    # Main hub (119 lines) ✅
├── getting-started.md          # Setup guide
├── cli-reference.md            # CLI flags
├── contributing.md             # Contribution guide
├── ui-components.md            # UI hierarchy
├── architecture/               # System design (7 files)
│   ├── commander.md            # Commander architecture
│   ├── gateway.md              # Gateway architecture
│   ├── fleet-db.md             # SQLite schema
│   ├── session-lifecycle.md    # Session states
│   └── configuration-reference.md
├── api/                        # API docs (3 files)
│   ├── endpoints.md            # REST endpoints
│   ├── gateway-protocol.md     # WebSocket protocol
│   └── daemon-api.md           # Daemon internal API
├── guides/                     # How-to guides
│   └── testing.md              # Testing strategies
├── operations/                 # Ops docs (4 files)
│   ├── deployment.md           # Production setup
│   ├── configuration.md        # Environment vars
│   └── telemetry.md            # Logfire integration
├── claude-code/                # Claude Code toolkit (16+ files)
├── Logfire_cleaned/            # Logfire KB (20+ files)
└── PydanticAI/                 # PydanticAI KB (40+ files)
```

### Broken Internal Links

| Source File | Broken Link | Issue |
|-------------|-------------|-------|
| `contributing.md` | `lib/` directory reference | Directory doesn't exist |
| `architecture/gateway.md` | `#ring-buffer-implementation` | Anchor missing |
| `api/daemon-api.md` | `../lib/schema.ts` | Path incorrect |
| `guides/testing.md` | `../SPEC_5.md` | File removed |
| `claude-code/README.md` | `./commands/deploy.md` | File doesn't exist |
| `operations/configuration.md` | `#db-path` | Anchor missing |

### Orphaned Files (Not linked from index)

1. `docs/archive/` - Old specs and deprecated docs
2. `docs/claude-code/commands/*.md` - Individual command docs not indexed
3. `docs/PydanticAI/examples/*.md` - Example files not discoverable
4. `docs/Logfire_cleaned/integrations/*.md` - Integration guides buried
5. `SPEC_1.md` through `SPEC_5.md` - Historical specs (should be archived)

---

## Part B: Structural Recommendations

### Critical Issues

#### 1. Status File Format Inconsistency (CRITICAL)

**Problem**: Documentation references two different status file formats:
- Some docs: `.claude/status.md` (legacy format)
- Other docs: `.claude/status.v5.<session_id>.md` (current format)

**Files with outdated references**:
- `docs/architecture/commander.md` - Mixed references
- `docs/contributing.md` - References old format
- `CLAUDE.md` - May have outdated references

**Fix**: Standardize all documentation to reference the current session-scoped format:
```
.claude/status.v5.<session_id>.md
```

#### 2. Node.js Version Mismatch

**Problem**:
- `docs/*.md`: States "Node.js 22+"
- `package.json` engines: Allows ">=20.19.0"

**Fix**: Align documentation with actual package.json constraint or update package.json.

#### 3. Missing lib/ Directory References

**Problem**: `contributing.md` references a `lib/` directory structure that doesn't exist.

**Fix**: Update to reflect actual `packages/daemon/src/` structure.

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

### Coverage Analysis

**Overall Coverage**: ~40% (critical modules documented, many gaps)

#### Well-Documented Areas (✅)

| Module | Documentation | Quality |
|--------|---------------|---------|
| Commander Architecture | `docs/architecture/commander.md` | Good |
| Gateway Protocol | `docs/api/gateway-protocol.md` | Good |
| Fleet DB Schema | `docs/architecture/fleet-db.md` | Good |
| Session Lifecycle | `docs/architecture/session-lifecycle.md` | Good |
| Configuration | `docs/architecture/configuration-reference.md` | Good |
| Deployment | `docs/operations/deployment.md` | Good |

#### Undocumented Modules (❌)

| Module | Location | Priority |
|--------|----------|----------|
| **Knowledge Base System** | `packages/daemon/src/api/routes/kb.ts`, `packages/ui/src/components/fleet-command/KBPanel.tsx` | **HIGH** |
| **Ring Buffer** | `packages/daemon/src/gateway/ring-buffer.ts` | HIGH |
| **Event Merger** | `packages/daemon/src/gateway/event-merger.ts` | HIGH |
| **Stream Parser** | `packages/daemon/src/gateway/stream-parser.ts` | HIGH |
| **UI Hooks** | `packages/ui/src/hooks/` (12 files) | MEDIUM |
| **Telemetry Module** | `packages/daemon/src/telemetry/` | MEDIUM |
| **Status Machine** | `packages/daemon/src/status-machine.ts` | MEDIUM |

### Staleness Assessment

#### Documents Requiring Update

| Document | Issue | Severity |
|----------|-------|----------|
| `contributing.md` | References non-existent `lib/` structure | HIGH |
| `CLAUDE.md` | May reference old status file format | MEDIUM |
| `docs/architecture/commander.md` | Incomplete KB section | HIGH |
| `docs/architecture/gateway.md` | Missing ring buffer docs | MEDIUM |
| `docs/api/endpoints.md` | Missing KB endpoints | HIGH |
| `docs/operations/configuration.md` | Missing KB-related env vars | MEDIUM |

#### Documents That Are Current

| Document | Last Major Update | Status |
|----------|-------------------|--------|
| `docs/index.md` | Recent | ✅ Current |
| `docs/architecture/fleet-db.md` | Recent | ✅ Current |
| `docs/api/gateway-protocol.md` | Recent | ✅ Current |
| `docs/operations/telemetry.md` | Recent | ✅ Current |

### Gap Analysis

#### High-Priority Documentation Gaps

1. **Knowledge Base System** - Completely undocumented new feature
   - Architecture: Two-layer model (Intent 30% / Reality 70%)
   - API: `/kb/projects`, `/kb/stats`, `/kb/sync`
   - UI: KBPanel component
   - Commands: `/knowledge-sync`, `/kb`, `/improve`

2. **Gateway Internal Components** - Only high-level docs exist
   - Ring buffer implementation
   - Event merger logic
   - Stream parser details
   - PTY bridge internals

3. **UI Hook Documentation** - 12 hooks with no docs
   - `useGateway.ts` - Mentioned but not detailed
   - `useKBState.ts` - New, undocumented
   - `useFleetContext.ts` - Undocumented
   - `useTimelineVirtualization.ts` - Undocumented
   - etc.

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

| Metric | Current | Target |
|--------|---------|--------|
| Documentation coverage | ~40% | 80% |
| Broken internal links | 6 | 0 |
| Orphaned files | 15 | 0 |
| Stale documents | 6 | 0 |
| Missing module docs | 7 | 0 |

### Priority Action Items

#### Immediate (This Sprint)

1. [ ] **Fix status file format inconsistency** - Standardize to `status.v5.<session_id>.md`
2. [ ] **Update contributing.md** - Remove `lib/` references
3. [ ] **Create knowledge-base.md** - Document new KB system
4. [ ] **Update endpoints.md** - Add KB API endpoints
5. [ ] **Fix 6 broken internal links**

#### Short-Term (Next 2 Weeks)

6. [ ] **Document gateway internals** - Ring buffer, event merger, stream parser
7. [ ] **Create UI hooks reference** - Document all 12 hooks
8. [ ] **Update commander.md** - Complete KB integration section
9. [ ] **Archive old specs** - Move SPEC_1-5 to archive/

#### Long-Term (Ongoing)

10. [ ] **Establish doc review cadence** - Monthly freshness check
11. [ ] **Add doc coverage to CI** - Lint for broken links
12. [ ] **Create architecture overview** - High-level system diagram

### Files to Create

| New File | Purpose | Priority |
|----------|---------|----------|
| `docs/architecture/knowledge-base.md` | KB system architecture | HIGH |
| `docs/api/kb-api.md` | KB API reference | HIGH |
| `docs/ui-hooks.md` | UI hooks documentation | MEDIUM |
| `docs/guides/development.md` | Developer workflow | LOW |
| `docs/guides/troubleshooting.md` | Common issues | LOW |

### Files to Update

| File | Changes Needed | Priority |
|------|----------------|----------|
| `docs/index.md` | Add KB links, fix structure | HIGH |
| `docs/contributing.md` | Remove lib/ refs, update structure | HIGH |
| `docs/architecture/commander.md` | Complete KB section | HIGH |
| `docs/api/endpoints.md` | Add KB endpoints | HIGH |
| `CLAUDE.md` | Verify status file format | MEDIUM |
| `docs/architecture/gateway.md` | Add internal component docs | MEDIUM |

---

## Appendix: Audit Methodology

This audit was performed using three parallel exploration agents:

1. **Inventory Agent** - Counted files, measured lines, validated links
2. **Coverage Agent** - Compared code modules to documentation
3. **Staleness Agent** - Cross-referenced docs with actual implementation

### Commands Used

```bash
# File inventory
find docs -name "*.md" | wc -l
find . -name "*.md" -not -path "./node_modules/*" | xargs wc -l

# Link validation
grep -r "\]\(" docs/ | grep "\.md" | # manual validation

# Code coverage
find packages -name "*.ts" -not -path "*/node_modules/*" | # vs docs index
```

---

*Generated by /docupdate command - Claude Code automated documentation audit*
