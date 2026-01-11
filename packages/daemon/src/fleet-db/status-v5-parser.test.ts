/**
 * Status V5 Parser Tests
 */

import { describe, it, expect } from "vitest";
import { parseStatusV5, tryParseStatusV5, generateStatusV5 } from "./status-v5-parser.js";

describe("parseStatusV5", () => {
  it("parses valid YAML frontmatter", () => {
    const content = `---
schema: status.v5
status: completed
session_id: test-session
task_id: task-1
---

## Summary
Test content here`;

    const result = parseStatusV5(content);
    expect(result.frontmatter.status).toBe("completed");
    expect(result.frontmatter.session_id).toBe("test-session");
    expect(result.frontmatter.task_id).toBe("task-1");
    expect(result.markdown).toBe("## Summary\nTest content here");
    expect(result.isV5).toBe(true);
  });

  it("extracts all schema fields", () => {
    const content = `---
schema: status.v5
project_id: test-project__abc12345
repo_name: test-repo
repo_root: /path/to/repo
git_remote: https://github.com/user/repo.git
branch: main
session_id: sess-123
task_id: task-456
status: completed
started_at: 2025-01-01T10:00:00Z
ended_at: 2025-01-01T11:00:00Z
impact_level: moderate
broadcast_level: mention
doc_drift_risk: low
base_commit: abc1234
head_commit: def5678
blockers: []
next_steps:
  - Review code
  - Merge PR
docs_touched:
  - README.md
files_touched:
  - src/index.ts
---

Content`;

    const result = parseStatusV5(content);
    expect(result.frontmatter.project_id).toBe("test-project__abc12345");
    expect(result.frontmatter.repo_name).toBe("test-repo");
    expect(result.frontmatter.impact_level).toBe("moderate");
    expect(result.frontmatter.next_steps).toEqual(["Review code", "Merge PR"]);
    expect(result.frontmatter.docs_touched).toEqual(["README.md"]);
  });

  it("validates enum values", () => {
    const content = `---
status: invalid_status
---

Content`;

    expect(() => parseStatusV5(content)).toThrow(/Invalid frontmatter/);
  });

  it("returns error for missing frontmatter", () => {
    expect(() => parseStatusV5("Not frontmatter")).toThrow(/Missing frontmatter/);
  });

  it("extracts markdown body after closing ---", () => {
    const content = `---
status: completed
---

# Title

Paragraph 1

Paragraph 2`;

    const result = parseStatusV5(content);
    expect(result.markdown).toContain("# Title");
    expect(result.markdown).toContain("Paragraph 1");
  });
});

describe("tryParseStatusV5", () => {
  it("returns null for invalid content", () => {
    expect(tryParseStatusV5("invalid")).toBeNull();
    expect(tryParseStatusV5("---\nstatus: invalid\n---")).toBeNull();
  });

  it("returns parsed result for valid v5 content", () => {
    const content = `---
schema: status.v5
status: completed
---

Content`;

    const result = tryParseStatusV5(content);
    expect(result).not.toBeNull();
    expect(result?.frontmatter.status).toBe("completed");
  });
});

describe("generateStatusV5", () => {
  it("generates valid status file content", () => {
    const frontmatter = {
      status: "completed" as const,
      session_id: "test-session",
      impact_level: "minor" as const,
      next_steps: ["Step 1", "Step 2"],
    };

    const content = generateStatusV5(frontmatter, "## Summary\nTest");
    expect(content).toContain("schema: status.v5");
    expect(content).toContain("status: completed");
    expect(content).toContain("next_steps:");
    expect(content).toContain("  - Step 1");
  });
});
