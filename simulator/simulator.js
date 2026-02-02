/**
 * =============================================================================
 * PROCUREMENT DEMO APM TRAFFIC SIMULATOR
 * =============================================================================
 * 
 * This Playwright-based simulator generates real user traffic to the Procurement
 * Demo application, which in turn generates:
 *   - Elastic RUM traces (frontend user interactions)
 *   - Distributed traces through the backend services (Node.js, Python, Java)
 *   - Database queries (PostgreSQL)
 *   - Cache operations (Redis)
 * 
 * DATA MANAGEMENT:
 *   - All simulator-created records are prefixed with "SIM-" for identification
 *   - Automatic cleanup of old simulator records (configurable age)
 *   - Creates realistic invoice → submit → approve → payment workflows
 * 
 * CONFIGURATION (via environment variables):
 *   BASE_URL           - Target application URL (default: https://demo.myhousetech.net)
 *   API_URL            - API URL for direct calls (default: same as BASE_URL)
 *   ACTION_DELAY       - Delay between actions in ms (default: 2000)
 *   CYCLE_DELAY        - Delay between full cycles in ms (default: 5000)
 *   ENABLE_UPLOADS     - Enable document uploads (default: true)
 *   UPLOAD_FREQUENCY   - Upload every N cycles (default: 5)
 *   ENABLE_INVOICES    - Enable invoice creation (default: true)
 *   INVOICE_FREQUENCY  - Create invoice every N cycles (default: 3)
 *   CLEANUP_FREQUENCY  - Cleanup old records every N cycles (default: 10)
 *   CLEANUP_AGE_HOURS  - Delete simulator records older than X hours (default: 24)
 *   HEADLESS           - Run browser headless (default: true)
 *   MAX_CYCLES         - Maximum cycles to run, 0 = infinite (default: 0)
 *   VERBOSE            - Enable verbose logging (default: false)
 * 
 * USAGE:
 *   npm start                              # Run with defaults
 *   ENABLE_UPLOADS=false npm start         # Disable uploads
 *   ENABLE_INVOICES=false npm start        # Disable invoice creation
 *   INVOICE_FREQUENCY=5 npm start          # Create invoice every 5 cycles
 *   CLEANUP_AGE_HOURS=12 npm start         # Delete records older than 12 hours
 *   HEADLESS=false npm start               # Show browser window
 * 
 * =============================================================================
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// =============================================================================
// CONFIGURATION
// =============================================================================

const config = {
  baseUrl: process.env.BASE_URL || 'https://demo.myhousetech.net',
  apiUrl: process.env.API_URL || process.env.BASE_URL || 'https://demo.myhousetech.net',
  actionDelay: parseInt(process.env.ACTION_DELAY || '2000', 10),
  cycleDelay: parseInt(process.env.CYCLE_DELAY || '5000', 10),
  enableUploads: process.env.ENABLE_UPLOADS !== 'false',
  uploadFrequency: parseInt(process.env.UPLOAD_FREQUENCY || '5', 10),
  enableInvoices: process.env.ENABLE_INVOICES !== 'false',
  invoiceFrequency: parseInt(process.env.INVOICE_FREQUENCY || '3', 10),
  cleanupFrequency: parseInt(process.env.CLEANUP_FREQUENCY || '10', 10),
  cleanupAgeHours: parseInt(process.env.CLEANUP_AGE_HOURS || '24', 10),
  headless: process.env.HEADLESS !== 'false',
  maxCycles: parseInt(process.env.MAX_CYCLES || '0', 10),
  verbose: process.env.VERBOSE === 'true'
};

// =============================================================================
// LOGGING
// =============================================================================

const log = {
  info: (msg) => console.log(`[${new Date().toISOString()}] INFO: ${msg}`),
  action: (msg) => console.log(`[${new Date().toISOString()}] ACTION: ${msg}`),
  data: (msg) => console.log(`[${new Date().toISOString()}] DATA: ${msg}`),
  verbose: (msg) => config.verbose && console.log(`[${new Date().toISOString()}] DEBUG: ${msg}`),
  error: (msg) => console.error(`[${new Date().toISOString()}] ERROR: ${msg}`),
  cycle: (num) => console.log(`\n${'='.repeat(60)}\n[${new Date().toISOString()}] CYCLE ${num}\n${'='.repeat(60)}`)
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const randomDelay = (baseMs, variance = 0.3) => {
  const min = baseMs * (1 - variance);
  const max = baseMs * (1 + variance);
  return Math.floor(Math.random() * (max - min) + min);
};

const randomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];

const randomAmount = () => Math.floor(Math.random() * 50000) + 1000; // $1,000 - $51,000

const randomDescription = () => {
  const descriptions = [
    'Office Supplies Order',
    'IT Equipment Purchase',
    'Software Licenses',
    'Consulting Services',
    'Maintenance Contract',
    'Training Materials',
    'Hardware Upgrade',
    'Cloud Services',
    'Security Audit',
    'Infrastructure Update'
  ];
  return descriptions[Math.floor(Math.random() * descriptions.length)];
};

/**
 * Create a temporary test file for upload simulation
 */
