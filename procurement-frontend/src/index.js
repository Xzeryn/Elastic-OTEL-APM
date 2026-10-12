/**
 * =============================================================================
 * PROCUREMENT FRONTEND - Entry Point with EDOT Browser (OpenTelemetry)
 * =============================================================================
 * This file starts the Elastic Distribution of OpenTelemetry Browser SDK
 * before React renders, so the full page load is captured.
 *
 * Telemetry path:
 *   Browser --OTLP/HTTP--> /otlp/ (nginx, same origin)
 *           --> EDOT Collector (adds Elastic API key) --> Elastic Serverless
 *
 * The API key never reaches the browser; the collector already holds it.
 *
 * Auto-instrumented by EDOT Browser:
 * - Page load timing, fetch/XHR calls (with W3C traceparent for backend
 *   correlation), clicks, uncaught errors, Web Vitals
 * telemetry.js names the resulting transactions by route and by the clicked
 * element's data-transaction-name.
 * =============================================================================
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { startBrowserSdk } from '@elastic/opentelemetry-browser';
import { handleClickSpan, startPageLoad } from './telemetry';
import './App.css';
import App from './App';

// =============================================================================
// SESSION CONTEXT
// =============================================================================
// A per-tab session ID lets you follow one user's journey in Kibana.
// =============================================================================
const generateSessionId = () => {
  return 'sess_' + Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15);
};

const sessionId = sessionStorage.getItem('procurement_session_id') || generateSessionId();
sessionStorage.setItem('procurement_session_id', sessionId);
window.__APM_SESSION_ID__ = sessionId;

// =============================================================================
// EDOT BROWSER INITIALIZATION
// =============================================================================
// otlpEndpoint must be an absolute URL ending in "/" - the SDK appends
// "v1/traces", "v1/metrics", and "v1/logs" directly to it.
// =============================================================================
const healthCheckUrls = [/\/health$/, /\/api\/services\/[^/]+\/health$/];

const traceHeaderCorsUrls = [process.env.REACT_APP_API_DOMAIN]
  .filter(Boolean)
  .map((origin) => new RegExp('^' + origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

startBrowserSdk({
  serviceName: 'procurement-frontend',
  serviceVersion: '1.0.0',
  otlpEndpoint: `${window.location.origin}/otlp/`,
  logLevel: 'info',
  sampleRate: 1.0,  // Capture 100% of traces for demo
  resourceAttributes: {
    'deployment.environment': 'K8s-OTEL',
    'deployment.environment.name': 'K8s-OTEL',
    'session.id': sessionId,
    'user.id': sessionId,
    'user.name': `procurement-user-${sessionId.slice(-6)}`,
    'app.feature_flags': ['newInvoiceUI', 'documentPreview'],
  },
  instrumentations: {
    '@opentelemetry/instrumentation-fetch': {
      // Same-origin /api calls get traceparent automatically
      propagateTraceHeaderCorsUrls: traceHeaderCorsUrls,
      // The service status panel polls health endpoints every 15s
      ignoreUrls: healthCheckUrls,
    },
    '@opentelemetry/instrumentation-xml-http-request': {
      propagateTraceHeaderCorsUrls: traceHeaderCorsUrls,
      ignoreUrls: healthCheckUrls,
    },
    // Clicks become "Click - <data-transaction-name>" operations (see telemetry.js)
    '@opentelemetry/instrumentation-user-interaction': {
      shouldPreventSpanCreation: handleClickSpan,
    },
    // Long tasks are always root spans, so each would be listed as its own
    // "longtask" transaction. Responsiveness is still covered by Web Vitals (INP).
    '@opentelemetry/instrumentation-long-task': {
      enabled: false,
    },
  },
});

startPageLoad();

// =============================================================================
// REACT APPLICATION RENDER
// =============================================================================
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
