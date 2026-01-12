/**
 * Custom metrics for Mimesis daemon observability.
 *
 * Provides gauges, counters, and histograms for tracking key operational metrics.
 */

import { metrics, Meter, Counter, Histogram } from "@opentelemetry/api";
import { TELEMETRY_CONFIG } from "../config/telemetry.js";

let meter: Meter | null = null;

// Metric instruments (lazily initialized)
let sessionsActiveGauge: ReturnType<Meter["createObservableGauge"]> | null =
  null;
let ptyActiveGauge: ReturnType<Meter["createObservableGauge"]> | null = null;
let gatewayConnectionsGauge: ReturnType<Meter["createObservableGauge"]> | null =
  null;
let parseTimeHistogram: Histogram | null = null;
let errorsCounter: Counter | null = null;
let messagesProcessedCounter: Counter | null = null;

// Observable values (updated externally)
let activeSessionsCount = 0;
let activePtyCount = 0;
let gatewayConnectionsCount = 0;

/**
 * Get or create the metrics instance.
 */
export function getMetrics(): Meter {
  if (!meter) {
    meter = metrics.getMeter(TELEMETRY_CONFIG.serviceName);
    initializeMetrics(meter);
  }
  return meter;
}

/**
 * Initialize all metric instruments.
 */
function initializeMetrics(m: Meter): void {
  // Observable gauges - values are read at collection time
  sessionsActiveGauge = m.createObservableGauge("mimesis.sessions.active", {
    description: "Number of active Claude Code sessions being watched",
    unit: "{sessions}",
  });
  sessionsActiveGauge.addCallback((result) => {
    result.observe(activeSessionsCount);
  });

  ptyActiveGauge = m.createObservableGauge("mimesis.pty.active", {
    description: "Number of active PTY sessions",
    unit: "{sessions}",
  });
  ptyActiveGauge.addCallback((result) => {
    result.observe(activePtyCount);
  });

  gatewayConnectionsGauge = m.createObservableGauge(
    "mimesis.gateway.connections",
    {
      description: "Number of active WebSocket connections",
      unit: "{connections}",
    }
  );
  gatewayConnectionsGauge.addCallback((result) => {
    result.observe(gatewayConnectionsCount);
  });

  // Histogram for parse time
  parseTimeHistogram = m.createHistogram("mimesis.file.parse_duration", {
    description: "Time taken to parse JSONL files",
    unit: "ms",
  });

  // Counter for errors
  errorsCounter = m.createCounter("mimesis.errors.count", {
    description: "Total number of errors by type",
    unit: "{errors}",
  });

  // Counter for messages processed
  messagesProcessedCounter = m.createCounter("mimesis.messages.processed", {
    description: "Total number of messages processed by type",
    unit: "{messages}",
  });
}

/**
 * Update the active sessions count.
 */
export function recordSessionActive(count: number): void {
  activeSessionsCount = count;
}

/**
 * Update the active PTY sessions count.
 */
export function recordPtyActive(count: number): void {
  activePtyCount = count;
}

/**
 * Update the gateway connections count.
 */
export function recordGatewayConnection(count: number): void {
  gatewayConnectionsCount = count;
}

/**
 * Record JSONL parse time.
 */
export function recordParseTime(durationMs: number, attributes?: Record<string, string>): void {
  getMetrics();
  parseTimeHistogram?.record(durationMs, attributes);
}

/**
 * Record an error occurrence.
 */
export function recordError(
  errorType: string,
  attributes?: Record<string, string>
): void {
  getMetrics();
  errorsCounter?.add(1, { error_type: errorType, ...attributes });
}

/**
 * Record a message processed.
 */
export function recordMessageProcessed(
  messageType: string,
  attributes?: Record<string, string>
): void {
  getMetrics();
  messagesProcessedCounter?.add(1, { message_type: messageType, ...attributes });
}

/**
 * Increment a counter with custom attributes.
 */
export function incrementCounter(
  name: string,
  value: number = 1,
  attributes?: Record<string, string | number>
): void {
  const m = getMetrics();
  const counter = m.createCounter(name);
  counter.add(value, attributes);
}
