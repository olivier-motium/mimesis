# Contributing to Mimesis

Guidelines for contributing to the Mimesis project.

## Development Setup

### Prerequisites

- Node.js 22+
- pnpm 10.x (not npm or yarn)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd mimesis

# Install dependencies
pnpm install

# Start development servers
pnpm start  # Runs both daemon and UI
```

### Running Separately

```bash
# Daemon only (REST API port 4451, Gateway port 4452)
pnpm serve

# UI dev server only (port 5173)
pnpm dev
```

---

## Project Structure

```
mimesis/
├── packages/
│   ├── daemon/          # Backend: file watcher, Gateway, REST API
│   │   ├── src/
│   │   │   ├── api/     # REST API routes (Hono)
│   │   │   ├── config/  # Configuration modules
│   │   │   ├── gateway/ # WebSocket Gateway server
│   │   │   ├── db/      # Database (Drizzle + SQLite)
│   │   │   └── lib/     # Core library (parser, watcher, status)
│   │   └── test/        # Tests (Vitest)
│   └── ui/              # Frontend: React + TanStack
│       ├── src/
│       │   ├── components/  # UI components
│       │   ├── hooks/       # React hooks
│       │   ├── lib/         # Utilities
│       │   └── routes/      # TanStack Router file routes
│       └── public/          # Static assets
├── docs/                # Documentation
└── CLAUDE.md           # AI assistant guidelines
```

---

## Code Style

### TypeScript

- **Strict mode required** - All TypeScript must pass strict type checking
- **No `any`** - Use type assertions with justifying comments if unavoidable
- **Explicit types** - Annotate function parameters and return types

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files (routes) | kebab-case | `session-manager.ts` |
| Files (utilities) | camelCase | `statusWatcher.ts` |
| Classes/Enums | PascalCase | `SessionStore` |
| Constants | UPPER_SNAKE_CASE | `IDLE_TIMEOUT_MS` |
| Functions/Variables | camelCase | `parseSession` |

### Imports

```typescript
// Order: node builtins → third-party → local
import { readFile } from "node:fs/promises";
import { Hono } from "hono";
import { parseSession } from "../lib/parser";
```

### Formatting

- Prettier handles all formatting
- Run on save (configure your editor)
- No manual formatting debates

---

## Testing

### Running Tests

```bash
cd packages/daemon
pnpm test        # Run all tests
pnpm test:watch  # Watch mode
```

### Test Guidelines

- Tests define correct behavior - code is disposable, tests are truth
- Name test files `*.test.ts`
- Use descriptive test names that explain the behavior
- Mock external dependencies (file system, network)

---

## Commit Messages

Use conventional commit format:

```
<type>(<scope>): <description>

[optional body]
```

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation only
- `refactor` - Code change that neither fixes nor adds
- `test` - Adding or updating tests
- `chore` - Maintenance tasks

**Examples:**
```
feat(gateway): add session compaction detection
fix(watcher): handle partial JSONL lines correctly
docs(api): add gateway protocol reference
```

---

## Pull Request Process

1. **Fork and branch** - Create a feature branch from main
2. **Implement** - Make your changes following code style guidelines
3. **Test** - Ensure all tests pass (`pnpm test`)
4. **Type check** - Ensure TypeScript compiles (`pnpm build`)
5. **Document** - Update relevant documentation if needed
6. **PR** - Open a pull request with clear description

### PR Checklist

- [ ] Tests pass
- [ ] TypeScript compiles without errors
- [ ] Code follows style guidelines
- [ ] Documentation updated (if applicable)
- [ ] Commit messages follow convention

---

## Architecture Guidelines

### Core Principles

1. **Clarity Over Cleverness** - Explicit, obvious code over clever shortcuts
2. **Locality Over Abstraction** - Self-contained modules over deep inheritance
3. **Compose Small Units** - Single-purpose modules with clear interfaces
4. **Stateless by Default** - Pure functions where possible, side effects at edges
5. **Fail Fast & Loud** - Surface errors to handlers, no silent catches

### Adding New Features

1. Check existing architecture in `docs/architecture/`
2. Follow established patterns in similar modules
3. Add configuration to appropriate config module
4. Document public APIs in `docs/api/`
5. Add tests for new functionality

### Database Changes

1. Create migration in `packages/daemon/src/db/migrations/`
2. Update schema types
3. Document schema changes in `docs/architecture/fleet-db.md`

---

## Documentation

### When to Update Docs

- New features need documentation
- API changes require endpoint docs updates
- Architecture changes need architecture docs updates
- Configuration changes need config reference updates

### Documentation Structure

- `docs/` - Main documentation
- `docs/api/` - API reference (REST, WebSocket)
- `docs/architecture/` - System design docs
- `docs/operations/` - Deployment and ops guides

---

## Getting Help

- Check existing documentation in `docs/`
- Review `CLAUDE.md` for project conventions
- Look at similar code for patterns
- Open an issue for questions

---

## Related Documentation

- [Getting Started](getting-started.md) - Quick start guide
- [Architecture Overview](../README.md) - System design and overview
- [Configuration Reference](architecture/configuration-reference.md) - Config options
