/**
 * Telemetry helpers for custom spans and metrics.
 * Uses the OTel API — returns no-ops when SDK is not initialized.
 */
import { trace, metrics, SpanStatusCode, type Span } from '@opentelemetry/api';

const tracer = trace.getTracer('r2mcp', '0.1.0');
const meter = metrics.getMeter('r2mcp', '0.1.0');

// Metrics
export const toolDuration = meter.createHistogram('r2mcp.memory.tool_duration_ms', {
  description: 'Duration of MCP tool operations in milliseconds',
  unit: 'ms',
});

export const toolCount = meter.createCounter('r2mcp.memory.tool_count', {
  description: 'Number of MCP tool invocations',
});

export const toolErrors = meter.createCounter('r2mcp.memory.tool_errors', {
  description: 'Number of MCP tool errors',
});

export const embeddingDuration = meter.createHistogram('r2mcp.memory.embedding_latency_ms', {
  description: 'Duration of embedding API calls in milliseconds',
  unit: 'ms',
});

export const embeddingCount = meter.createCounter('r2mcp.memory.embedding_count', {
  description: 'Number of embedding API calls',
});

// Estimated cost per token for text-embedding-3-small via OpenRouter
// OpenRouter pricing: $0.02 per 1M tokens for text-embedding-3-small
const EMBEDDING_COST_PER_TOKEN = 0.00000002;

export const embeddingCost = meter.createCounter('r2mcp.memory.embedding_cost_usd', {
  description: 'Estimated cost of embedding API calls in USD',
  unit: 'usd',
});

/**
 * Wraps an async MCP tool handler with OTel span + metrics.
 */
export async function withToolSpan<T>(
  toolName: string,
  attributes: Record<string, string | number | boolean>,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return tracer.startActiveSpan(`memory.${toolName}`, async (span) => {
    const start = Date.now();
    try {
      span.setAttributes(attributes);
      toolCount.add(1, { tool: toolName });
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
      toolErrors.add(1, { tool: toolName });
      throw err;
    } finally {
      const duration = Date.now() - start;
      toolDuration.record(duration, { tool: toolName });
      span.setAttribute('duration_ms', duration);
      span.end();
    }
  });
}

/**
 * Wraps an embedding API call with OTel span + metrics.
 */
export async function withEmbeddingSpan<T>(
  textCount: number,
  fn: () => Promise<T>,
  totalChars?: number
): Promise<T> {
  return tracer.startActiveSpan('memory.embedding', async (span) => {
    const start = Date.now();
    try {
      span.setAttributes({ 'embedding.text_count': textCount });
      embeddingCount.add(1);

      if (totalChars) {
        const estimatedTokens = Math.ceil(totalChars / 4);
        const estimatedCostUsd = estimatedTokens * EMBEDDING_COST_PER_TOKEN;
        embeddingCost.add(estimatedCostUsd);
        span.setAttribute('embedding.estimated_tokens', estimatedTokens);
        span.setAttribute('embedding.estimated_cost_usd', estimatedCostUsd);
      }

      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
      throw err;
    } finally {
      const duration = Date.now() - start;
      embeddingDuration.record(duration);
      span.setAttribute('duration_ms', duration);
      span.end();
    }
  });
}
