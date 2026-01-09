/**
 * Fleet Command - Operator Console
 *
 * The main dashboard view. A paradigm shift from project management
 * (Kanban boards) to fleet command (operating units).
 *
 * 4-zone layout:
 * - Zone A: Roster - high-density agent list
 * - Zone B: Viewport - persistent terminal
 * - Zone C: Tactical Intel - plan + artifacts
 * - Zone D: Event Ticker - global event stream
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
