/**
 * =============================================================================
 * PROCUREMENT API - Node.js/Express
 * =============================================================================
 * Main API gateway for the Government Procurement system.
 * 
 * Features:
 * - PostgreSQL database integration (auto-instrumented by OTEL)
 * - Redis caching (auto-instrumented by OTEL)
 * - Calls to Document Service and Payment Service
 * - Distributed trace context propagation
 * =============================================================================
 */

const express = require('express');
const { Pool } = require('pg');
const { createClient } = require('redis');
const axios = require('axios');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const FormData = require('form-data');

const app = express();
app.use(cors());
app.use(express.json());

// Configure multer for file uploads (store in memory for forwarding)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// =============================================================================
// DATABASE CONFIGURATION
// =============================================================================
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'postgres',
  port: parseInt(process.env.POSTGRES_PORT) || 5432,
  database: process.env.POSTGRES_DB || 'procurement',
  user: process.env.POSTGRES_USER || 'procurement_user',
  password: process.env.POSTGRES_PASSWORD || 'procurement_pass',
  max: 10,
  idleTimeoutMillis: 30000
});

// =============================================================================
// REDIS CONFIGURATION
// =============================================================================
let redisClient;
const connectRedis = async () => {
  redisClient = createClient({
    socket: {
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT) || 6379
    }
  });
  redisClient.on('error', (err) => console.log('Redis Client Error', err));
  await redisClient.connect();
  console.log('Connected to Redis');
};

// =============================================================================
// SERVICE URLS
// =============================================================================
const DOCUMENT_SERVICE_URL = process.env.DOCUMENT_SERVICE_URL || 'http://document-service:5000';
const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || 'http://payment-service:8080';

// =============================================================================
// LOGGING MIDDLEWARE
// =============================================================================
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// =============================================================================
// HEALTH CHECK
// =============================================================================
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', service: 'procurement-api', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ status: 'unhealthy', error: error.message });
  }
});

// Also expose at /api/health for frontend service status panel
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', service: 'procurement-api', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ status: 'unhealthy', error: error.message });
  }
});

// =============================================================================
// SERVICE HEALTH CHECK PROXIES (for frontend status panel)
// =============================================================================
app.get('/api/services/document/health', async (req, res) => {
  try {
    const response = await axios.get(`${DOCUMENT_SERVICE_URL}/health`, { timeout: 5000 });
    res.json(response.data);
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', service: 'document-service', error: error.message });
  }
});

app.get('/api/services/payment/health', async (req, res) => {
  try {
    const response = await axios.get(`${PAYMENT_SERVICE_URL}/actuator/health`, { timeout: 5000 });
    // Spring Boot returns { status: "UP" } - normalize to our format
    res.json({ 
      status: response.data.status === 'UP' ? 'healthy' : 'unhealthy', 
      service: 'payment-service',
      details: response.data 
    });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', service: 'payment-service', error: error.message });
  }
});

app.get('/api/services/postgres/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', service: 'postgres', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', service: 'postgres', error: error.message });
  }
});