const createTestFile = () => {
  const testDir = path.join(__dirname, 'test-files');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
  
  const filename = `SIM-test-document-${Date.now()}.txt`;
  const filepath = path.join(testDir, filename);
  const content = `
Procurement Test Document
Generated: ${new Date().toISOString()}
Simulator: procurement-simulator v2.0.0

This is a test document generated by the APM traffic simulator.
It is used to test the document upload functionality and generate
distributed traces through the system.

This document will be automatically cleaned up after ${config.cleanupAgeHours} hours.

Random data: ${Math.random().toString(36).substring(2, 15)}
`;
  
  fs.writeFileSync(filepath, content);
  return filepath;
};

/**
 * Clean up test files older than configured hours
 */
const cleanupTestFiles = () => {
  const testDir = path.join(__dirname, 'test-files');
  if (!fs.existsSync(testDir)) return;
  
  const files = fs.readdirSync(testDir);
  const cutoffTime = Date.now() - (config.cleanupAgeHours * 60 * 60 * 1000);
  
  files.forEach(file => {
    const filepath = path.join(testDir, file);
    const stats = fs.statSync(filepath);
    if (stats.mtimeMs < cutoffTime) {
      fs.unlinkSync(filepath);
      log.verbose(`Cleaned up old test file: ${file}`);
    }
  });
};

// =============================================================================
// API FUNCTIONS (Direct API calls for data creation)
// =============================================================================

/**
 * Fetch vendors from API
 */
async function fetchVendors(page) {
  try {
    const response = await page.evaluate(async (apiUrl) => {
      const res = await fetch(`${apiUrl}/api/vendors`);
      return res.json();
    }, config.apiUrl);
    return response.vendors || [];
  } catch (e) {
    log.error(`Failed to fetch vendors: ${e.message}`);
    return [];
  }
}

/**
 * Create a simulator invoice via the UI
 */
async function createSimulatorInvoice(page, vendors) {
  if (vendors.length === 0) {
    log.verbose('No vendors available for invoice creation');
    return null;
  }
  
  log.data('Creating simulator invoice...');
  
  try {
    // Navigate to invoices page
    await page.goto(`${config.baseUrl}/invoices`, { waitUntil: 'networkidle' });
    await delay(randomDelay(1000));
    
    // Look for "New Invoice" or "Create Invoice" button
    const createButton = page.locator('button:has-text("New Invoice"), button:has-text("Create"), button:has-text("Add Invoice")').first();
    
    if (await createButton.isVisible({ timeout: 3000 })) {
      await createButton.click();
      await delay(randomDelay(1000));
      
      // Fill out the form
      const vendor = randomElement(vendors);
      const amount = randomAmount();
      const description = `SIM-${randomDescription()}`;
      
      // Try to fill vendor dropdown/select
      const vendorSelect = page.locator('select[name="vendor"], select[name="vendor_id"], #vendor, #vendor_id').first();
      if (await vendorSelect.isVisible({ timeout: 2000 })) {
        await vendorSelect.selectOption({ value: String(vendor.id) });
      }
      
      // Fill amount
      const amountInput = page.locator('input[name="amount"], #amount').first();
      if (await amountInput.isVisible({ timeout: 2000 })) {
        await amountInput.fill(String(amount));
      }
      
      // Fill description
      const descInput = page.locator('input[name="description"], textarea[name="description"], #description').first();
      if (await descInput.isVisible({ timeout: 2000 })) {
        await descInput.fill(description);
      }
      
      // Submit the form
      const submitButton = page.locator('button[type="submit"], button:has-text("Create"), button:has-text("Save")').first();
      if (await submitButton.isVisible({ timeout: 2000 })) {
        await submitButton.click();
        await delay(randomDelay(2000));
        log.data(`Created invoice: Vendor=${vendor.name}, Amount=$${amount}, Desc=${description}`);
        return { vendor, amount, description };
      }
    } else {
      log.verbose('Create invoice button not found - UI may not support invoice creation');
    }
    
    return null;
  } catch (e) {
    log.error(`Failed to create invoice: ${e.message}`);
    return null;
  }
}

