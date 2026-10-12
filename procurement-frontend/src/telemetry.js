/**
 * =============================================================================
 * TELEMETRY HELPERS - EDOT Browser (OpenTelemetry)
 * =============================================================================
 * EDOT Browser auto-instruments page loads, route changes, fetch/XHR, clicks,
 * long tasks, uncaught errors, and Web Vitals. These helpers add the
 * business-level spans and attributes the demo shows in Kibana.
 *
 * USAGE PATTERN:
 *   traceAction('Click - Upload Document', { 'file.name': name }, async (span) => {
 *     const res = await fetch('/api/...');
 *     span.setAttributes({ 'upload.success': true });
 *   });
 *
 * Fetch calls made before the action's first `await` become child spans of the
 * action and carry its traceparent to the backend. Hold on to `span` to add
 * attributes later; don't look up the active span after an `await`, because
 * native async/await doesn't preserve the browser's trace context.
 * =============================================================================
 */

import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('procurement-frontend');

export function recordError(span, err) {
  span.recordException(err);
  span.setStatus({ code: SpanStatusCode.ERROR, message: err?.message });
}

export function traceAction(name, attributes, fn) {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn(span);
    } catch (err) {
      recordError(span, err);
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Report a handled error that happened outside a traced action
 * (for example, a failed background data load).
 */
export function reportError(name, err) {
  const span = tracer.startSpan(name);
  recordError(span, err);
  span.end();
}
