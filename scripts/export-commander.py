#!/usr/bin/env python3
"""
Export Commander Module

Exports all Commander-related code (daemon, UI, hooks, docs) to a single markdown file
for easy reference and sharing.

Usage:
    python scripts/export-commander.py [output_path]

If output_path is not specified, outputs to commander-module-export.md in project root.
"""

import argparse
from datetime import datetime
from pathlib import Path
from typing import NamedTuple


class FileSpec(NamedTuple):
    """Specification for a file to export."""

    path: str
    language: str
    section: str


# Project root (parent of scripts/)
PROJECT_ROOT = Path(__file__).parent.parent

# Home directory for hooks
HOME = Path.home()

# Files to export, organized by section
FILES_TO_EXPORT: list[FileSpec] = [
    # Documentation
    FileSpec("docs/architecture/commander.md", "markdown", "Documentation"),
    # Daemon - Gateway Core
    FileSpec(
        "packages/daemon/src/gateway/gateway-server.ts",
        "typescript",
        "Daemon - Gateway Core",
    ),
    FileSpec(
        "packages/daemon/src/gateway/commander-session.ts",
        "typescript",
        "Daemon - Gateway Core",
    ),
    FileSpec(
        "packages/daemon/src/gateway/fleet-prelude-builder.ts",
        "typescript",
        "Daemon - Gateway Core",
    ),
    FileSpec(
        "packages/daemon/src/gateway/protocol.ts",
        "typescript",
        "Daemon - Gateway Core",
    ),
    FileSpec(
        "packages/daemon/src/gateway/session-store.ts",
        "typescript",
        "Daemon - Gateway Core",
    ),
    FileSpec(
        "packages/daemon/src/gateway/pty-bridge.ts",
        "typescript",
        "Daemon - Gateway Core",
    ),
    FileSpec(
        "packages/daemon/src/gateway/outbox-tailer.ts",
        "typescript",
        "Daemon - Gateway Core",
    ),
    FileSpec(
        "packages/daemon/src/gateway/entry-converter.ts",
        "typescript",
        "Daemon - Gateway Core",
    ),
    FileSpec(
        "packages/daemon/src/gateway/event-merger.ts",
        "typescript",
        "Daemon - Gateway Core",
    ),
    # Daemon - Gateway Handlers
    FileSpec(
        "packages/daemon/src/gateway/handlers/commander-handlers.ts",
        "typescript",
        "Daemon - Gateway Handlers",
    ),
    FileSpec(
        "packages/daemon/src/gateway/handlers/pty-session-handlers.ts",
        "typescript",
        "Daemon - Gateway Handlers",
    ),
    FileSpec(
        "packages/daemon/src/gateway/handlers/job-handlers.ts",
        "typescript",
        "Daemon - Gateway Handlers",
    ),
    FileSpec(
        "packages/daemon/src/gateway/handlers/hook-handlers.ts",
        "typescript",
        "Daemon - Gateway Handlers",
    ),
    FileSpec(
        "packages/daemon/src/gateway/handlers/watcher-handlers.ts",
        "typescript",
        "Daemon - Gateway Handlers",
    ),
    FileSpec(
        "packages/daemon/src/gateway/handlers/index.ts",
        "typescript",
        "Daemon - Gateway Handlers",
    ),
    # Daemon - Job System
    FileSpec(
        "packages/daemon/src/gateway/job-runner.ts",
        "typescript",
        "Daemon - Job System",
    ),
    FileSpec(
        "packages/daemon/src/gateway/job-manager.ts",
        "typescript",
        "Daemon - Job System",
    ),
    # Daemon - Fleet Database
    FileSpec(
        "packages/daemon/src/fleet-db/schema.ts",
        "typescript",
        "Daemon - Fleet Database",
    ),
    FileSpec(
        "packages/daemon/src/fleet-db/conversation-repo.ts",
        "typescript",
        "Daemon - Fleet Database",
    ),
    FileSpec(
        "packages/daemon/src/fleet-db/briefing-ingestor.ts",
        "typescript",
        "Daemon - Fleet Database",
    ),
    FileSpec(
        "packages/daemon/src/fleet-db/briefing-repo.ts",
        "typescript",
        "Daemon - Fleet Database",
    ),
    FileSpec(
        "packages/daemon/src/fleet-db/outbox-repo.ts",
        "typescript",
        "Daemon - Fleet Database",
    ),
    FileSpec(
        "packages/daemon/src/fleet-db/job-repo.ts",
        "typescript",
        "Daemon - Fleet Database",
    ),
    FileSpec(
        "packages/daemon/src/fleet-db/project-repo.ts",
        "typescript",
        "Daemon - Fleet Database",
    ),
    FileSpec(
        "packages/daemon/src/fleet-db/status-v5-parser.ts",
        "typescript",
        "Daemon - Fleet Database",
    ),
    FileSpec(
        "packages/daemon/src/fleet-db/index.ts",
        "typescript",
        "Daemon - Fleet Database",
    ),
    # Daemon - Configuration
    FileSpec(
        "packages/daemon/src/config/fleet.ts",
        "typescript",
        "Daemon - Configuration",
    ),
    # Daemon - REST API
    FileSpec(
        "packages/daemon/src/api/routes/fleet.ts",
        "typescript",
        "Daemon - REST API",
    ),
    # Daemon - Status Watcher
    FileSpec(
        "packages/daemon/src/status-watcher.ts",
        "typescript",
        "Daemon - Status Watcher",
    ),
    FileSpec(
        "packages/daemon/src/status-parser.ts",
        "typescript",
        "Daemon - Status Watcher",
    ),
    # UI - Commander Components
    FileSpec(
        "packages/ui/src/components/commander/CommanderTab.tsx",
        "tsx",
        "UI - Commander Components",
    ),
    FileSpec(
        "packages/ui/src/components/commander/CommanderInput.tsx",
        "tsx",
        "UI - Commander Components",
    ),
    FileSpec(
        "packages/ui/src/components/commander/CommanderStreamDisplay.tsx",
        "tsx",
        "UI - Commander Components",
    ),
    FileSpec(
        "packages/ui/src/components/commander/CommanderTimeline.tsx",
        "tsx",
        "UI - Commander Components",
    ),
    FileSpec(
        "packages/ui/src/components/commander/CommanderHistory.tsx",
        "tsx",
        "UI - Commander Components",
    ),
    FileSpec(
        "packages/ui/src/components/commander/index.ts",
        "typescript",
        "UI - Commander Components",
    ),
    # UI - Gateway Hooks
    FileSpec(
        "packages/ui/src/hooks/useGateway.ts",
        "typescript",
        "UI - Gateway Hooks",
    ),
    FileSpec(
        "packages/ui/src/hooks/gateway-connection.ts",
        "typescript",
        "UI - Gateway Hooks",
    ),
    FileSpec(
        "packages/ui/src/hooks/gateway-handlers.ts",
        "typescript",
        "UI - Gateway Hooks",
    ),
    FileSpec(
        "packages/ui/src/hooks/gateway-types.ts",
        "typescript",
        "UI - Gateway Hooks",
    ),
    FileSpec(
        "packages/ui/src/hooks/useCommanderEvents.ts",
        "typescript",
        "UI - Gateway Hooks",
    ),
]

