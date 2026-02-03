/**
 * =============================================================================
 * PROCUREMENT FRONTEND - Main Application Component
 * =============================================================================
 * Government Procurement System with comprehensive Elastic RUM instrumentation.
 * 
 * Features:
 * - Dashboard with procurement metrics
 * - Vendor management
 * - Invoice tracking and submission
 * - Document upload
 * - Payment processing
 * - Full distributed tracing with backend services
 * =============================================================================
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { ApmRoutes } from '@elastic/apm-rum-react';

// =============================================================================
// APM HELPER FUNCTION
// =============================================================================
// Per Elastic RUM documentation (https://www.elastic.co/docs/reference/apm/agents/rum-js/agent-api),
// we access the APM instance at RUNTIME via a helper function, not at module load time.
// This ensures the agent is initialized before we try to use it.
//
// IMPORTANT: The RUM agent is initialized in index.js and stored in window.__ELASTIC_APM__.
// We must NOT access it at module load time because index.js sets it AFTER importing App.js.
//
// USAGE PATTERN FOR CUSTOM LABELS:
// --------------------------------
// 1. Get APM instance at runtime:     const apm = getApm();
// 2. Get current auto-transaction:    const transaction = apm?.getCurrentTransaction();
// 3. Add custom labels:               transaction?.addLabels({ 'key': 'value' });
//
// DO NOT create new transactions with apm.startTransaction() - this breaks the
// auto-captured transaction and loses span visibility. Instead, add labels to
// the existing auto-captured transaction (named via data-transaction-name attribute).
//
// TRANSACTION NAMING:
// -------------------
// Interactive elements use data-transaction-name="Action Name" attribute.
// The RUM agent creates "Click - Action Name" transactions automatically.
// =============================================================================
const getApm = () => window.__ELASTIC_APM__;

// =============================================================================
// ICONS (SVG Components)
// =============================================================================
const Icons = {
  Dashboard: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  ),
  Vendors: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  Invoices: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  ),
  Payments: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
      <line x1="1" y1="10" x2="23" y2="10"/>
    </svg>
  ),
  Documents: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  ),
  Check: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  Warning: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  Refresh: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
  ),
  Dollar: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="1" x2="12" y2="23"/>
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  ),
  Clock: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  )
};

// =============================================================================
// API BASE URL
// =============================================================================
const API_BASE = '/api';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
};

const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

const formatDateTime = (dateString) => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// =============================================================================
// SORT ICON COMPONENT
// =============================================================================
const SortIcon = ({ direction }) => (
  <span className="sort-icon">
    {direction === 'asc' ? '▲' : direction === 'desc' ? '▼' : '⇅'}
  </span>
);

// =============================================================================
// SORTABLE TABLE HEADER COMPONENT
// =============================================================================
const SortableHeader = ({ label, field, sortField, sortDirection, onSort }) => {
  const isActive = sortField === field;
  return (
    <th 
      className={`sortable ${isActive ? 'active' : ''}`}
      onClick={() => onSort(field)}
    >
      {label}
      <SortIcon direction={isActive ? sortDirection : null} />
    </th>
  );
};

const getStatusColor = (status) => {
  const colors = {
    draft: '#6c757d',
    submitted: '#ffc107',
    pending: '#17a2b8',
    approved: '#28a745',
    completed: '#28a745',
    failed: '#dc3545',
    active: '#28a745'
  };
  return colors[status] || '#6c757d';
};

// =============================================================================
// ARCHITECTURE MODAL COMPONENT
// =============================================================================
const architectureDiagram = `flowchart TB
    subgraph frontend [Frontend]
        React[React App<br/>Elastic RUM Agent]
    end
    
    subgraph backends [Backend Services - OTEL Auto-Instrumented]
        NodeJS[Node.js/Express<br/>Procurement API]
        Python[Python/Flask<br/>Document Service]
        Java[Java/Spring Boot<br/>Payment Service]
    end
    
    subgraph data [Data Layer]
        PostgreSQL[(PostgreSQL<br/>Procurement DB)]
        Redis[(Redis<br/>Cache)]
    end
    
    subgraph otel [OpenTelemetry]
        Collector[EDOT Collector<br/>Gateway Mode]
    end
    
    subgraph elastic [Elastic Cloud]
        MOTLP[Managed OTLP<br/>Ingest Endpoint]
        APMServer[APM Server]
        ES[(Elasticsearch)]
        Kibana[Kibana APM UI]
    end
    
    React -->|RUM traces| APMServer
    React -->|API calls + traceparent| NodeJS
    NodeJS --> Python
    NodeJS --> Java
    NodeJS --> PostgreSQL
    Python --> PostgreSQL
    Java --> PostgreSQL
    NodeJS --> Redis
    
    NodeJS -->|OTLP| Collector
    Python -->|OTLP| Collector
    Java -->|OTLP| Collector
    
    Collector -->|OTLP + ApiKey| MOTLP
    APMServer --> ES
    MOTLP --> ES
    ES --> Kibana`;

const tracingDiagram = `sequenceDiagram
    participant User
    participant RUM as Elastic RUM
    participant Nginx
    participant API as procurement-api<br/>(Node.js)
    participant Doc as document-service<br/>(Python)
    participant Pay as payment-service<br/>(Java)
    participant DB as PostgreSQL
    participant OTEL as EDOT Collector
    participant Cloud as Elastic Cloud

    Note over User,Cloud: Document Upload Flow
    User->>RUM: Click "Upload Document"
    RUM->>RUM: Create transaction<br/>(trace_id: abc123)
    RUM->>Nginx: POST /api/documents/upload<br/>(traceparent: abc123)
    Nginx->>API: Forward with traceparent
    API->>Doc: POST /api/documents/upload<br/>(traceparent: abc123)
    Doc->>Doc: Process & store file
    Doc->>DB: INSERT document record
    Doc-->>API: Document created
    API-->>Nginx: Response
    Nginx-->>RUM: 200 OK
    RUM->>Cloud: Send RUM spans

    API->>OTEL: Send spans (abc123)
    Doc->>OTEL: Send spans (abc123)
    OTEL->>Cloud: Forward via OTLP<br/>(ApiKey auth)

    Note over User,Cloud: Payment Processing Flow
    User->>RUM: Click "Process Payment"
    RUM->>RUM: Create transaction<br/>(trace_id: xyz789)
    RUM->>Nginx: POST /api/payments/process<br/>(traceparent: xyz789)
    Nginx->>API: Forward with traceparent
    API->>Pay: POST /api/payments/process<br/>(traceparent: xyz789)
    Pay->>DB: INSERT payment
    Pay-->>API: Payment confirmed
    API-->>RUM: 200 OK

    API->>OTEL: Send spans (xyz789)
    Pay->>OTEL: Send spans (xyz789)
    OTEL->>Cloud: Forward via OTLP

    Note over Cloud: Kibana correlates all spans<br/>by trace_id for full visibility`;

const ArchitectureModal = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState('architecture');
  const architectureRef = React.useRef(null);
  const tracingRef = React.useRef(null);

  useEffect(() => {
    if (isOpen && window.mermaid) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        if (activeTab === 'architecture' && architectureRef.current) {
          architectureRef.current.innerHTML = '';
          window.mermaid.render('arch-diagram', architectureDiagram).then(({ svg }) => {
            if (architectureRef.current) {
              architectureRef.current.innerHTML = svg;
            }
          });
        } else if (activeTab === 'tracing' && tracingRef.current) {
          tracingRef.current.innerHTML = '';
          window.mermaid.render('trace-diagram', tracingDiagram).then(({ svg }) => {
            if (tracingRef.current) {
              tracingRef.current.innerHTML = svg;
            }
          });
        }
      }, 100);
    }
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} data-transaction-name="Close Architecture Modal">×</button>
        <h2 className="modal-title">System Architecture</h2>
        
        <div className="modal-tabs">
          <button 
            className={`modal-tab ${activeTab === 'architecture' ? 'active' : ''}`}
            onClick={() => setActiveTab('architecture')}
            data-transaction-name="View Architecture Tab"
          >
            Architecture Overview
          </button>
          <button 
            className={`modal-tab ${activeTab === 'tracing' ? 'active' : ''}`}
            onClick={() => setActiveTab('tracing')}
            data-transaction-name="View Tracing Flow Tab"
          >
            Distributed Tracing Flow
          </button>
        </div>
        
        <div className="modal-diagram">
          {activeTab === 'architecture' && (
            <div ref={architectureRef} className="mermaid-container" />
          )}
          {activeTab === 'tracing' && (
            <div ref={tracingRef} className="mermaid-container" />
          )}
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// FOOTER SERVICE STATUS COMPONENT (Compact)
// =============================================================================
const serviceConfig = [
  { name: 'API', type: 'NodeJS', url: '/api/health', fullName: 'procurement-api' },
  { name: 'Docs', type: 'Python', url: '/api/services/document/health', fullName: 'document-service' },
  { name: 'Pay', type: 'Java', url: '/api/services/payment/health', fullName: 'payment-service' },
  { name: 'DB', type: 'Postgres', url: '/api/services/postgres/health', fullName: 'postgres' },
  { name: 'Cache', type: 'Redis', url: '/api/services/redis/health', fullName: 'redis' }
];

const FooterServiceStatus = () => {
  const [services, setServices] = useState(
    serviceConfig.map(s => ({ ...s, status: 'checking' }))
  );

  const checkServices = useCallback(async () => {
    const updatedServices = await Promise.all(
      serviceConfig.map(async (service) => {
        try {
          const response = await fetch(service.url, { 
            method: 'GET',
            signal: AbortSignal.timeout(5000)
          });
          return { 
            ...service, 
            status: response.ok ? 'online' : 'degraded'
          };
        } catch (err) {
          return { ...service, status: 'offline' };
        }
      })
    );
    setServices(updatedServices);
  }, []);

  useEffect(() => {
    checkServices();
    const interval = setInterval(checkServices, 15000); // Check every 15 seconds
    return () => clearInterval(interval);
  }, [checkServices]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'online': return '#28a745';
      case 'degraded': return '#ffc107';
      case 'offline': return '#dc3545';
      default: return '#6c757d';
    }
  };

  return (
    <div className="footer-status">
      {services.map(service => (
        <div key={service.name} className="footer-status-item" title={`${service.fullName}: ${service.status}`}>
          <span 
            className="footer-status-dot" 
            style={{ backgroundColor: getStatusColor(service.status) }}
          />
          <span className="footer-status-name">{service.name}</span>
          <span className="footer-status-type">{service.type}</span>
        </div>
      ))}
    </div>
  );
};

// =============================================================================
// DASHBOARD COMPONENT
// =============================================================================
const Dashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboard = useCallback(async () => {
    // Get the auto-captured transaction and add custom labels
    const apm = getApm();
    const transaction = apm?.getCurrentTransaction();

    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/dashboard`);
      if (!response.ok) throw new Error('Failed to fetch dashboard');
      const result = await response.json();
      setData(result);
      setError(null);
      
      if (transaction) {
        transaction.addLabels({ 'dashboard.loaded': true });
      }
    } catch (err) {
      setError(err.message);
      if (apm) apm.captureError(err);
    } finally {
      setLoading(false);
      // Don't manually end - let the auto-transaction handle its lifecycle
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading && !data) {
    return (
      <div className="loading-inline">
        <div className="spinner-small"></div>
        <span>Loading dashboard metrics...</span>
      </div>
    );
  }

  if (error) {
    return <div className="error-card">Error: {error}</div>;
  }

  const invoiceStats = data?.invoices || {};
  const vendorStats = data?.vendors || {};
  const paymentStats = data?.payments || {};
  const recentInvoices = data?.recentInvoices || [];

  return (
    <div>
      <div className="section-header">
        <h2>Procurement Dashboard</h2>
        <p>Overview of procurement activities and metrics</p>
        <button className="refresh-btn" onClick={fetchDashboard} disabled={loading} data-transaction-name="Refresh Dashboard">
          <Icons.Refresh />
          <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="services-grid">
        <div className="service-card" style={{ borderLeftColor: '#667eea' }}>
          <div className="service-header">
            <div className="service-icon" style={{ background: 'rgba(102, 126, 234, 0.2)', color: '#667eea' }}>
              <Icons.Invoices />
            </div>
            <div className="service-info">
              <h3>Invoices</h3>
              <span className="status-badge online">{invoiceStats.total || 0} Total</span>
            </div>
          </div>
          <div className="service-details">
            <div className="detail-row">
              <span>Draft:</span> <strong>{invoiceStats.draft || 0}</strong>
            </div>
            <div className="detail-row">
              <span>Submitted:</span> <strong>{invoiceStats.submitted || 0}</strong>
            </div>
            <div className="detail-row">
              <span>Pending:</span> <strong>{invoiceStats.pending || 0}</strong>
            </div>
            <div className="detail-row">
              <span>Approved:</span> <strong>{invoiceStats.approved || 0}</strong>
            </div>
            <div className="detail-row">
              <span>Total Amount:</span> <strong>{formatCurrency(invoiceStats.total_amount || 0)}</strong>
            </div>
          </div>
        </div>

        <div className="service-card" style={{ borderLeftColor: '#28a745' }}>
          <div className="service-header">
            <div className="service-icon" style={{ background: 'rgba(40, 167, 69, 0.2)', color: '#28a745' }}>
              <Icons.Vendors />
            </div>
            <div className="service-info">
              <h3>Vendors</h3>
              <span className="status-badge online">{vendorStats.active || 0} Active</span>
            </div>
          </div>
          <div className="service-details">
            <div className="detail-row">
              <span>Total Vendors:</span> <strong>{vendorStats.total || 0}</strong>
            </div>
            <div className="detail-row">
              <span>Active:</span> <strong>{vendorStats.active || 0}</strong>
            </div>
          </div>
        </div>

        <div className="service-card" style={{ borderLeftColor: '#ffc107' }}>
          <div className="service-header">
            <div className="service-icon" style={{ background: 'rgba(255, 193, 7, 0.2)', color: '#ffc107' }}>
              <Icons.Payments />
            </div>
            <div className="service-info">
              <h3>Payments</h3>
              <span className="status-badge online">{paymentStats.completed || 0} Completed</span>
            </div>
          </div>
          <div className="service-details">
            <div className="detail-row">
              <span>Total Payments:</span> <strong>{paymentStats.total || 0}</strong>
            </div>
            <div className="detail-row">
              <span>Total Paid:</span> <strong>{formatCurrency(paymentStats.total_paid || 0)}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Invoices */}
      <div className="dashboard-stats">
        <h3><Icons.Clock /> Recent Invoices</h3>
        <div className="stats-grid">
          {recentInvoices.map(invoice => (
            <div key={invoice.id} className="stat-card">
              <div className="stat-icon">
                <Icons.Invoices />
              </div>
              <div className="stat-info">
                <span className="stat-label">{invoice.invoice_number}</span>
                <span className="stat-value">{formatCurrency(invoice.amount)}</span>
                <span className="stat-label" style={{ color: getStatusColor(invoice.status) }}>
                  {invoice.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

// =============================================================================
// VENDORS COMPONENT
// =============================================================================
const Vendors = () => {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '' });

  const fetchVendors = useCallback(async () => {
    const apm = getApm();

    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/vendors`);
      const data = await response.json();
      setVendors(data.vendors || []);
    } catch (err) {
      if (apm) apm.captureError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const apm = getApm();
    const transaction = apm?.getCurrentTransaction();
    
    if (transaction) {
      transaction.addLabels({ 'vendor.name': formData.name });
    }

    try {
      const response = await fetch(`${API_BASE}/vendors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (response.ok) {
        setFormData({ name: '', email: '', phone: '' });
        setShowForm(false);
        fetchVendors();
      }
    } catch (err) {
      if (apm) apm.captureError(err);
    }
  };

  return (
    <div>
      <div className="section-header">
        <h2>Vendor Management</h2>
        <p>Manage procurement vendors and suppliers</p>
        <button className="refresh-btn" onClick={() => setShowForm(!showForm)} data-transaction-name={showForm ? 'Cancel Add Vendor' : 'Open Add Vendor Form'}>
          {showForm ? 'Cancel' : '+ Add Vendor'}
        </button>
      </div>

      {showForm && (
        <div className="upload-card" style={{ marginBottom: '2rem' }}>
          <form onSubmit={handleSubmit} className="upload-form">
            <input
              type="text"
              placeholder="Vendor Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: 'white' }}
              required
            />
            <input
              type="email"
              placeholder="Email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: 'white' }}
            />
            <input
              type="text"
              placeholder="Phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: 'white' }}
            />
            <button type="submit" className="upload-button" data-transaction-name="Create Vendor">Create Vendor</button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="loading-inline">
          <div className="spinner-small"></div>
          <span>Loading vendors...</span>
        </div>
      ) : (
        <div className="services-grid">
          {vendors.map(vendor => (
            <div key={vendor.id} className="service-card" style={{ borderLeftColor: getStatusColor(vendor.status) }}>
              <div className="service-header">
                <div className="service-icon" style={{ background: 'rgba(102, 126, 234, 0.2)', color: '#667eea' }}>
                  <Icons.Vendors />
                </div>
                <div className="service-info">
                  <h3>{vendor.name}</h3>
                  <span className="status-badge online">{vendor.status}</span>
                </div>
              </div>
              <div className="service-details">
                <div className="detail-row">
                  <span>Email:</span> <strong>{vendor.email || 'N/A'}</strong>
                </div>
                <div className="detail-row">
                  <span>Phone:</span> <strong>{vendor.phone || 'N/A'}</strong>
                </div>
                <div className="detail-row">
                  <span>ID:</span> <code>VND-{vendor.id}</code>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// INVOICES COMPONENT
// =============================================================================
const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50];

const Invoices = () => {
  const [invoices, setInvoices] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(null);
  const [approving, setApproving] = useState(null);
  const [formData, setFormData] = useState({ vendor_id: '', amount: '', description: '' });
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  // Sorting state - default sort by invoice_number
  const [sortField, setSortField] = useState('invoice_number');
  const [sortDirection, setSortDirection] = useState('desc');

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1); // Reset to first page when sorting
  };

  const fetchData = useCallback(async () => {
    const apm = getApm();

    try {
      setLoading(true);
      const [invRes, venRes] = await Promise.all([
        fetch(`${API_BASE}/invoices`),
        fetch(`${API_BASE}/vendors`)
      ]);
      const invData = await invRes.json();
      const venData = await venRes.json();
      setInvoices(invData.invoices || []);
      setVendors(venData.vendors || []);
    } catch (err) {
      if (apm) apm.captureError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreate = async (e) => {
    e.preventDefault();
    const apm = getApm();
    const transaction = apm?.getCurrentTransaction();
    
    if (transaction) {
      transaction.addLabels({ 'invoice.amount': formData.amount });
    }

    try {
      const response = await fetch(`${API_BASE}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (response.ok) {
        setFormData({ vendor_id: '', amount: '', description: '' });
        setShowForm(false);
        fetchData();
      }
    } catch (err) {
      if (apm) apm.captureError(err);
    }
  };

  const handleSubmit = async (invoiceId) => {
    const apm = getApm();
    const transaction = apm?.getCurrentTransaction();
    
    if (transaction) {
      transaction.addLabels({ 'invoice.id': invoiceId });
    }

    try {
      setSubmitting(invoiceId);
      const response = await fetch(`${API_BASE}/invoices/${invoiceId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const result = await response.json();
      
      if (transaction) {
        transaction.addLabels({
          'submit.success': result.success,
          'document.valid': result.documentValidation?.valid,
          'payment.valid': result.paymentValidation?.valid
        });
      }
      
      fetchData();
    } catch (err) {
      if (apm) apm.captureError(err);
    } finally {
      setSubmitting(null);
    }
  };

  const handleApprove = async (invoiceId) => {
    const apm = getApm();
    try {
      setApproving(invoiceId);
      await fetch(`${API_BASE}/invoices/${invoiceId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      fetchData();
    } catch (err) {
      if (apm) apm.captureError(err);
    } finally {
      setApproving(null);
    }
  };

  // Sorting function
  const sortedInvoices = [...invoices].sort((a, b) => {
    let aVal = a[sortField];
    let bVal = b[sortField];
    
    // Handle special cases
    if (sortField === 'amount') {
      aVal = parseFloat(aVal) || 0;
      bVal = parseFloat(bVal) || 0;
    } else if (sortField === 'created_at') {
      aVal = new Date(aVal).getTime();
      bVal = new Date(bVal).getTime();
    } else if (sortField === 'actions') {
      // Sort by action priority: draft(1)=Submit, submitted(2)=Approve, approved(3)=Completed
      const actionPriority = { draft: 1, submitted: 2, approved: 3, pending: 2 };
      aVal = actionPriority[a.status] || 99;
      bVal = actionPriority[b.status] || 99;
    } else if (typeof aVal === 'string') {
      aVal = aVal.toLowerCase();
      bVal = (bVal || '').toLowerCase();
    }
    
    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // Pagination calculations
  const totalPages = Math.ceil(sortedInvoices.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedInvoices = sortedInvoices.slice(startIndex, startIndex + itemsPerPage);
  
  // Summary stats
  const totalAmount = invoices.reduce((sum, inv) => sum + parseFloat(inv.amount || 0), 0);
  const statusCounts = invoices.reduce((acc, inv) => {
    acc[inv.status] = (acc[inv.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <div className="section-header">
        <h2>Invoice Management</h2>
        <p>Track and manage procurement invoices</p>
        <button className="refresh-btn" onClick={() => setShowForm(!showForm)} data-transaction-name={showForm ? 'Cancel Create Invoice' : 'Open Create Invoice Form'}>
          {showForm ? 'Cancel' : '+ Create Invoice'}
        </button>
      </div>

      {showForm && (
        <div className="upload-card" style={{ marginBottom: '2rem' }}>
          <form onSubmit={handleCreate} className="upload-form">
            <select
              value={formData.vendor_id}
              onChange={(e) => setFormData({ ...formData, vendor_id: e.target.value })}
              style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: 'white' }}
              required
              data-transaction-name="Select Invoice Vendor"
            >
              <option value="">Select Vendor</option>
              {vendors.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Amount"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: 'white' }}
              required
            />
            <input
              type="text"
              placeholder="Description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: 'white' }}
            />
            <button type="submit" className="upload-button" data-transaction-name="Create Invoice">Create Invoice</button>
          </form>
        </div>
      )}

      {/* Summary Stats Bar */}
      {!loading && (
        <div className="summary-bar">
          <div className="summary-stat">
            <span className="stat-label">Total Invoices</span>
            <span className="stat-value">{invoices.length}</span>
          </div>
          <div className="summary-stat">
            <span className="stat-label">Total Amount</span>
            <span className="stat-value currency">{formatCurrency(totalAmount)}</span>
          </div>
          <div className="summary-stat">
            <span className="stat-label">Approved</span>
            <span className="stat-value approved">{statusCounts.approved || 0}</span>
          </div>
          <div className="summary-stat">
            <span className="stat-label">Pending</span>
            <span className="stat-value pending">{(statusCounts.draft || 0) + (statusCounts.submitted || 0)}</span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading-inline">
          <div className="spinner-small"></div>
          <span>Loading invoices...</span>
        </div>
      ) : invoices.length === 0 ? (
        <div className="data-table-container">
          <div className="empty-state">
            <Icons.Invoices />
            <p>No invoices found. Create your first invoice above.</p>
          </div>
        </div>
      ) : (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <SortableHeader label="Invoice #" field="invoice_number" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                <SortableHeader label="Vendor" field="vendor_name" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                <SortableHeader label="Amount" field="amount" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                <SortableHeader label="Status" field="status" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                <SortableHeader label="Created" field="created_at" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                <SortableHeader label="Actions" field="actions" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {paginatedInvoices.map(invoice => (
                <tr key={invoice.id}>
                  <td className="mono">{invoice.invoice_number}</td>
                  <td>{invoice.vendor_name}</td>
                  <td className="amount">{formatCurrency(invoice.amount)}</td>
                  <td>
                    <span className={`status-pill ${invoice.status}`}>{invoice.status}</span>
                  </td>
                  <td className="date">{formatDate(invoice.created_at)}</td>
                  <td>
                    {invoice.status === 'draft' && (
                      <button
                        className="action-btn primary"
                        onClick={() => handleSubmit(invoice.id)}
                        disabled={submitting === invoice.id}
                        data-transaction-name="Submit Invoice"
                      >
                        {submitting === invoice.id ? 'Submitting...' : 'Submit'}
                      </button>
                    )}
                    {invoice.status === 'submitted' && (
                      <button
                        className="action-btn primary"
                        onClick={() => handleApprove(invoice.id)}
                        disabled={approving === invoice.id}
                        data-transaction-name="Approve Invoice"
                      >
                        {approving === invoice.id ? 'Approving...' : 'Approve'}
                      </button>
                    )}
                    {invoice.status === 'approved' && (
                      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>Completed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {/* Pagination */}
          <div className="pagination">
            <div className="pagination-info">
              Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, sortedInvoices.length)} of {sortedInvoices.length} invoices
            </div>
            <div className="pagination-controls">
              <select 
                className="page-size-select" 
                value={itemsPerPage} 
                onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              >
                {ITEMS_PER_PAGE_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt} per page</option>
                ))}
              </select>
              <button 
                className="pagination-btn" 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </button>
              {totalPages <= 5 ? (
                [...Array(totalPages)].map((_, i) => (
                  <button
                    key={i + 1}
                    className={`pagination-btn ${currentPage === i + 1 ? 'active' : ''}`}
                    onClick={() => setCurrentPage(i + 1)}
                  >
                    {i + 1}
                  </button>
                ))
              ) : (
                <span style={{ color: 'rgba(255,255,255,0.6)', padding: '0 0.5rem' }}>
                  Page {currentPage} of {totalPages}
                </span>
              )}
              <button 
                className="pagination-btn" 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// PAYMENTS COMPONENT
// =============================================================================
const Payments = () => {
  const [payments, setPayments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  // Sorting state - default sort by payment_number
  const [sortField, setSortField] = useState('payment_number');
  const [sortDirection, setSortDirection] = useState('desc');

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const fetchData = useCallback(async () => {
    const apm = getApm();

    try {
      setLoading(true);
      const [payRes, invRes] = await Promise.all([
        fetch(`${API_BASE}/payments`),
        fetch(`${API_BASE}/invoices`)
      ]);
      const payData = await payRes.json();
      const invData = await invRes.json();
      setPayments(payData.payments || []);
      setInvoices((invData.invoices || []).filter(i => i.status === 'submitted' || i.status === 'pending'));
    } catch (err) {
      if (apm) apm.captureError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const processPayment = async (invoiceId) => {
    const apm = getApm();
    const transaction = apm?.getCurrentTransaction();
    
    if (transaction) {
      transaction.addLabels({ 'invoice.id': invoiceId });
    }

    try {
      setProcessing(invoiceId);
      const response = await fetch(`${API_BASE}/payments/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: invoiceId })
      });
      const result = await response.json();
      
      if (transaction) {
        transaction.addLabels({
          'payment.success': result.success,
          'payment.number': result.payment_number,
          'payment.amount': result.amount
        });
      }
      
      fetchData();
    } catch (err) {
      if (apm) apm.captureError(err);
    } finally {
      setProcessing(null);
    }
  };

  // Sorting function
  const sortedPayments = [...payments].sort((a, b) => {
    let aVal = a[sortField];
    let bVal = b[sortField];
    
    if (sortField === 'amount') {
      aVal = parseFloat(aVal) || 0;
      bVal = parseFloat(bVal) || 0;
    } else if (sortField === 'processed_at') {
      aVal = new Date(aVal).getTime();
      bVal = new Date(bVal).getTime();
    } else if (typeof aVal === 'string') {
      aVal = aVal.toLowerCase();
      bVal = (bVal || '').toLowerCase();
    }
    
    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // Pagination calculations
  const totalPages = Math.ceil(sortedPayments.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedPayments = sortedPayments.slice(startIndex, startIndex + itemsPerPage);
  
  // Summary stats
  const totalAmount = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
  const pendingAmount = invoices.reduce((sum, i) => sum + parseFloat(i.amount || 0), 0);

  return (
    <div>
      <div className="section-header">
        <h2>Payment Processing</h2>
        <p>Process payments and view payment history</p>
        <button className="refresh-btn" onClick={fetchData} data-transaction-name="Refresh Payments">
          <Icons.Refresh /> Refresh
        </button>
      </div>

      {/* Summary Stats Bar */}
      {!loading && (
        <div className="summary-bar">
          <div className="summary-stat">
            <span className="stat-label">Total Payments</span>
            <span className="stat-value">{payments.length}</span>
          </div>
          <div className="summary-stat">
            <span className="stat-label">Total Processed</span>
            <span className="stat-value currency">{formatCurrency(totalAmount)}</span>
          </div>
          <div className="summary-stat">
            <span className="stat-label">Pending</span>
            <span className="stat-value pending">{invoices.length}</span>
          </div>
          <div className="summary-stat">
            <span className="stat-label">Pending Amount</span>
            <span className="stat-value pending">{formatCurrency(pendingAmount)}</span>
          </div>
        </div>
      )}

      {/* Pending Payments to Process */}
      {invoices.length > 0 && (
        <div className="data-table-container" style={{ marginBottom: '2rem' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ width: '18px', height: '18px', display: 'inline-flex' }}><Icons.Clock /></span>
              Invoices Awaiting Payment
            </h3>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(invoice => (
                <tr key={invoice.id}>
                  <td className="mono">{invoice.invoice_number}</td>
                  <td className="amount">{formatCurrency(invoice.amount)}</td>
                  <td><span className="status-pill submitted">{invoice.status}</span></td>
                  <td>
                    <button
                      className="action-btn primary"
                      onClick={() => processPayment(invoice.id)}
                      disabled={processing === invoice.id}
                      data-transaction-name="Process Payment"
                    >
                      {processing === invoice.id ? 'Processing...' : 'Process Payment'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Payment History */}
      {loading ? (
        <div className="loading-inline">
          <div className="spinner-small"></div>
          <span>Loading payments...</span>
        </div>
      ) : payments.length === 0 ? (
        <div className="data-table-container">
          <div className="empty-state">
            <Icons.Dollar />
            <p>No payments processed yet.</p>
          </div>
        </div>
      ) : (
        <div className="data-table-container">
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', color: '#4ade80' }}>Payment History</h3>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <SortableHeader label="Payment #" field="payment_number" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                <SortableHeader label="Invoice #" field="invoice_number" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                <SortableHeader label="Amount" field="amount" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                <SortableHeader label="Status" field="status" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                <SortableHeader label="Processed" field="processed_at" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                <SortableHeader label="Confirmation" field="confirmation_number" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {paginatedPayments.map(payment => (
                <tr key={payment.id}>
                  <td className="mono">{payment.payment_number}</td>
                  <td className="mono">{payment.invoice_number}</td>
                  <td className="amount">{formatCurrency(payment.amount)}</td>
                  <td><span className={`status-pill ${payment.status}`}>{payment.status}</span></td>
                  <td className="date">{formatDate(payment.processed_at)}</td>
                  <td className="mono" style={{ fontSize: '0.8rem' }}>{payment.confirmation_number || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {/* Pagination */}
          {sortedPayments.length > itemsPerPage && (
            <div className="pagination">
              <div className="pagination-info">
                Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, sortedPayments.length)} of {sortedPayments.length} payments
              </div>
              <div className="pagination-controls">
                <select 
                  className="page-size-select" 
                  value={itemsPerPage} 
                  onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                >
                  {ITEMS_PER_PAGE_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt} per page</option>
                  ))}
                </select>
                <button 
                  className="pagination-btn" 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </button>
                <span style={{ color: 'rgba(255,255,255,0.6)', padding: '0 0.5rem' }}>
                  Page {currentPage} of {totalPages}
                </span>
                <button 
                  className="pagination-btn" 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// DOCUMENTS COMPONENT
// =============================================================================
const Documents = () => {
  const [documents, setDocuments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState('');
  const [uploadStatus, setUploadStatus] = useState(null);
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  // Sorting state - default sort by uploaded_at (newest first)
  const [sortField, setSortField] = useState('uploaded_at');
  const [sortDirection, setSortDirection] = useState('desc');

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const fetchData = useCallback(async () => {
    const apm = getApm();

    try {
      setLoading(true);
      const [docRes, invRes] = await Promise.all([
        fetch(`${API_BASE}/documents`),
        fetch(`${API_BASE}/invoices`)
      ]);
      const docData = await docRes.json();
      const invData = await invRes.json();
      setDocuments(docData.documents || []);
      setInvoices(invData.invoices || []);
    } catch (err) {
      if (apm) apm.captureError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setUploadStatus(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    // Get APM instance and the auto-captured transaction at runtime
    // Per Elastic RUM documentation, we add labels to the existing auto-captured
    // transaction rather than creating a new one, to preserve full span visibility
    const apm = getApm();
    const transaction = apm?.getCurrentTransaction();
    
    // Add file metadata labels to the auto-captured "Click - Upload Document" transaction
    // Labels are indexed and searchable in Elasticsearch
    if (transaction) {
      transaction.addLabels({
        'file.name': selectedFile.name,
        'file.size_bytes': selectedFile.size,
        'file.size_mb': (selectedFile.size / (1024 * 1024)).toFixed(2),
        'file.type': selectedFile.type || 'unknown',
        'session.id': window.__APM_SESSION_ID__ || 'unknown'
      });
    }

    const startTime = Date.now();
    setUploading(true);
    setUploadStatus({ message: 'Uploading document...', type: 'progress' });

    try {
      // Create FormData to send actual file binary
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (selectedInvoice) formData.append('invoice_id', selectedInvoice);
      formData.append('document_type', 'invoice');

      const response = await fetch(`${API_BASE}/documents/upload`, {
        method: 'POST',
        body: formData  // No Content-Type header - browser sets it with boundary
      });

      const result = await response.json();
      const uploadDuration = Date.now() - startTime;

      if (result.success) {
        // Build success message with processing details if available
        let successMsg = `Document "${selectedFile.name}" uploaded successfully!\nSize: ${(selectedFile.size / 1024).toFixed(1)} KB`;
        if (result.processing) {
          successMsg += `\nProcessing: ${result.processing.total_ms}ms`;
        }
        if (result.cleanup_scheduled_seconds) {
          successMsg += `\nAuto-cleanup in ${result.cleanup_scheduled_seconds}s`;
        }
        
        setUploadStatus({
          message: successMsg,
          type: 'success'
        });
        
        // Add success labels to the transaction
        if (transaction) {
          transaction.addLabels({
            'upload.success': true,
            'upload.duration_ms': uploadDuration,
            'document.reference': result.reference,
            'processing.total_ms': result.processing?.total_ms
          });
        }
        
        setSelectedFile(null);
        fetchData();
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (err) {
      setUploadStatus({ message: `Upload failed: ${err.message}`, type: 'error' });
      if (apm) apm.captureError(err);
      if (transaction) {
        transaction.addLabels({ 'upload.success': false, 'upload.error': err.message });
      }
    } finally {
      setUploading(false);
      // Don't manually end the transaction - let the auto-instrumentation handle it
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  return (
    <div>
      <div className="section-header">
        <h2>Document Management</h2>
        <p>Upload and manage procurement documents</p>
      </div>

      {/* Upload Section */}
      <div className="upload-card" style={{ marginBottom: '2rem' }}>
        <div className="upload-form">
          <select
            value={selectedInvoice}
            onChange={(e) => setSelectedInvoice(e.target.value)}
            style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: 'white' }}
            data-transaction-name="Select Document Invoice"
          >
            <option value="">No Invoice (General Document)</option>
            {invoices.map(inv => (
              <option key={inv.id} value={inv.id}>{inv.invoice_number} - {formatCurrency(inv.amount)}</option>
            ))}
          </select>

          <div 
            className={`dropzone ${selectedFile ? 'has-file' : ''}`}
            onClick={() => document.getElementById('file-input').click()}
            data-transaction-name="Select File"
          >
            <input
              id="file-input"
              type="file"
              style={{ display: 'none' }}
              onChange={handleFileSelect}
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx"
            />
            <div className="dropzone-content">
              <Icons.Documents />
              {selectedFile ? (
                <>
                  <p className="filename">{selectedFile.name}</p>
                  <p className="filesize">{formatFileSize(selectedFile.size)}</p>
                </>
              ) : (
                <>
                  <p>Click to select a document</p>
                  <p className="hint">PDF, DOC, XLS, JPG, PNG (Max 10MB)</p>
                </>
              )}
            </div>
          </div>

          <button 
            className="upload-button" 
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            data-transaction-name="Upload Document"
          >
            {uploading ? 'Uploading...' : 'Upload Document'}
          </button>

          {uploadStatus && (
            <div className={`upload-status ${uploadStatus.type}`}>
              {uploadStatus.type === 'success' && <Icons.Check />}
              {uploadStatus.type === 'error' && <Icons.Warning />}
              {uploadStatus.message}
            </div>
          )}
        </div>
      </div>

      {/* Summary Stats Bar */}
      {!loading && (
        <div className="summary-bar">
          <div className="summary-stat">
            <span className="stat-label">Total Documents</span>
            <span className="stat-value">{documents.length}</span>
          </div>
          <div className="summary-stat">
            <span className="stat-label">Total Size</span>
            <span className="stat-value">{formatFileSize(documents.reduce((sum, d) => sum + (d.file_size || 0), 0))}</span>
          </div>
          <div className="summary-stat">
            <span className="stat-label">Validated</span>
            <span className="stat-value approved">{documents.filter(d => d.status === 'validated').length}</span>
          </div>
          <div className="summary-stat">
            <span className="stat-label">Pending</span>
            <span className="stat-value pending">{documents.filter(d => d.status === 'pending' || d.status === 'uploaded').length}</span>
          </div>
        </div>
      )}

      {/* Documents List */}
      {(() => {
        // Sorting function
        const sortedDocs = [...documents].sort((a, b) => {
          let aVal = a[sortField];
          let bVal = b[sortField];
          
          if (sortField === 'file_size') {
            aVal = parseInt(aVal) || 0;
            bVal = parseInt(bVal) || 0;
          } else if (sortField === 'uploaded_at') {
            aVal = new Date(aVal).getTime();
            bVal = new Date(bVal).getTime();
          } else if (sortField === 'original_filename') {
            aVal = (a.original_filename || a.filename || '').toLowerCase();
            bVal = (b.original_filename || b.filename || '').toLowerCase();
          } else if (typeof aVal === 'string') {
            aVal = (aVal || '').toLowerCase();
            bVal = (bVal || '').toLowerCase();
          }
          
          if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
          if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
          return 0;
        });

        // Pagination calculations
        const totalPages = Math.ceil(sortedDocs.length / itemsPerPage);
        const startIndex = (currentPage - 1) * itemsPerPage;
        const paginatedDocs = sortedDocs.slice(startIndex, startIndex + itemsPerPage);
        
        if (loading) {
          return (
            <div className="loading-inline">
              <div className="spinner-small"></div>
              <span>Loading documents...</span>
            </div>
          );
        }
        
        if (documents.length === 0) {
          return (
            <div className="data-table-container">
              <div className="empty-state">
                <Icons.Documents />
                <p>No documents found. Upload your first document above.</p>
              </div>
            </div>
          );
        }
        
        return (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <SortableHeader label="Filename" field="original_filename" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                  <SortableHeader label="Invoice" field="invoice_number" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                  <SortableHeader label="Size" field="file_size" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                  <SortableHeader label="Type" field="document_type" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                  <SortableHeader label="Status" field="status" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                  <SortableHeader label="Uploaded" field="uploaded_at" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {paginatedDocs.map(doc => (
                  <tr key={doc.id}>
                    <td>
                      <div className="file-info">
                        <span className="filename">{doc.original_filename || doc.filename}</span>
                        <span className="filesize">{doc.mime_type || 'unknown'}</span>
                      </div>
                    </td>
                    <td className="mono">{doc.invoice_number || '-'}</td>
                    <td>{formatFileSize(doc.file_size)}</td>
                    <td style={{ textTransform: 'capitalize' }}>{doc.document_type}</td>
                    <td><span className={`status-pill ${doc.status}`}>{doc.status}</span></td>
                    <td className="date">{formatDateTime(doc.uploaded_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {/* Pagination */}
            {sortedDocs.length > itemsPerPage && (
              <div className="pagination">
                <div className="pagination-info">
                  Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, sortedDocs.length)} of {sortedDocs.length} documents
                </div>
                <div className="pagination-controls">
                  <select 
                    className="page-size-select" 
                    value={itemsPerPage} 
                    onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                  >
                    {ITEMS_PER_PAGE_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>{opt} per page</option>
                    ))}
                  </select>
                  <button 
                    className="pagination-btn" 
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </button>
                  <span style={{ color: 'rgba(255,255,255,0.6)', padding: '0 0.5rem' }}>
                    Page {currentPage} of {totalPages}
                  </span>
                  <button 
                    className="pagination-btn" 
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
};

// =============================================================================
// MAIN APP COMPONENT
// =============================================================================
function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showArchModal, setShowArchModal] = useState(false);

  const tabs = [
    { id: 'dashboard', path: '/', label: 'Dashboard', icon: Icons.Dashboard },
    { id: 'vendors', path: '/vendors', label: 'Vendors', icon: Icons.Vendors },
    { id: 'invoices', path: '/invoices', label: 'Invoices', icon: Icons.Invoices },
    { id: 'payments', path: '/payments', label: 'Payments', icon: Icons.Payments },
    { id: 'documents', path: '/documents', label: 'Documents', icon: Icons.Documents }
  ];

  const currentPath = location.pathname;

  return (
    <div className="App">
      <header className="App-header">
        <div className="header-content">
          <h1>Government Procurement System</h1>
          <p>Elastic APM Distributed Tracing Demo</p>
        </div>
        <div className="header-badge">
          <Icons.Check />
          <span>K8s-OTEL Environment</span>
        </div>
      </header>

      <nav className="tab-navigation">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab ${currentPath === tab.path ? 'active' : ''}`}
            onClick={() => navigate(tab.path)}
            data-transaction-name={`Navigate to ${tab.label}`}
          >
            <tab.icon />
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      <main className="main-content">
        <ApmRoutes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/vendors" element={<Vendors />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/documents" element={<Documents />} />
        </ApmRoutes>
      </main>

      <footer className="App-footer">
        <div className="footer-content">
          <span className="footer-version" onClick={() => setShowArchModal(true)} data-transaction-name="View Architecture Diagram">
            Procurement System v1.0.0
          </span>
          <span className="footer-divider">•</span>
          <span>Elastic APM Demo</span>
        </div>
        <FooterServiceStatus />
      </footer>

      <ArchitectureModal isOpen={showArchModal} onClose={() => setShowArchModal(false)} />
    </div>
  );
}

export default App;