/**
 * Submit an invoice for approval via UI
 */
async function submitInvoiceForApproval(page) {
  log.data('Looking for invoice to submit...');
  
  try {
    await page.goto(`${config.baseUrl}/invoices`, { waitUntil: 'networkidle' });
    await delay(randomDelay(1000));
    
    // Look for Submit button on draft invoices
    const submitButton = page.locator('button:has-text("Submit")').first();
    
    if (await submitButton.isVisible({ timeout: 3000 })) {
      await submitButton.click();
      await delay(randomDelay(2000));
      log.data('Submitted invoice for approval');
      return true;
    }
    
    log.verbose('No draft invoices to submit');
    return false;
  } catch (e) {
    log.verbose(`Submit invoice failed: ${e.message}`);
    return false;
  }
}

/**
 * Approve an invoice via UI
 */
async function approveInvoice(page) {
  log.data('Looking for invoice to approve...');
  
  try {
    await page.goto(`${config.baseUrl}/invoices`, { waitUntil: 'networkidle' });
    await delay(randomDelay(1000));
    
    // Look for Approve button
    const approveButton = page.locator('button:has-text("Approve")').first();
    
    if (await approveButton.isVisible({ timeout: 3000 })) {
      await approveButton.click();
      await delay(randomDelay(2000));
      log.data('Approved invoice');
      return true;
    }
    
    log.verbose('No invoices to approve');
    return false;
  } catch (e) {
    log.verbose(`Approve invoice failed: ${e.message}`);
    return false;
  }
}

/**
 * Cleanup old simulator records via API
 */
