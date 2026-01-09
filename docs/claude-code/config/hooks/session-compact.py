#!/usr/bin/env python3
"""
SessionStart hook - writes compaction marker for Mimesis daemon.

This hook fires when a Claude Code session starts. If the session was
created via compaction (source === "compact"), it writes a marker file
that the Mimesis daemon watches to detect and handle compaction events.

Exit codes:
  0 - Success (marker written or no action needed)
"""
import json
import sys
from pathlib import Path
from datetime import datetime, timezone


def main():
    try:
        input_data = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(0)

    source = input_data.get("source", "")
    session_id = input_data.get("session_id", "")
    cwd = input_data.get("cwd", "")

    # Only act on compaction events
    if source != "compact" or not cwd or not session_id:
        sys.exit(0)

    # Write marker file to .claude directory
    claude_dir = Path(cwd) / ".claude"
    claude_dir.mkdir(exist_ok=True)

    marker_file = claude_dir / f"compacted.{session_id}.marker"
    marker_data = {
        "newSessionId": session_id,
        "cwd": cwd,
        "compactedAt": datetime.now(timezone.utc).isoformat(),
    }

    marker_file.write_text(json.dumps(marker_data, indent=2))
    sys.exit(0)


if __name__ == "__main__":
    main()
