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
 *   CLEANUP_AGE_INVOICES_MINUTES - Delete invoices/payments older than X min (default: 60)
 *   CLEANUP_AGE_DOCUMENTS_MINUTES - Delete documents older than X min (default: 30)
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
  // Separate cleanup intervals for different entity types (in minutes)
  cleanupAgeInvoicesMinutes: parseInt(process.env.CLEANUP_AGE_INVOICES_MINUTES || '60', 10),  // 1 hour default
  cleanupAgeDocumentsMinutes: parseInt(process.env.CLEANUP_AGE_DOCUMENTS_MINUTES || '30', 10), // 30 min default
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

// =============================================================================
// SIM- VENDOR DEFINITIONS
// =============================================================================
// All simulator-created data is linked to these vendors for clean tracking/cleanup.
// The cleanup process deletes based on vendor relationship:
//   SIM- Vendor → Invoices → Payments (cascade)

const SIM_VENDORS = [
  { name: 'SIM-Acme Corporation', email: 'sim.acme@example.com', phone: '555-0101', address: '123 Simulator St, Test City, TS 00001' },
  { name: 'SIM-Tech Solutions', email: 'sim.tech@example.com', phone: '555-0102', address: '456 Demo Ave, Test City, TS 00002' },
  { name: 'SIM-Global Supplies', email: 'sim.global@example.com', phone: '555-0103', address: '789 Sample Blvd, Test City, TS 00003' },
  { name: 'SIM-Office Depot', email: 'sim.office@example.com', phone: '555-0104', address: '321 Fake Rd, Test City, TS 00004' },
  { name: 'SIM-Cloud Services Inc', email: 'sim.cloud@example.com', phone: '555-0105', address: '654 Virtual Way, Test City, TS 00005' }
];

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
 * File sizes range from 1KB to 3MB for realistic upload traces
 */
const createTestFile = () => {
  const testDir = path.join(__dirname, 'test-files');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
  
  // Random file size between 300KB and 4MB
  const minSize = 300 * 1024;      // 300 KB
  const maxSize = 4 * 1024 * 1024; // 4 MB
  const targetSize = Math.floor(Math.random() * (maxSize - minSize) + minSize);
  
  const filename = `SIM-test-document-${Date.now()}.txt`;
  const filepath = path.join(testDir, filename);
  
  // Create header with metadata
  const header = `
================================================================================
PROCUREMENT TEST DOCUMENT
================================================================================
Generated:    ${new Date().toISOString()}
Simulator:    procurement-simulator v2.0.0
File Size:    ${(targetSize / 1024).toFixed(2)} KB (${(targetSize / (1024 * 1024)).toFixed(2)} MB)
Document ID:  ${Math.random().toString(36).substring(2, 15)}
Cleanup Age:  ${config.cleanupAgeHours} hours

This is a test document generated by the APM traffic simulator.
It is used to test the document upload functionality and generate
distributed traces through the system.

================================================================================
SIMULATED PROCUREMENT DATA
================================================================================
`;

  // Generate random content to reach target size
  const headerSize = Buffer.byteLength(header, 'utf8');
  const remainingSize = targetSize - headerSize;
  
  // Create chunks of realistic-looking procurement data
  const dataChunks = [];
  let currentSize = 0;
  let lineNum = 1;
  
  const departments = ['Engineering', 'Marketing', 'Operations', 'Finance', 'HR', 'IT', 'Sales', 'Legal'];
  const items = ['Office Supplies', 'Software License', 'Hardware', 'Consulting', 'Training', 'Equipment', 'Services', 'Materials'];
  const statuses = ['Pending', 'Approved', 'In Review', 'Completed', 'Cancelled'];
  
  while (currentSize < remainingSize) {
    const dept = departments[Math.floor(Math.random() * departments.length)];
    const item = items[Math.floor(Math.random() * items.length)];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const amount = (Math.random() * 50000 + 100).toFixed(2);
    const poNumber = `PO-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    
    const line = `[Line ${String(lineNum).padStart(6, '0')}] ${poNumber} | Dept: ${dept.padEnd(12)} | Item: ${item.padEnd(20)} | Amount: $${amount.padStart(10)} | Status: ${status}\n`;
    
    const lineSize = Buffer.byteLength(line, 'utf8');
    if (currentSize + lineSize > remainingSize) break;
    
    dataChunks.push(line);
    currentSize += lineSize;
    lineNum++;
  }
  
  // Fill any remaining space with padding
  const paddingNeeded = remainingSize - currentSize;
  if (paddingNeeded > 0) {
    dataChunks.push('='.repeat(Math.max(0, paddingNeeded - 1)) + '\n');
  }
  
  const content = header + dataChunks.join('');
  fs.writeFileSync(filepath, content);
  
  const actualSize = fs.statSync(filepath).size;
  log.verbose(`Created test file: ${filename} (${(actualSize / 1024).toFixed(2)} KB)`);
  
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
 * Fetch all vendors from API
 */
async function fetchAllVendors(page) {
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
 * Create a vendor via API
 */
async function createVendor(page, vendorData) {
  try {
    const response = await page.evaluate(async ({ apiUrl, vendor }) => {
      const res = await fetch(`${apiUrl}/api/vendors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vendor)
      });
      return res.json();
    }, { apiUrl: config.apiUrl, vendor: vendorData });
    return response;
  } catch (e) {
    log.error(`Failed to create vendor: ${e.message}`);
    return null;
  }
}

