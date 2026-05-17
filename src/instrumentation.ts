/**
 * OpenTelemetry instrumentation for r2mcp.
 * MUST be imported before any other module to enable auto-instrumentation.
 *
 * Enable with: OTEL_ENABLED=true in .env (plus OTEL_EXPORTER_OTLP_ENDPOINT)
 * Disabled by default — no OTel deps needed for basic usage.
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const otelEnabled = process.env.OTEL_ENABLED === 'true';

let sdk: NodeSDK | null = null;

if (otelEnabled) {
  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'r2mcp',
      [ATTR_SERVICE_VERSION]: '0.1.0',
      'deployment.environment':
        process.env.NODE_ENV === 'production' ? 'production' : 'development',
    }),
    traceExporter: new OTLPTraceExporter(),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: 60_000,
    }),
    instrumentations: [new PgInstrumentation(), new HttpInstrumentation()],
  });

  sdk.start();
  console.error('OTel initialized — r2mcp telemetry active');

  process.on('SIGTERM', () => sdk?.shutdown());
  process.on('SIGINT', () => sdk?.shutdown());
}

export { sdk };
