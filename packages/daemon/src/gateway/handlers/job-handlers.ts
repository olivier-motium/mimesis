/**
 * Job Handlers - Handle Commander job creation and cancellation.
 *
 * Extracted from gateway-server.ts to reduce file size and improve modularity.
 */

import type { WebSocket } from "ws";
import type { JobManager, JobEventListener } from "../job-manager.js";
import type { GatewayMessage } from "../protocol.js";
import { getTracer, recordError } from "../../telemetry/spans.js";

/**
 * Dependencies for job handlers.
 */
export interface JobHandlerDependencies {
  jobManager: JobManager;
  send: (ws: WebSocket, message: GatewayMessage) => void;
}

/**
 * Job creation request message.
 */
export interface JobCreateMessage {
  job: {
    type: string;
    project_id?: string;
    repo_root?: string;
    model: "opus" | "sonnet" | "haiku";
    request: {
      prompt: string;
      system_prompt?: string;
      json_schema?: string;
      max_turns?: number;
      disallowed_tools?: string[];
    };
  };
}

/**
 * Handle job.create message.
 */
export async function handleJobCreate(
  deps: JobHandlerDependencies,
  ws: WebSocket,
  message: JobCreateMessage
): Promise<void> {
  const tracer = getTracer();
  const span = tracer.startSpan("gateway.job.create", {
    attributes: {
      "job.type": message.job.type,
      "job.project_id": message.job.project_id ?? "unknown",
      "job.model": message.job.model,
      "job.prompt_length": message.job.request.prompt.length,
    },
  });

  const { jobManager, send } = deps;

  const listener: JobEventListener = (event) => {
    send(ws, event);
  };

  try {
    await jobManager.createJob(
      {
        type: message.job.type,
        projectId: message.job.project_id,
        repoRoot: message.job.repo_root,
        model: message.job.model,
        request: {
          prompt: message.job.request.prompt,
          systemPrompt: message.job.request.system_prompt,
          jsonSchema: message.job.request.json_schema,
          maxTurns: message.job.request.max_turns,
          disallowedTools: message.job.request.disallowed_tools,
        },
      },
      listener
    );
  } catch (error) {
    recordError(span, error as Error);
    send(ws, {
      type: "error",
      code: "JOB_CREATE_FAILED",
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    span.end();
  }
}

/**
 * Handle job.cancel message.
 */
export function handleJobCancel(
  deps: JobHandlerDependencies,
  message: { job_id: number }
): void {
  const tracer = getTracer();
  const span = tracer.startSpan("gateway.job.cancel", {
    attributes: {
      "job.id": message.job_id,
    },
  });

  try {
    const { jobManager } = deps;
    jobManager.cancelJob(message.job_id);
  } finally {
    span.end();
  }
}
