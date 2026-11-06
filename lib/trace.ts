import { trace, SpanStatusCode, type Span } from "@opentelemetry/api";

// OpenTelemetry tracing. Sentry (SENTRY_DSN, lib/monitoring.ts) registers the OpenTelemetry provider and exports the
// spans; Next.js adds its own spans for every page and route. Without a provider these calls cost nothing.
const tracer = () => trace.getTracer("obehub");
export const SLOW_MS = Number(process.env.SLOW_REQUEST_MS) || 1000;

/** Runs fn inside a span named `name`; errors are recorded on the span and thrown on. */
export async function traced<T>(name: string, attrs: Record<string, string | number | boolean>, fn: (span: Span) => Promise<T>): Promise<T> {
  return tracer().startActiveSpan(name, { attributes: attrs }, async (span) => {
    try { return await fn(span); }
    catch (e) { span.recordException(e as Error); span.setStatus({ code: SpanStatusCode.ERROR, message: String((e as Error)?.message || e).slice(0, 200) }); throw e; }
    finally { span.end(); }
  });
}
/** The current trace id (for log lines), or "" without tracing. */
export function traceId(): string {
  const id = trace.getActiveSpan()?.spanContext().traceId || "";
  return /^0+$/.test(id) ? "" : id;
}
