/**
 * Telemetry configuration for OpenTelemetry/Logfire integration.
 *
 * Uses LOGFIRE_MIMESIS_WRITE_TOKEN from environment for authentication.
 * Exports to Logfire EU region by default.
 */

/** Internal flag to avoid repeated warnings (mutable) */
let _warnedDisabled = false;

export const TELEMETRY_CONFIG = {
  /** Service name reported to Logfire */
  serviceName: "mimesis-daemon",

  /** Logfire OTLP endpoint (EU region) */
  endpoint: "https://logfire-eu.pydantic.dev",

  /** Environment variable for write token */
  tokenEnvVar: "LOGFIRE_MIMESIS_WRITE_TOKEN",

  /** Check if telemetry should be enabled (logs warning once if disabled) */
  enabled: (): boolean => {
    const hasToken = !!process.env.LOGFIRE_MIMESIS_WRITE_TOKEN;
    if (!hasToken && !_warnedDisabled) {
      console.warn("[TELEMETRY] LOGFIRE_MIMESIS_WRITE_TOKEN not set - telemetry disabled");
      _warnedDisabled = true;
    }
    return hasToken;
  },

  /** Get the write token from environment */
  getToken: (): string | undefined => process.env.LOGFIRE_MIMESIS_WRITE_TOKEN,

  /** Get deployment environment name */
  getEnvironment: (): string => process.env.NODE_ENV || "local",

  /** Batch export settings */
  export: {
    /** Max time to wait before exporting a batch (ms) */
    scheduleDelayMs: 5000,
    /** Max number of spans per batch */
    maxExportBatchSize: 512,
    /** Max queue size before dropping spans */
    maxQueueSize: 2048,
  },

  /** Metric collection interval (ms) */
  metricsIntervalMs: 60000,
} as const;
