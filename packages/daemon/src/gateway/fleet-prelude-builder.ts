/**
 * Builds fleet context prelude for Commander turns.
 * Aggregates outbox events, briefings, and project status for injection
 * into Commander conversations via --append-system-prompt or prompt prepend.
 */

import { OutboxRepo, type OutboxEventPayload } from "../fleet-db/outbox-repo.js";
import { BriefingRepo } from "../fleet-db/briefing-repo.js";
import { ProjectRepo } from "../fleet-db/project-repo.js";
import type { OutboxEvent, Briefing, Project } from "../fleet-db/schema.js";
import { OUTBOX_EVENT_TYPE, DOC_DRIFT_RISK } from "../config/fleet.js";

export interface FleetPrelude {
  /** System prompt addition (stable framing) */
  systemPrompt: string;
  /** Fleet delta to prepend to user prompt */
  fleetDelta: string;
  /** New cursor position after processing events */
  newCursor: number;
  /** Whether there's any fleet activity to report */
  hasActivity: boolean;
}

export interface PreludeOptions {
  /** Last seen outbox event ID */
  lastEventIdSeen: number;
  /** Max events to include in prelude */
  maxEvents?: number;
  /** Include high doc-drift-risk briefings */
  includeDocDriftWarnings?: boolean;
}

/**
 * Builds contextual prelude for Commander turns.
 * Called before each Commander prompt to inject fleet awareness.
 */
export class FleetPreludeBuilder {
  private outboxRepo: OutboxRepo;
  private briefingRepo: BriefingRepo;
  private projectRepo: ProjectRepo;

  constructor() {
    this.outboxRepo = new OutboxRepo();
    this.briefingRepo = new BriefingRepo();
    this.projectRepo = new ProjectRepo();
  }

  /**
   * Build the fleet prelude for a Commander turn.
   */
  build(options: PreludeOptions): FleetPrelude {
    const {
      lastEventIdSeen,
      maxEvents = 20,
      includeDocDriftWarnings = true,
    } = options;

    // Get new events since last seen
    const newEvents = this.outboxRepo.getAfterCursor(lastEventIdSeen, maxEvents);
    const newCursor = newEvents.length > 0
      ? newEvents[newEvents.length - 1].eventId
      : lastEventIdSeen;

    // Build fleet delta from events
    const fleetDeltaParts: string[] = [];

    if (newEvents.length > 0) {
      fleetDeltaParts.push(this.formatEvents(newEvents));
    }

    // Add doc drift warnings if enabled
    if (includeDocDriftWarnings) {
      const driftWarnings = this.getDocDriftWarnings();
      if (driftWarnings) {
        fleetDeltaParts.push(driftWarnings);
      }
    }

    const fleetDelta = fleetDeltaParts.length > 0
      ? `<fleet-update>\n${fleetDeltaParts.join("\n\n")}\n</fleet-update>\n\n`
      : "";

    return {
      systemPrompt: this.buildSystemPrompt(),
      fleetDelta,
      newCursor,
      // Fixed: Check actual fleetDelta content, not parts count
      hasActivity: fleetDelta.trim().length > 0,
    };
  }

  /**
   * Build stable system prompt for Commander role.
   */
  private buildSystemPrompt(): string {
    return `You are Fleet Commander, an Opus-powered meta-agent that oversees a fleet of Claude Code sessions across multiple projects.

Your responsibilities:
- Track project status, blockers, and cross-project dependencies
- Answer questions about fleet-wide activity
- Coordinate work across projects when needed
- Identify documentation drift and technical debt
- Provide strategic recommendations

You receive fleet updates before each turn showing recent briefings, job completions, and alerts.
Use this context to provide informed, cross-project intelligence.`;
  }

  /**
   * Format outbox events into readable fleet delta.
   */
  private formatEvents(events: OutboxEvent[]): string {
    const lines: string[] = ["## Recent Fleet Activity"];

    for (const event of events) {
      const payload = JSON.parse(event.payloadJson) as OutboxEventPayload;
      const ts = new Date(event.ts).toLocaleString();

      switch (event.type) {
        case OUTBOX_EVENT_TYPE.BRIEFING_ADDED:
          if (payload.briefing) {
            const { projectId, status, impactLevel, broadcastLevel } = payload.briefing;
            const impact = impactLevel ? ` [${impactLevel}]` : "";
            const broadcast = broadcastLevel === "highlight" ? " ⚠️" : "";
            lines.push(`- ${ts}: Project **${projectId}** session ${status}${impact}${broadcast}`);
          }
          break;

        case OUTBOX_EVENT_TYPE.JOB_COMPLETED:
          if (payload.job) {
            const { type, status, projectId } = payload.job;
            const proj = projectId ? ` (${projectId})` : "";
            lines.push(`- ${ts}: Job ${type}${proj} → ${status}`);
          }
          break;

        case OUTBOX_EVENT_TYPE.ERROR:
          if (payload.error) {
            lines.push(`- ${ts}: ⚠️ Error: ${payload.error.message}`);
          }
          break;

        default:
          lines.push(`- ${ts}: ${event.type}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Get documentation drift warnings from recent briefings.
   */
  private getDocDriftWarnings(): string | null {
    // Get briefings with high doc drift risk from last 24 hours
    const recentBriefings = this.briefingRepo.getRecent(50);
    const highRisk = recentBriefings.filter(
      (b) => b.docDriftRisk === DOC_DRIFT_RISK.HIGH
    );

    if (highRisk.length === 0) {
      return null;
    }

    const lines: string[] = ["## Documentation Drift Warnings"];
    for (const briefing of highRisk.slice(0, 5)) {
      const docs = briefing.docsTouchedJson
        ? JSON.parse(briefing.docsTouchedJson)
        : [];
      const docsStr = docs.length > 0 ? `: ${docs.join(", ")}` : "";
      lines.push(`- Project **${briefing.projectId}**: High doc drift risk${docsStr}`);
    }

    return lines.join("\n");
  }

  /**
   * Get active projects summary for context.
   */
  getActiveProjectsSummary(): string {
    const projects = this.projectRepo.getActive();
    if (projects.length === 0) {
      return "No active projects.";
    }

    const lines: string[] = ["## Active Projects"];
    for (const project of projects.slice(0, 10)) {
      lines.push(`- **${project.projectId}**: ${project.repoName} (${project.repoRoot})`);
    }

    return lines.join("\n");
  }
}
