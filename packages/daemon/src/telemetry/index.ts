/**
 * OpenTelemetry SDK initialization for Mimesis daemon.
 *
 * Exports traces and metrics to Logfire using OTLP/HTTP protocol.
 * Must be called at the very start of the application, before other imports.
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
// Use string literals for semantic conventions to avoid version incompatibilities
const ATTR_SERVICE_NAME = "service.name";
const ATTR_DEPLOYMENT_ENVIRONMENT = "deployment.environment";
const ATTR_SERVICE_VERSION = "service.version";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { TELEMETRY_CONFIG } from "../config/telemetry.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("TELEMETRY");

let sdk: NodeSDK | null = null;
let initialized = false;

/**
 * Initialize OpenTelemetry SDK with Logfire configuration.
 *
 * Call this at the very start of your application, before other imports
 * that might need instrumentation (e.g., http, fetch).
 */
export function initTelemetry(): void {
  if (initialized) {
    logger.debug("Telemetry already initialized");
    return;
  }

  if (!TELEMETRY_CONFIG.enabled()) {
    logger.info(
      `Telemetry disabled (${TELEMETRY_CONFIG.tokenEnvVar} not set)`
    );
    initialized = true;
    return;
  }

  const token = TELEMETRY_CONFIG.getToken();
  if (!token) {
    logger.warn("Telemetry token is empty, skipping initialization");
    initialized = true;
    return;
  }

  const headers = {
    Authorization: token,
  };

  // Create OTLP exporters
  const traceExporter = new OTLPTraceExporter({
    url: `${TELEMETRY_CONFIG.endpoint}/v1/traces`,
    headers,
  });

  const metricExporter = new OTLPMetricExporter({
    url: `${TELEMETRY_CONFIG.endpoint}/v1/metrics`,
    headers,
  });

  // Create metric reader with periodic export
  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: TELEMETRY_CONFIG.metricsIntervalMs,
  });

  // Define service resource attributes
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: TELEMETRY_CONFIG.serviceName,
    [ATTR_DEPLOYMENT_ENVIRONMENT]: TELEMETRY_CONFIG.getEnvironment(),
    [ATTR_SERVICE_VERSION]: process.env.npm_package_version || "0.0.0",
  });

  // Initialize SDK
  sdk = new NodeSDK({
    resource,
    traceExporter,
    metricReader,
    instrumentations: [
      new HttpInstrumentation({
        // Ignore health check endpoints
        ignoreIncomingRequestHook: (req) => {
          return req.url === "/health" || req.url === "/api/health";
        },
      }),
    ],
  });

  sdk.start();
  initialized = true;

  logger.info(
    `Telemetry initialized for service: ${TELEMETRY_CONFIG.serviceName} (${TELEMETRY_CONFIG.getEnvironment()})`
  );
}

/**
 * Gracefully shutdown the OpenTelemetry SDK.
 *
 * Flushes any pending telemetry data before shutdown.
 * Call this in your application's shutdown handler.
 */
export async function shutdownTelemetry(): Promise<void> {
  if (!sdk) {
    return;
  }

  try {
    await sdk.shutdown();
    logger.info("Telemetry shutdown complete");
  } catch (error) {
    logger.error("Error shutting down telemetry", error);
  }
}

/**
 * Check if telemetry is enabled and initialized.
 */
export function isTelemetryEnabled(): boolean {
  return initialized && TELEMETRY_CONFIG.enabled();
}

// Re-export span helpers and metrics
export { withSpan, recordError, addSessionAttributes } from "./spans.js";
export {
  getMetrics,
  recordSessionActive,
  recordPtyActive,
  recordGatewayConnection,
  recordParseTime,
  recordError as recordErrorMetric,
} from "./metrics.js";