app.get('/api/services/redis/health', async (req, res) => {
  try {
    await redisClient.ping();
    res.json({ status: 'healthy', service: 'redis', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', service: 'redis', error: error.message });
  }
});

// =============================================================================
// DASHBOARD - Aggregated metrics
// =============================================================================
app.get('/api/dashboard', async (req, res) => {
  console.log('Fetching dashboard metrics...');
  try {
    // Check cache first
    const cacheKey = 'dashboard_metrics';
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      console.log('Dashboard metrics from cache');
      return res.json(JSON.parse(cached));
    }

    // Aggregate metrics from database
    const [invoiceStats, vendorStats, paymentStats, recentInvoices] = await Promise.all([
      pool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft,
          COUNT(CASE WHEN status = 'submitted' THEN 1 END) as submitted,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
          COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
          COALESCE(SUM(amount), 0) as total_amount
        FROM invoices
      `),
      pool.query(`SELECT COUNT(*) as total, COUNT(CASE WHEN status = 'active' THEN 1 END) as active FROM vendors`),
      pool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COALESCE(SUM(amount), 0) as total_paid
        FROM payments
      `),
      pool.query(`
        SELECT i.id, i.invoice_number, i.amount, i.status, v.name as vendor_name, i.created_at
        FROM invoices i
        LEFT JOIN vendors v ON i.vendor_id = v.id
        ORDER BY i.created_at DESC
        LIMIT 5
      `)
    ]);

    const dashboard = {
      invoices: invoiceStats.rows[0],
      vendors: vendorStats.rows[0],
      payments: paymentStats.rows[0],
      recentInvoices: recentInvoices.rows,
      generatedAt: new Date().toISOString()
    };

    // Cache for 30 seconds
    await redisClient.setEx(cacheKey, 30, JSON.stringify(dashboard));
    console.log('Dashboard metrics fetched from database');

    res.json(dashboard);
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// VENDORS
// =============================================================================
app.get('/api/vendors', async (req, res) => {
  console.log('Fetching vendors...');
  try {
    const result = await pool.query('SELECT * FROM vendors ORDER BY name');
    res.json({ vendors: result.rows, count: result.rowCount });
  } catch (error) {
    console.error('Vendors error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/vendors/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM vendors WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/vendors', async (req, res) => {
  console.log('Creating vendor...');
  const { name, email, phone, address } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO vendors (name, email, phone, address) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, email, phone, address]
    );
    
    // Invalidate cache
    await redisClient.del('dashboard_metrics');
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create vendor error:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// INVOICES
// =============================================================================
app.get('/api/invoices', async (req, res) => {
  console.log('Fetching invoices...');
  try {
    const result = await pool.query(`
      SELECT i.*, v.name as vendor_name
      FROM invoices i
      LEFT JOIN vendors v ON i.vendor_id = v.id
      ORDER BY i.created_at DESC
    `);
    res.json({ invoices: result.rows, count: result.rowCount });
  } catch (error) {
    console.error('Invoices error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/invoices/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT i.*, v.name as vendor_name
      FROM invoices i
      LEFT JOIN vendors v ON i.vendor_id = v.id
      WHERE i.id = $1
    `, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    // Get associated documents
    const docs = await pool.query('SELECT * FROM documents WHERE invoice_id = $1', [req.params.id]);
    
    // Get associated payments
    const payments = await pool.query('SELECT * FROM payments WHERE invoice_id = $1', [req.params.id]);
    
    res.json({
      ...result.rows[0],
      documents: docs.rows,
      payments: payments.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/invoices', async (req, res) => {
  console.log('Creating invoice...');
  const { vendor_id, amount, description, due_date } = req.body;
  const invoiceNumber = `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
  
  try {
    const result = await pool.query(
      `INSERT INTO invoices (invoice_number, vendor_id, amount, description, due_date)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [invoiceNumber, vendor_id, amount, description, due_date]
    );
    
    // Invalidate cache
    await redisClient.del('dashboard_metrics');
    
    // Log audit
    await pool.query(
      `INSERT INTO audit_logs (entity_type, entity_id, action, details) VALUES ($1, $2, $3, $4)`,
      ['invoice', result.rows[0].id, 'created', JSON.stringify({ invoice_number: invoiceNumber })]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create invoice error:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// SUBMIT INVOICE - Calls Document and Payment services
// =============================================================================
app.post('/api/invoices/:id/submit', async (req, res) => {
  console.log(`Submitting invoice ${req.params.id}...`);
  const invoiceId = req.params.id;
  
  try {
    // Get invoice
    const invoiceResult = await pool.query('SELECT * FROM invoices WHERE id = $1', [invoiceId]);
    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    const invoice = invoiceResult.rows[0];
    
    // Step 1: Validate documents with Document Service
    // OTEL auto-instrumentation handles trace context propagation
    console.log('Calling Document Service for validation...');
    let documentValidation;
    try {
      const docResponse = await axios.post(
        `${DOCUMENT_SERVICE_URL}/api/documents/validate`,
        { invoice_id: invoiceId },
        { timeout: 10000 }
      );
      documentValidation = docResponse.data;
    } catch (docError) {
      console.error('Document service error:', docError.message);
      documentValidation = { valid: true, warning: 'Document service unavailable' };
    }
    
    // Step 2: Validate payment with Payment Service
    console.log('Calling Payment Service for validation...');
    let paymentValidation;
    try {
      const payResponse = await axios.post(
        `${PAYMENT_SERVICE_URL}/api/payments/validate`,
        { invoice_id: invoiceId, amount: invoice.amount },
        { timeout: 10000 }
      );
      paymentValidation = payResponse.data;
    } catch (payError) {
      console.error('Payment service error:', payError.message);
      paymentValidation = { valid: true, warning: 'Payment service unavailable' };
    }
    
    // Step 3: Update invoice status
    await pool.query(
      `UPDATE invoices SET status = 'submitted', submitted_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [invoiceId]
    );
    
    // Invalidate cache
    await redisClient.del('dashboard_metrics');
    
    // Log audit
    await pool.query(
      `INSERT INTO audit_logs (entity_type, entity_id, action, details) VALUES ($1, $2, $3, $4)`,
      ['invoice', invoiceId, 'submitted', JSON.stringify({ documentValidation, paymentValidation })]
    );
    
    res.json({
      success: true,
      message: 'Invoice submitted successfully',
      invoice_id: invoiceId,
      documentValidation,
      paymentValidation
    });
  } catch (error) {
    console.error('Submit invoice error:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// DOCUMENTS - Proxy to Document Service with actual file handling
// =============================================================================
app.post('/api/documents/upload', upload.single('file'), async (req, res) => {
  const startTime = Date.now();
  console.log('Processing document upload...');
  
  try {
    // Check if we have an actual file
    if (req.file) {
      // Forward actual file to document service
      // OTEL auto-instrumentation handles trace context propagation
      console.log(`Forwarding file: ${req.file.originalname}, Size: ${req.file.size} bytes`);
      
      const formData = new FormData();
      formData.append('file', req.file.buffer, {
        filename: req.file.originalname,
        contentType: req.file.mimetype
      });
      
      // Add form fields
      if (req.body.invoice_id) formData.append('invoice_id', req.body.invoice_id);
      if (req.body.document_type) formData.append('document_type', req.body.document_type);
      
      const response = await axios.post(
        `${DOCUMENT_SERVICE_URL}/api/documents/upload`,
        formData,
        { 
          headers: formData.getHeaders(),
          timeout: 60000,
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        }
      );
      
      const duration = Date.now() - startTime;
      console.log(`Document upload complete in ${duration}ms`);
      
      res.json(response.data);
    } else {
      // Fallback to JSON metadata upload
      console.log('No file attached, using metadata upload');
      const response = await axios.post(
        `${DOCUMENT_SERVICE_URL}/api/documents/upload`,
        req.body,
        { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
      );
      res.json(response.data);
    }
  } catch (error) {
    console.error('Document upload error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/documents', async (req, res) => {
  console.log('Fetching documents...');
  try {
    const result = await pool.query(`
      SELECT d.*, i.invoice_number
      FROM documents d
      LEFT JOIN invoices i ON d.invoice_id = i.id
      ORDER BY d.uploaded_at DESC
    `);
    res.json({ documents: result.rows, count: result.rowCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// PAYMENTS - Proxy to Payment Service
// =============================================================================
app.post('/api/payments/process', async (req, res) => {
  console.log('Processing payment via Payment Service...');
  const { invoice_id } = req.body;
  
  try {
    // Get invoice details
    const invoiceResult = await pool.query('SELECT * FROM invoices WHERE id = $1', [invoice_id]);
    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    const invoice = invoiceResult.rows[0];
    
    // Call Payment Service
    // OTEL auto-instrumentation handles trace context propagation
    const response = await axios.post(
      `${PAYMENT_SERVICE_URL}/api/payments/process`,
      { invoice_id, amount: invoice.amount, invoice_number: invoice.invoice_number },
      { timeout: 30000 }
    );
    
    // Update invoice status
    await pool.query(
      `UPDATE invoices SET status = 'approved', approved_at = NOW() WHERE id = $1`,
      [invoice_id]
    );
    
    // Invalidate cache
    await redisClient.del('dashboard_metrics');
    
    res.json(response.data);
  } catch (error) {
    console.error('Payment process error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/payments', async (req, res) => {
  console.log('Fetching payments...');
  try {
    const result = await pool.query(`
      SELECT p.*, i.invoice_number
      FROM payments p
      LEFT JOIN invoices i ON p.invoice_id = i.id
      ORDER BY p.created_at DESC
    `);
    res.json({ payments: result.rows, count: result.rowCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// SIMULATOR CLEANUP ENDPOINTS
// =============================================================================
// These endpoints are used by the simulator to clean up old test data.
// Records created by the simulator are prefixed with "SIM-" for identification.

/**
 * Delete old simulator-created records
 * POST /api/simulator/cleanup
 * Body: { maxAgeHours: 24 }
 */
app.post('/api/simulator/cleanup', async (req, res) => {
  const maxAgeHours = parseInt(req.body.maxAgeHours) || 24;
  console.log(`Cleaning up simulator records older than ${maxAgeHours} hours...`);
  
  try {
    const results = {
      invoices: 0,
      payments: 0,
      documents: 0
    };
    
    // Delete old simulator payments first (foreign key constraint)
    const paymentsResult = await pool.query(`
      DELETE FROM payments 
      WHERE payment_number LIKE 'SIM-%' 
      AND created_at < NOW() - INTERVAL '${maxAgeHours} hours'
      RETURNING id
    `);
    results.payments = paymentsResult.rowCount;
    
    // Delete old simulator documents
    const documentsResult = await pool.query(`
      DELETE FROM documents 
      WHERE filename LIKE 'SIM-%' 
      AND uploaded_at < NOW() - INTERVAL '${maxAgeHours} hours'
      RETURNING id
    `);
    results.documents = documentsResult.rowCount;
    
    // Delete old simulator invoices
    const invoicesResult = await pool.query(`
      DELETE FROM invoices 
      WHERE invoice_number LIKE 'SIM-%' 
      AND created_at < NOW() - INTERVAL '${maxAgeHours} hours'
      RETURNING id
    `);
    results.invoices = invoicesResult.rowCount;
    
    // Invalidate cache
    await redisClient.del('dashboard_metrics');
    
    const totalDeleted = results.invoices + results.payments + results.documents;
    console.log(`Cleanup complete: ${totalDeleted} records deleted`);
    
    res.json({
      success: true,
      message: `Cleaned up ${totalDeleted} simulator records`,
      deleted: results
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get count of simulator records
 * GET /api/simulator/stats
 */
app.get('/api/simulator/stats', async (req, res) => {
  try {
    const [invoices, payments, documents] = await Promise.all([
      pool.query(`SELECT COUNT(*) as count FROM invoices WHERE invoice_number LIKE 'SIM-%'`),
      pool.query(`SELECT COUNT(*) as count FROM payments WHERE payment_number LIKE 'SIM-%'`),
      pool.query(`SELECT COUNT(*) as count FROM documents WHERE filename LIKE 'SIM-%'`)
    ]);
    
    res.json({
      simulator_records: {
        invoices: parseInt(invoices.rows[0].count),
        payments: parseInt(payments.rows[0].count),
        documents: parseInt(documents.rows[0].count)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// ERROR ENDPOINT - For testing error tracking
// =============================================================================
app.get('/api/error', (req, res) => {
  console.log('Triggering intentional error...');
  throw new Error('Intentional error for APM testing');
});

// =============================================================================
// ERROR HANDLER
// =============================================================================
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message });
});

// =============================================================================
// START SERVER
// =============================================================================
const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    // Connect to Redis
    await connectRedis();
    
    // Test database connection
    await pool.query('SELECT 1');
    console.log('Connected to PostgreSQL');
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Procurement API running on port ${PORT}`);
      console.log(`Environment: ${process.env.DEPLOYMENT_ENVIRONMENT || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
