/**
 * Fleet Command - Fleet Commander v5 Layout
 *
 * 3-column layout (Melty-style):
 * - Left: Roster (session list with spawn button)
 * - Center: Timeline (structured events) + SessionInput
 * - Right: TacticalIntel (status, file changes)
 *
 * Connects to Fleet Gateway via WebSocket for realtime updates.
 */

import { createFileRoute } from "@tanstack/react-router";
import { FleetCommand } from "../components/fleet-command";
import { useSessions } from "../hooks/useSessions";

export const Route = createFileRoute("/")({
  component: FleetCommandPage,
});

function FleetCommandPage() {
  const { sessions } = useSessions();

  return <FleetCommand sessions={sessions} />;
}
