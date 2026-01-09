/**
 * TacticalIntel - Right sidebar (Zone C)
 *
 * Shows execution plan and modified artifacts
 */

import { CheckCircle2, FileCode, Hash } from "lucide-react";
import { parsePlanSteps, extractArtifacts } from "./constants";
import type { TacticalIntelProps } from "./types";

export function TacticalIntel({ session }: TacticalIntelProps) {
  // Empty state
  if (!session) {
    return (
      <aside className="fleet-intel">
        <div className="fleet-intel__empty">
          <div>Select an agent to view tactical intel</div>
        </div>
      </aside>
    );
  }

  const planSteps = parsePlanSteps(session);
  const artifacts = extractArtifacts(session);

  return (
    <aside className="fleet-intel">
      {/* Execution Plan Section */}
      <div className="fleet-intel__section">
        <div className="fleet-intel__section-header">
          <CheckCircle2 size={12} className="fleet-intel__section-icon" />
          Execution Plan
        </div>
        <div className="fleet-intel__section-content">
          {planSteps.length === 0 ? (
            <div style={{ color: "var(--nb-text-muted)", fontSize: 12 }}>
              No plan available
            </div>
          ) : (
            planSteps.map((step, i) => (
              <div
                key={i}
                className={`fleet-plan-step ${step.done ? "fleet-plan-step--done" : ""}`}
              >
                <div className="fleet-plan-step__check">
                  {step.done && <CheckCircle2 size={10} className="fleet-plan-step__check-icon" />}
                </div>
                <span className="fleet-plan-step__text">{step.text}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Artifacts Section */}
      <div className="fleet-intel__section fleet-intel__section--artifacts">
        <div className="fleet-intel__section-header">
          <FileCode size={12} className="fleet-intel__section-icon" />
          Modified Artifacts
        </div>
        <div className="fleet-intel__section-content">
          {artifacts.length === 0 ? (
            <div style={{ color: "var(--nb-text-muted)", fontSize: 12 }}>
              No artifacts yet
            </div>
          ) : (
            artifacts.map((file, i) => (
              <div key={i} className="fleet-artifact">
                <Hash size={12} className="fleet-artifact__icon" />
                <span className="fleet-artifact__path">{file}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
