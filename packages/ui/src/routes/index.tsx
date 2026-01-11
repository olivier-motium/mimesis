/**
 * Agent Command - Terminal-Focused Dashboard
 *
 * 3-zone layout:
 * - Left: Project Navigator - agents grouped by project (the "tabs")
 * - Center: Terminal View - single terminal for selected agent
 * - Right: Live State Panel - status, now, cwd, recent output
 */

import { createFileRoute } from "@tanstack/react-router";
import { AgentCommand } from "../components/agent-command";
import { useSessions } from "../hooks/useSessions";

export const Route = createFileRoute("/")({
  component: AgentCommandPage,
});

function AgentCommandPage() {
  const { sessions } = useSessions();

  return <AgentCommand sessions={sessions} />;
}