/**
 * Ensure all SIM- vendors exist in the database.
 * Creates them via API if they don't exist (generates proper traces).
 * Returns the list of SIM- vendor objects with IDs.
 */
async function ensureSimVendorsExist(page) {
  log.info('Ensuring SIM- vendors exist...');
  
  // Fetch all existing vendors
  const existingVendors = await fetchAllVendors(page);
  const existingSimVendors = existingVendors.filter(v => v.name.startsWith('SIM-'));
  
  log.verbose(`Found ${existingSimVendors.length} existing SIM- vendors`);
  
  // Check which SIM vendors need to be created
  const existingNames = new Set(existingSimVendors.map(v => v.name));
  const vendorsToCreate = SIM_VENDORS.filter(v => !existingNames.has(v.name));
  
  if (vendorsToCreate.length > 0) {
    log.info(`Creating ${vendorsToCreate.length} missing SIM- vendors...`);
    
    for (const vendorData of vendorsToCreate) {
      log.data(`Creating vendor: ${vendorData.name}`);
      const created = await createVendor(page, vendorData);
      if (created && created.id) {
        existingSimVendors.push(created);
        log.data(`Created vendor: ${vendorData.name} (ID: ${created.id})`);
      }
      // Small delay between creations to spread out the traces
      await delay(randomDelay(500));
    }
  }
  
  log.info(`SIM- vendors ready: ${existingSimVendors.length} total`);
  return existingSimVendors;
}

/**
 * Fetch only SIM- vendors from API (for invoice creation)
 */
async function fetchSimVendors(page) {
  const allVendors = await fetchAllVendors(page);
  return allVendors.filter(v => v.name.startsWith('SIM-'));
}

/**
 * Create a simulator invoice via the UI
 * Only uses SIM- prefixed vendors to enable vendor-based cleanup tracking.
 */