async function cleanupSimulatorRecords(page) {
  log.data(`Cleaning up simulator records older than ${config.cleanupAgeHours} hours...`);
  
  try {
    const response = await page.evaluate(async ({ apiUrl, maxAgeHours }) => {
      const res = await fetch(`${apiUrl}/api/simulator/cleanup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxAgeHours })
      });
      return res.json();
    }, { apiUrl: config.apiUrl, maxAgeHours: config.cleanupAgeHours });
    
    if (response.success) {
      log.data(`Cleanup complete: ${response.deleted.invoices} invoices, ${response.deleted.payments} payments, ${response.deleted.documents} documents`);
    } else {
      log.verbose(`Cleanup response: ${JSON.stringify(response)}`);
    }
    
    // Also cleanup local test files
    cleanupTestFiles();
    
    return response;
  } catch (e) {
    log.error(`Cleanup failed: ${e.message}`);
    return null;
  }
}

/**
 * Get simulator stats
 */
async function getSimulatorStats(page) {
  try {
    const response = await page.evaluate(async (apiUrl) => {
      const res = await fetch(`${apiUrl}/api/simulator/stats`);
      return res.json();
    }, config.apiUrl);
    return response;
  } catch (e) {
    log.verbose(`Failed to get stats: ${e.message}`);
    return null;
  }
}

// =============================================================================
// BROWSER SIMULATION ACTIONS
// =============================================================================

/**
 * Navigate to a page and wait for it to load
 */
async function navigateTo(page, urlPath, name) {
  log.action(`Navigating to ${name} (${urlPath})`);
  await page.goto(`${config.baseUrl}${urlPath}`, { waitUntil: 'networkidle' });
  await delay(randomDelay(config.actionDelay));
}

/**
 * Simulate viewing the dashboard
 */
async function viewDashboard(page) {
  await navigateTo(page, '/', 'Dashboard');
  
  // Click refresh button if visible
  try {
    const refreshButton = page.locator('[data-transaction-name="Refresh Dashboard"]');
    if (await refreshButton.isVisible({ timeout: 2000 })) {
      log.action('Clicking Refresh Dashboard');
      await refreshButton.click();
      await delay(randomDelay(config.actionDelay));
    }
  } catch (e) {
    log.verbose('Refresh button not found or not clickable');
  }
}

/**
 * Simulate viewing invoices
 */
async function viewInvoices(page) {
  await navigateTo(page, '/invoices', 'Invoices');
  
  // Try to click on an invoice row if available
  try {
    const invoiceRows = page.locator('table tbody tr');
    const count = await invoiceRows.count();
    if (count > 0) {
      const randomIndex = Math.floor(Math.random() * Math.min(count, 5));
      log.action(`Clicking invoice row ${randomIndex + 1}`);
      await invoiceRows.nth(randomIndex).click();
      await delay(randomDelay(config.actionDelay));
    }
  } catch (e) {
    log.verbose('No invoice rows to interact with');
  }
}

/**
 * Simulate viewing documents
 */
async function viewDocuments(page) {
  await navigateTo(page, '/documents', 'Documents');
  
  try {
    const docRows = page.locator('table tbody tr');
    const count = await docRows.count();
    log.verbose(`Found ${count} documents in list`);
  } catch (e) {
    log.verbose('No document table found');
  }
}

/**
 * Simulate uploading a document
 */
async function uploadDocument(page) {
  await navigateTo(page, '/documents', 'Documents');
  
  log.action('Starting document upload simulation');
  
  try {
    // Create a test file
    const testFilePath = createTestFile();
    log.verbose(`Created test file: ${testFilePath}`);
    
    // Find the file input
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.count() > 0) {
      // Upload the file
      await fileInput.setInputFiles(testFilePath);
      log.action('File selected for upload');
      await delay(randomDelay(1000));
      
      // Click upload button
      const uploadButton = page.locator('[data-transaction-name="Upload Document"]');
      if (await uploadButton.isVisible({ timeout: 2000 })) {
        await uploadButton.click();
        log.action('Clicked Upload Document button');
        await delay(randomDelay(config.actionDelay * 2));
      }
    } else {
      log.verbose('File input not found');
    }
  } catch (e) {
    log.error(`Upload simulation failed: ${e.message}`);
  }
}

/**
 * Simulate viewing payments
 */
async function viewPayments(page) {
  await navigateTo(page, '/payments', 'Payments');
  
  try {
    const paymentRows = page.locator('table tbody tr');
    const count = await paymentRows.count();
    log.verbose(`Found ${count} payments in list`);
  } catch (e) {
    log.verbose('No payment table found');
  }
}

/**
 * Simulate processing a payment
 */
async function processPayment(page) {
  await navigateTo(page, '/payments', 'Payments');
  
  log.action('Attempting to process a payment');
  
  try {
    const processButton = page.locator('[data-transaction-name="Process Payment"]');
    if (await processButton.isVisible({ timeout: 2000 })) {
      await processButton.click();
      log.action('Clicked Process Payment button');
      await delay(randomDelay(config.actionDelay * 1.5));
    } else {
      const anyProcessButton = page.locator('button:has-text("Process")').first();
      if (await anyProcessButton.isVisible({ timeout: 2000 })) {
        await anyProcessButton.click();
        log.action('Clicked Process button');
        await delay(randomDelay(config.actionDelay * 1.5));
      }
    }
  } catch (e) {
    log.verbose(`Payment processing not available: ${e.message}`);
  }
}

/**
 * Simulate viewing vendors
 */
async function viewVendors(page) {
  await navigateTo(page, '/vendors', 'Vendors');
  
  try {
    const vendorRows = page.locator('table tbody tr');
    const count = await vendorRows.count();
    if (count > 0) {
      const randomIndex = Math.floor(Math.random() * Math.min(count, 5));
      log.action(`Clicking vendor row ${randomIndex + 1}`);
      await vendorRows.nth(randomIndex).click();
      await delay(randomDelay(config.actionDelay));
    }
  } catch (e) {
    log.verbose('No vendor rows to interact with');
  }
}

/**
 * View the architecture modal
 */
async function viewArchitectureModal(page) {
  await navigateTo(page, '/', 'Dashboard');
  
  log.action('Opening architecture diagram modal');
  
  try {
    const versionText = page.locator('text=Procurement System v1.0.0');
    if (await versionText.isVisible({ timeout: 2000 })) {
      await versionText.click();
      await delay(randomDelay(config.actionDelay));
      
      const closeButton = page.locator('.modal-close, [aria-label="Close"], button:has-text("×")').first();
      if (await closeButton.isVisible({ timeout: 2000 })) {
        await closeButton.click();
        log.action('Closed architecture modal');
        await delay(randomDelay(1000));
      }
    }
  } catch (e) {
    log.verbose('Architecture modal not available');
  }
}

// =============================================================================
// MAIN SIMULATION LOOP
// =============================================================================

async function runSimulation() {
  log.info('Starting Procurement Demo APM Traffic Simulator v2.0');
  log.info(`Configuration:`);
  log.info(`  Base URL: ${config.baseUrl}`);
  log.info(`  API URL: ${config.apiUrl}`);
  log.info(`  Action Delay: ${config.actionDelay}ms`);
  log.info(`  Cycle Delay: ${config.cycleDelay}ms`);
  log.info(`  Uploads Enabled: ${config.enableUploads} (every ${config.uploadFrequency} cycles)`);
  log.info(`  Invoice Creation: ${config.enableInvoices} (every ${config.invoiceFrequency} cycles)`);
  log.info(`  Auto-Cleanup: Every ${config.cleanupFrequency} cycles (records > ${config.cleanupAgeHours}h old)`);
  log.info(`  Headless: ${config.headless}`);
  log.info(`  Max Cycles: ${config.maxCycles === 0 ? 'Infinite' : config.maxCycles}`);
  
  const browser = await chromium.launch({
    headless: config.headless
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 ProcurementSimulator/2.0'
  });
  
  const page = await context.newPage();
  
  page.on('console', msg => {
    if (config.verbose && msg.type() === 'error') {
      log.verbose(`Browser console error: ${msg.text()}`);
    }
  });
  
  let cycleCount = 0;
  let vendors = [];
  
  try {
    // Initial page load
    log.info('Performing initial page load...');
    await page.goto(config.baseUrl, { waitUntil: 'networkidle' });
    await delay(config.actionDelay);
    
    // Fetch vendors for invoice creation
    vendors = await fetchVendors(page);
    log.info(`Loaded ${vendors.length} vendors for invoice creation`);
    
    // Initial cleanup
    log.info('Performing initial cleanup...');
    await cleanupSimulatorRecords(page);
    
    // Get initial stats
    const stats = await getSimulatorStats(page);
    if (stats) {
      log.info(`Current simulator records: ${JSON.stringify(stats.simulator_records)}`);
    }
    
    // Main simulation loop
    while (config.maxCycles === 0 || cycleCount < config.maxCycles) {
      cycleCount++;
      log.cycle(cycleCount);
      
      // Standard navigation cycle
      const actions = [
        () => viewDashboard(page),
        () => viewInvoices(page),
        () => viewDocuments(page),
        () => viewPayments(page),
        () => viewVendors(page),
        () => processPayment(page),
        () => viewArchitectureModal(page)
      ];
      
      // Shuffle actions for variety
      const shuffledActions = actions.sort(() => Math.random() - 0.5);
      
      // Execute actions
      for (const action of shuffledActions) {
        try {
          await action();
        } catch (e) {
          log.error(`Action failed: ${e.message}`);
        }
      }
      
      // Create invoice based on frequency
      if (config.enableInvoices && cycleCount % config.invoiceFrequency === 0) {
        log.info(`Invoice creation cycle (every ${config.invoiceFrequency} cycles)`);
        try {
          await createSimulatorInvoice(page, vendors);
          // Try to submit and approve
          await submitInvoiceForApproval(page);
          await approveInvoice(page);
        } catch (e) {
          log.error(`Invoice workflow failed: ${e.message}`);
        }
      }
      
      // Upload document based on frequency
      if (config.enableUploads && cycleCount % config.uploadFrequency === 0) {
        log.info(`Upload cycle (every ${config.uploadFrequency} cycles)`);
        try {
          await uploadDocument(page);
        } catch (e) {
          log.error(`Upload failed: ${e.message}`);
        }
      }
      
      // Cleanup based on frequency
      if (cycleCount % config.cleanupFrequency === 0) {
        log.info(`Cleanup cycle (every ${config.cleanupFrequency} cycles)`);
        try {
          await cleanupSimulatorRecords(page);
        } catch (e) {
          log.error(`Cleanup failed: ${e.message}`);
        }
      }
      
      // Wait between cycles
      log.info(`Cycle ${cycleCount} complete. Waiting ${config.cycleDelay}ms before next cycle...`);
      await delay(config.cycleDelay);
    }
    
    log.info(`Completed ${cycleCount} cycles. Shutting down...`);
    
    // Final cleanup
    log.info('Performing final cleanup...');
    await cleanupSimulatorRecords(page);
    
  } catch (e) {
    log.error(`Simulation error: ${e.message}`);
    throw e;
  } finally {
    await browser.close();
    log.info('Browser closed. Simulation ended.');
  }
}

// =============================================================================
// ENTRY POINT
// =============================================================================

process.on('SIGINT', () => {
  log.info('Received SIGINT. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log.info('Received SIGTERM. Shutting down gracefully...');
  process.exit(0);
});

runSimulation().catch(e => {
  log.error(`Fatal error: ${e.message}`);
  process.exit(1);
});
