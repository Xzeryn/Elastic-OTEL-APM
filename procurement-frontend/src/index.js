/**
 * =============================================================================
 * PROCUREMENT FRONTEND - Entry Point with Elastic RUM
 * =============================================================================
 * This file initializes Elastic Real User Monitoring (RUM) for the React 
 * frontend application. RUM captures browser-side performance metrics and
 * enables distributed tracing from user clicks through backend services.
 * 
 * Key RUM Features Enabled:
 * - Page load performance tracking
 * - Route change transactions (via ApmRoutes)
 * - User interactions and custom transactions
 * - Distributed tracing with backend services
 * - Long task monitoring
 * - User and session context
 * =============================================================================
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { init as initApm } from '@elastic/apm-rum';
import './App.css';
import App from './App';

// =============================================================================
// ELASTIC APM RUM INITIALIZATION
// =============================================================================
// The RUM agent is initialized BEFORE rendering to capture the full page load.
//
// CONFIGURATION:
// Environment variables are set in .env file (see .env.template for reference).
// These are baked in at build time via Create React App's REACT_APP_* convention.
// =============================================================================
const apm = initApm({
  // Service identification - matches what appears in Kibana APM
  serviceName: 'procurement-frontend',
  serviceVersion: '1.0.0',
  environment: 'K8s-OTEL',
  
  // APM Server configuration - RUM data goes directly to APM Server
  // Set REACT_APP_APM_SERVER_URL in .env file
  serverUrl: process.env.REACT_APP_APM_SERVER_URL,
  
  // ==========================================================================
  // DISTRIBUTED TRACING CONFIGURATION
  // ==========================================================================
  // These origins define which backend API calls will include the traceparent
  // header, enabling end-to-end trace correlation from browser to database.
  // Set REACT_APP_API_DOMAIN in .env file to match your Ingress hostname.
  // ==========================================================================
  distributedTracingOrigins: [
    window.location.origin,
    process.env.REACT_APP_API_DOMAIN,
  ].filter(Boolean),
  propagateTracestate: true,
  
  // Instrumentation settings
  instrument: true,
  transactionSampleRate: 1.0,  // Capture 100% of transactions for demo
  breakdownMetrics: true,
  
  // Log level for debugging (use 'warn' in production)
  logLevel: 'debug',
  
  // ==========================================================================
  // LONG TASK MONITORING
  // ==========================================================================
  // Captures JavaScript tasks that block the main thread for > 50ms
  // ==========================================================================
  monitorLongtasks: true,
  
  // ==========================================================================
  // TRANSACTION FILTERING
  // ==========================================================================
  // Ignore noisy/utility transactions that don't provide value
  // ==========================================================================
  ignoreTransactions: [
    /\/health/,
    /\/favicon/,
    /\/robots\.txt/,
    /\/manifest\.json/,
    /hot-update/
  ]
});

// =============================================================================
// SESSION AND USER CONTEXT
// =============================================================================
// Setting user context enables tracking sessions across page views
// This helps correlate user journeys in Kibana APM
// =============================================================================
const generateSessionId = () => {
  return 'sess_' + Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
};

const sessionId = sessionStorage.getItem('procurement_session_id') || generateSessionId();
sessionStorage.setItem('procurement_session_id', sessionId);

// Set user context for APM
apm.setUserContext({
  id: sessionId,
  username: `procurement-user-${sessionId.slice(-6)}`
});

// Set custom context with application metadata
apm.setCustomContext({
  sessionId: sessionId,
  appVersion: '1.0.0',
  buildTimestamp: new Date().toISOString(),
  platform: navigator.platform,
  language: navigator.language,
  screenResolution: `${window.screen.width}x${window.screen.height}`,
  viewportSize: `${window.innerWidth}x${window.innerHeight}`,
  featureFlags: {
    newInvoiceUI: true,
    documentPreview: true
  }
});

// Make APM available globally for custom transactions
window.__ELASTIC_APM__ = apm;
window.__APM_SESSION_ID__ = sessionId;

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