async function createSimulatorInvoice(page, simVendors) {
  if (simVendors.length === 0) {
    log.verbose('No SIM- vendors available for invoice creation');
    return null;
  }
  
  log.data('Creating simulator invoice (using SIM- vendor)...');
  
  try {
    // Navigate to invoices page
    await page.goto(`${config.baseUrl}/invoices`, { waitUntil: 'networkidle' });
    await delay(randomDelay(1000));
    
    // Look for "+ Create Invoice" button (opens the form)
    const createButton = page.locator('button:has-text("Create Invoice")').first();
    
    if (await createButton.isVisible({ timeout: 3000 })) {
      await createButton.click();
      log.verbose('Clicked Create Invoice button to open form');
      await delay(randomDelay(1000));
      
      // Fill out the form - select a random SIM- vendor
      const vendor = randomElement(simVendors);
      const amount = randomAmount();
      const description = `SIM-${randomDescription()}`;
      
      // Select vendor from dropdown (uses data-transaction-name attribute)
      const vendorSelect = page.locator('select[data-transaction-name="Select Invoice Vendor"]');
      if (await vendorSelect.isVisible({ timeout: 2000 })) {
        await vendorSelect.selectOption({ value: String(vendor.id) });
        log.verbose(`Selected vendor: ${vendor.name} (ID: ${vendor.id})`);
      } else {
        // Fallback: try any select element in the form
        const anySelect = page.locator('form select').first();
        if (await anySelect.isVisible({ timeout: 1000 })) {
          await anySelect.selectOption({ value: String(vendor.id) });
          log.verbose(`Selected vendor via fallback: ${vendor.name}`);
        } else {
          log.error('Could not find vendor select dropdown');
          return null;
        }
      }
      
      // Fill amount (input with placeholder "Amount")
      const amountInput = page.locator('input[placeholder="Amount"]');
      if (await amountInput.isVisible({ timeout: 2000 })) {
        await amountInput.fill(String(amount));
        log.verbose(`Filled amount: ${amount}`);
      } else {
        // Fallback: try number input in the form
        const numInput = page.locator('form input[type="number"]').first();
        if (await numInput.isVisible({ timeout: 1000 })) {
          await numInput.fill(String(amount));
        }
      }
      
      // Fill description (input with placeholder "Description")
      const descInput = page.locator('input[placeholder="Description"]');
      if (await descInput.isVisible({ timeout: 2000 })) {
        await descInput.fill(description);
        log.verbose(`Filled description: ${description}`);
      }
      
      // Submit the form (button with data-transaction-name="Create Invoice" and type="submit")
      const submitButton = page.locator('button[type="submit"][data-transaction-name="Create Invoice"]');
      if (await submitButton.isVisible({ timeout: 2000 })) {
        await submitButton.click();
        log.verbose('Clicked submit button');
        await delay(randomDelay(2000));
        
        // Verify form closed (indicates success)
        const formStillVisible = await page.locator('form.upload-form').isVisible({ timeout: 1000 }).catch(() => false);
        if (!formStillVisible) {
          log.data(`Created invoice: Vendor=${vendor.name}, Amount=$${amount}, Desc=${description}`);
          return { vendor, amount, description };
        } else {
          log.verbose('Form still visible after submit - invoice may not have been created');
        }
      } else {
        log.error('Submit button not found');
      }
    } else {
      log.verbose('Create invoice button not found');
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
 * Uses separate intervals for invoices/payments vs documents
 */
async function cleanupSimulatorRecords(page) {
  log.data(`Cleaning up: invoices/payments > ${config.cleanupAgeInvoicesMinutes}min, documents > ${config.cleanupAgeDocumentsMinutes}min`);
  
  try {
    const response = await page.evaluate(async ({ apiUrl, invoicesAgeMinutes, documentsAgeMinutes }) => {
      const res = await fetch(`${apiUrl}/api/simulator/cleanup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoicesAgeMinutes, documentsAgeMinutes })
      });
      return res.json();
    }, { 
      apiUrl: config.apiUrl, 
      invoicesAgeMinutes: config.cleanupAgeInvoicesMinutes,
      documentsAgeMinutes: config.cleanupAgeDocumentsMinutes
    });
    
    if (response.success) {
      const d = response.deleted;
      log.data(`Cleanup complete: ${d.invoices} invoices, ${d.payments} payments, ${d.documents} documents (via SIM- vendor cascade)`);
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
  log.info(`  Auto-Cleanup: Every ${config.cleanupFrequency} cycles (invoices/payments > ${config.cleanupAgeInvoicesMinutes}min, documents > ${config.cleanupAgeDocumentsMinutes}min)`);
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
  let simVendors = [];
  
  try {
    // Initial page load
    log.info('Performing initial page load...');
    await page.goto(config.baseUrl, { waitUntil: 'networkidle' });
    await delay(config.actionDelay);
    
    // Ensure SIM- vendors exist (creates traces via API if needed)
    simVendors = await ensureSimVendorsExist(page);
    log.info(`Using ${simVendors.length} SIM- vendors for invoice creation`);
    
    // Initial cleanup
    log.info('Performing initial cleanup...');
    await cleanupSimulatorRecords(page);
    
    // Get initial stats
    const stats = await getSimulatorStats(page);
    if (stats && stats.simulator_records) {
      const s = stats.simulator_records;
      log.info(`Current simulator records: ${s.vendors} vendors, ${s.invoices} invoices, ${s.payments} payments, ${s.documents} documents`);
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
      
      // Create invoice based on frequency (uses SIM- vendors only)
      if (config.enableInvoices && cycleCount % config.invoiceFrequency === 0) {
        log.info(`Invoice creation cycle (every ${config.invoiceFrequency} cycles)`);
        try {
          await createSimulatorInvoice(page, simVendors);
          // Try to submit and approve (this triggers payment creation when approved)
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
