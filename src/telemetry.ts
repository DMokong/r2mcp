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
  fn: (span: Span) => Promise<T>,
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
 * Wraps a single LLM provider.complete() call in a child span so the
 * cross-process parent context (restored from OTEL_TRACEPARENT in scripts)
 * has a concrete operation to inherit. Attributes mirror the
 * provider.complete result: model, cost_usd, latency_ms. The provider name
 * is supplied separately (the response payload doesn't carry it).
 *
 * spanName SHOULD be `memory.<op>.call` (e.g. memory.extract_entities.call)
 * so traces group naturally with the top-level tool span.
 *
 * (claw-1ejd) — without this wrapper the OTEL_TRACEPARENT plumbing is a
 * no-op because the subprocess never opens a span to inherit the parent.
 */
export async function withLLMCallSpan<T extends { cost_usd?: number; latency_ms?: number }>(
  spanName: string,
  attrs: { provider: string; model?: string },
  fn: () => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(spanName, async (span) => {
    const start = Date.now();
    try {
      span.setAttribute('llm.provider', attrs.provider);
      if (attrs.model) span.setAttribute('llm.model', attrs.model);
      const result = await fn();
      if (typeof result.cost_usd === 'number') {
        span.setAttribute('llm.cost_usd', result.cost_usd);
      }
      if (typeof result.latency_ms === 'number') {
        span.setAttribute('llm.latency_ms', result.latency_ms);
      }
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
      throw err;
    } finally {
      span.setAttribute('duration_ms', Date.now() - start);
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
  totalChars?: number,
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
