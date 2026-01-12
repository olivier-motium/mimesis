/**
 * Span helper utilities for manual instrumentation.
 *
 * Provides ergonomic wrappers around OpenTelemetry span creation and management.
 */

import { trace, Span, SpanStatusCode, context } from "@opentelemetry/api";
import { TELEMETRY_CONFIG } from "../config/telemetry.js";

const tracer = trace.getTracer(TELEMETRY_CONFIG.serviceName);

/**
 * Wrap an async function with a span.
 *
 * Automatically records errors and sets span status.
 *
 * @example
 * ```ts
 * const result = await withSpan('db.query', async (span) => {
 *   span.setAttribute('db.table', 'users');
 *   return db.query('SELECT * FROM users');
 * });
 * ```
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    try {
      // Add initial attributes
      if (attributes) {
        for (const [key, value] of Object.entries(attributes)) {
          span.setAttribute(key, value);
        }
      }

      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      recordError(span, error);
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Wrap a synchronous function with a span.
 */
export function withSpanSync<T>(
  name: string,
  fn: (span: Span) => T,
  attributes?: Record<string, string | number | boolean>
): T {
  const span = tracer.startSpan(name);

  try {
    // Add initial attributes
    if (attributes) {
      for (const [key, value] of Object.entries(attributes)) {
        span.setAttribute(key, value);
      }
    }

    const result = fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    recordError(span, error);
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Record an error on a span with standardized attributes.
 */
export function recordError(span: Span, error: unknown): void {
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error instanceof Error ? error.message : String(error),
  });

  if (error instanceof Error) {
    span.recordException(error);
    span.setAttribute("error.type", error.name);
    span.setAttribute("error.message", error.message);
    if (error.stack) {
      span.setAttribute("error.stack", error.stack);
    }
  } else {
    span.setAttribute("error.message", String(error));
  }
}

/**
 * Add common session attributes to a span.
 */
export function addSessionAttributes(
  span: Span,
  session: {
    id?: string;
    projectPath?: string;
    status?: string;
    branch?: string;
  }
): void {
  if (session.id) {
    span.setAttribute("session.id", session.id);
  }
  if (session.projectPath) {
    span.setAttribute("session.project_path", session.projectPath);
  }
  if (session.status) {
    span.setAttribute("session.status", session.status);
  }
  if (session.branch) {
    span.setAttribute("git.branch", session.branch);
  }
}

/**
 * Add PTY-specific attributes to a span.
 */
export function addPtyAttributes(
  span: Span,
  pty: {
    sessionId?: string;
    pid?: number;
    cols?: number;
    rows?: number;
  }
): void {
  if (pty.sessionId) {
    span.setAttribute("pty.session_id", pty.sessionId);
  }
  if (pty.pid) {
    span.setAttribute("pty.pid", pty.pid);
  }
  if (pty.cols) {
    span.setAttribute("pty.cols", pty.cols);
  }
  if (pty.rows) {
    span.setAttribute("pty.rows", pty.rows);
  }
}

/**
 * Add database operation attributes to a span.
 */
export function addDbAttributes(
  span: Span,
  db: {
    operation: string;
    table?: string;
    rowCount?: number;
  }
): void {
  span.setAttribute("db.operation", db.operation);
  if (db.table) {
    span.setAttribute("db.table", db.table);
  }
  if (db.rowCount !== undefined) {
    span.setAttribute("db.row_count", db.rowCount);
  }
}

/**
 * Add WebSocket-specific attributes to a span.
 */
export function addWebSocketAttributes(
  span: Span,
  ws: {
    clientId?: string;
    messageType?: string;
    messageSize?: number;
  }
): void {
  if (ws.clientId) {
    span.setAttribute("ws.client_id", ws.clientId);
  }
  if (ws.messageType) {
    span.setAttribute("ws.message_type", ws.messageType);
  }
  if (ws.messageSize !== undefined) {
    span.setAttribute("ws.message_size", ws.messageSize);
  }
}

/**
 * Get the current active span, if any.
 */
export function getCurrentSpan(): Span | undefined {
  return trace.getActiveSpan();
}

/**
 * Get the tracer for creating custom spans.
 */
export function getTracer() {
  return tracer;
}