# Hook scripts from ~/.claude/hooks/
HOOK_SCRIPTS: list[str] = [
    # Session lifecycle
    "init-status-v5.py",
    "status-working.py",
    "status-stop.py",
    "stop-validator.py",
    "finalize-status-v5.py",
    "ingest-status-v5.py",
    # Event forwarding
    "fleet-forward-hook-event.py",
    "emit-hook-event.py",
    # Session tracking
    "session-compact.py",
    # Developer assistance
    "read-docs-trigger.py",
    "skill-reminder.py",
]


def read_file(path: Path) -> str | None:
    """Read file contents, return None if file doesn't exist."""
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return None
    except Exception as e:
        return f"Error reading file: {e}"


def generate_toc(sections: list[str]) -> str:
    """Generate table of contents from section names."""
    lines = ["## Table of Contents\n"]
    for section in sections:
        anchor = section.lower().replace(" - ", "-").replace(" ", "-")
        lines.append(f"- [{section}](#{anchor})")
    return "\n".join(lines)


def export_files(output_path: Path) -> None:
    """Export all Commander-related files to a single markdown file."""
    output_lines: list[str] = []
    missing_files: list[str] = []

    # Header
    output_lines.append("# Commander Module Export\n")
    output_lines.append(
        f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
    )
    output_lines.append(
        "This file contains all code related to the Fleet Commander module.\n"
    )

    # Collect sections for TOC
    sections: list[str] = []
    seen_sections: set[str] = set()

    for spec in FILES_TO_EXPORT:
        if spec.section not in seen_sections:
            sections.append(spec.section)
            seen_sections.add(spec.section)

    sections.append("Hook Scripts")

    # Add TOC
    output_lines.append(generate_toc(sections))
    output_lines.append("\n---\n")

    # Export project files
    current_section = ""
    for spec in FILES_TO_EXPORT:
        if spec.section != current_section:
            current_section = spec.section
            output_lines.append(f"\n## {current_section}\n")

        file_path = PROJECT_ROOT / spec.path
        content = read_file(file_path)

        output_lines.append(f"\n### `{spec.path}`\n")

        if content is None:
            output_lines.append("*File not found*\n")
            missing_files.append(spec.path)
        elif content.startswith("Error"):
            output_lines.append(f"*{content}*\n")
            missing_files.append(spec.path)
        else:
            output_lines.append(f"```{spec.language}")
            output_lines.append(content)
            if not content.endswith("\n"):
                output_lines.append("")
            output_lines.append("```\n")

    # Export hook scripts
    output_lines.append("\n## Hook Scripts\n")
    output_lines.append("*Source: `~/.claude/hooks/`*\n")

    hooks_dir = HOME / ".claude" / "hooks"
    for hook_name in HOOK_SCRIPTS:
        hook_path = hooks_dir / hook_name
        content = read_file(hook_path)

        output_lines.append(f"\n### `~/.claude/hooks/{hook_name}`\n")

        if content is None:
            output_lines.append("*File not found*\n")
            missing_files.append(f"~/.claude/hooks/{hook_name}")
        elif content.startswith("Error"):
            output_lines.append(f"*{content}*\n")
            missing_files.append(f"~/.claude/hooks/{hook_name}")
        else:
            output_lines.append("```python")
            output_lines.append(content)
            if not content.endswith("\n"):
                output_lines.append("")
            output_lines.append("```\n")

    # Write output
    output_path.write_text("\n".join(output_lines), encoding="utf-8")
    print(f"Exported Commander module to: {output_path}")
    print(f"Total size: {output_path.stat().st_size:,} bytes")

    if missing_files:
        print(f"\nWarning: {len(missing_files)} file(s) not found:")
        for f in missing_files:
            print(f"  - {f}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export Commander module code to a single markdown file"
    )
    parser.add_argument(
        "output",
        nargs="?",
        default=str(PROJECT_ROOT / "commander-module-export.md"),
        help="Output file path (default: commander-module-export.md)",
    )
    args = parser.parse_args()

    output_path = Path(args.output)
    export_files(output_path)


if __name__ == "__main__":
    main()
