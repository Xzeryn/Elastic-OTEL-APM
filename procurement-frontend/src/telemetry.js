/**
 * =============================================================================
 * TELEMETRY HELPERS - EDOT Browser (OpenTelemetry)
 * =============================================================================
 * Elastic lists one transaction per root span, named after the span. The stock
 * browser instrumentations produce generic roots ("documentLoad", "click",
 * "GET"), so this module groups work into named root "operations" the way the
 * classic RUM agent did:
 *
 *   Page load     "/invoices"                 documentLoad timing + initial data loads
 *   Route change  "/payments"                 data loads for the new route
 *   Click         "Click - Process Payment"   from the element's data-transaction-name,
 *                                             lasting until the action's requests finish
 *
 * Operations end when their last piece of tracked work finishes, so durations
 * reflect what the user waited for.
 *
 * USAGE (in components):
 *   traceAction('Click - Upload Document', { 'file.name': name }, async (span) => {
 *     const res = await fetch('/api/...');
 *     span.setAttributes({ 'upload.success': true });
 *   });
 *   traceLoad('Load Invoices', async (span) => { ... });
 *
 * Fetch calls made before fn's first `await` are parented automatically and
 * carry traceparent to the backend. After an `await` the browser's trace
 * context is gone (native async/await isn't tracked), so hold on to `span`
 * instead of looking up the active span.
 * =============================================================================
 */

import { context, propagation, trace, ROOT_CONTEXT, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('procurement-frontend');

// Route-change data loads start in effects a frame or two after navigation;
// wait this long for them before closing an idle route operation.
const ROUTE_SETTLE_MS = 100;
// Never leave an operation open longer than this (e.g. a hung request).
const MAX_OPERATION_MS = 30000;

let currentOperation = null;

export function recordError(span, err) {
  if (!span) return;
  span.recordException(err);
  span.setStatus({ code: SpanStatusCode.ERROR, message: err?.message });
}

function startOperation(name, kind, { startTime, attributes, settleMs = 0 } = {}) {
  const span = tracer.startSpan(name, {
    root: true,
    startTime,
    attributes: { 'app.operation.kind': kind, ...attributes },
  });
  const op = { span, kind, holds: 0, ended: false, adopted: false, lastActivity: Date.now() };

  const finish = () => {
    if (op.ended) return;
    op.ended = true;
    clearTimeout(op.maxTimer);
    if (currentOperation === op) currentOperation = null;
    span.end(op.lastActivity);
  };
  const scheduleSettle = () => {
    clearTimeout(op.settleTimer);
    op.settleTimer = setTimeout(() => { if (op.holds === 0) finish(); }, settleMs);
  };

  op.hold = () => { op.holds++; clearTimeout(op.settleTimer); };
  op.release = () => {
    op.lastActivity = Date.now();
    if (--op.holds === 0) scheduleSettle();
  };
  op.maxTimer = setTimeout(finish, MAX_OPERATION_MS);

  currentOperation = op;
  scheduleSettle();
  return op;
}

// Runs fn inside op (as op's own span when childName is omitted), keeping op
// open until fn's promise settles.
async function runInOperation(op, childName, attributes, fn) {
  op.hold();
  const parentCtx = trace.setSpan(ROOT_CONTEXT, op.span);
  const run = (span) => context.with(trace.setSpan(parentCtx, span), () => fn(span));
  const span = childName ? tracer.startSpan(childName, { attributes }, parentCtx) : op.span;
  if (!childName && attributes) span.setAttributes(attributes);
  try {
    return await run(span);
  } catch (err) {
    recordError(span, err);
    throw err;
  } finally {
    if (childName) span.end();
    op.release();
  }
}

/**
 * Page-load operation, named after the current route. Call once, right after
 * the SDK starts. The document-load instrumentation takes its parent from a
 * traceparent meta tag, so this attaches its documentLoad span (navigation and
 * resource timing) to the operation instead of a separate trace.
 */
export function startPageLoad() {
  const op = startOperation(window.location.pathname, 'page-load', {
    startTime: performance.timeOrigin,
    settleMs: ROUTE_SETTLE_MS,
  });
  const { traceId, spanId } = op.span.spanContext();
  const traceparent = `00-${traceId}-${spanId}-01`;
  const meta = document.createElement('meta');
  meta.name = 'traceparent';
  meta.content = traceparent;
  document.head.appendChild(meta);

  // A parent extracted from the meta tag is flagged as remote, and Elastic
  // starts a new transaction under any remote parent, so documentLoad would be
  // listed as its own transaction. Hand back the local span instead.
  const extract = propagation.extract.bind(propagation);
  propagation.extract = (ctx, carrier, getter) => (
    carrier?.traceparent === traceparent
      ? trace.setSpan(ctx, op.span)
      : extract(ctx, carrier, getter)
  );

  if (document.readyState !== 'complete') {
    op.hold();
    window.addEventListener('load', () => op.release(), { once: true });
  }
}

/** Route-change operation for in-app navigation (not the initial page load). */
export function startRouteChange(pathname) {
  startOperation(pathname, 'route-change', { settleMs: ROUTE_SETTLE_MS });
}

/**
 * Hook for the user-interaction instrumentation's shouldPreventSpanCreation.
 * Replaces its zero-duration "click" span with a click operation named from
 * the nearest data-transaction-name. Unlabeled clicks aren't recorded.
 */
let lastClick = { element: null, time: 0 };
export function handleClickSpan(eventType, element) {
  const labeled = element?.closest?.('[data-transaction-name]');
  const label = labeled?.getAttribute('data-transaction-name');
  const now = performance.now();
  // React listens in both capture and bubble phases, so each click arrives twice
  const duplicate = lastClick.element === element && now - lastClick.time < 50;
  lastClick = { element, time: now };
  if (label && !duplicate) {
    startOperation(`Click - ${label}`, 'user-interaction', {
      attributes: {
        event_type: eventType,
        target_element: labeled.tagName,
        'http.url': window.location.href,
      },
    });
  }
  return true;
}

/**
 * A user action. Runs inside the click operation that triggered it, so the
 * transaction is named after the clicked element and lasts until fn finishes.
 * Without a pending click it becomes its own operation named `name`.
 */
export function traceAction(name, attributes, fn) {
  const op = currentOperation;
  if (op && op.kind === 'user-interaction' && !op.ended && !op.adopted) {
    op.adopted = true;
    return runInOperation(op, null, { 'app.action': name, ...attributes }, fn);
  }
  return runInOperation(startOperation(name, 'user-interaction'), null, attributes, fn);
}

/**
 * A data load. Becomes a child span of whichever page load, route change, or
 * action is in progress; on its own it starts an operation named `name`.
 */
export function traceLoad(name, fn) {
  if (currentOperation && !currentOperation.ended) {
    return runInOperation(currentOperation, name, undefined, fn);
  }
  return runInOperation(startOperation(name, 'data-load'), null, undefined, fn);
}
