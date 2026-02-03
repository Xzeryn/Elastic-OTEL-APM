# Procurement Demo APM Traffic Simulator

A Playwright-based simulator that generates real user traffic to the Procurement Demo app, creating authentic APM data including:

- **Elastic RUM traces** - Frontend user interactions, page loads, route changes
- **Distributed backend traces** - Node.js → Python → Java service calls
- **Database queries** - PostgreSQL operations
- **Cache operations** - Redis interactions

## Features

- **Realistic user behavior** - Navigation, clicks, form submissions
- **Data creation** - Creates invoices, uploads documents, processes payments
- **Auto-cleanup** - Automatically deletes old simulator records (SIM-* prefix)
- **Configurable frequency** - Control how often data is created/cleaned
- **Docker & Kubernetes support** - Containerized deployment included

## Data Management

Simulator records are tracked via **SIM- prefixed vendors** for accurate cleanup:
- **Vendors**: Created with `SIM-` prefix (e.g., `SIM-Acme Corporation`)
- **Invoices**: Created using SIM- vendors, enabling vendor-based cleanup tracking
- **Payments**: Linked to SIM- vendor invoices via foreign keys
- **Documents**: Filenames prefixed with `SIM-` (e.g., `SIM-test-document-xxxxx.txt`)

Invoice/Payment numbers use chronological format: `INV-YYYYMMDDHHmmssSSS-XXX`

Records are automatically cleaned up with separate intervals:
- Invoices/Payments: Default 60 minutes (`CLEANUP_AGE_INVOICES_MINUTES`)
- Documents: Default 30 minutes (`CLEANUP_AGE_DOCUMENTS_MINUTES`)

## Quick Start

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Run with defaults
npm start

# Browse only (no data creation)
npm run start:browse-only

# Watch the browser
npm run start:visible
```

## Configuration

All configuration is via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `https://demo.myhousetech.net` | Target application URL |
| `API_URL` | Same as BASE_URL | API URL for direct calls |
| `ACTION_DELAY` | `2000` | Delay between actions (ms) |
| `CYCLE_DELAY` | `5000` | Delay between full cycles (ms) |
| `ENABLE_UPLOADS` | `true` | Enable document upload simulation |
| `UPLOAD_FREQUENCY` | `5` | Upload every N cycles |
| `ENABLE_INVOICES` | `true` | Enable invoice creation |
| `INVOICE_FREQUENCY` | `3` | Create invoice every N cycles |
| `CLEANUP_FREQUENCY` | `10` | Cleanup old records every N cycles |
| `CLEANUP_AGE_INVOICES_MINUTES` | `60` | Delete invoices/payments older than X minutes |
| `CLEANUP_AGE_DOCUMENTS_MINUTES` | `30` | Delete documents older than X minutes |
| `HEADLESS` | `true` | Run browser in headless mode |
| `MAX_CYCLES` | `0` | Max cycles to run (0 = infinite) |
| `VERBOSE` | `false` | Enable verbose logging |

## Examples

```bash
# Disable all data creation (browse only)
ENABLE_UPLOADS=false ENABLE_INVOICES=false npm start

# Create invoices more frequently
INVOICE_FREQUENCY=1 npm start

# Less frequent uploads
UPLOAD_FREQUENCY=10 npm start

# Faster cleanup (delete invoices older than 30 min, documents older than 15 min)
CLEANUP_AGE_INVOICES_MINUTES=30 CLEANUP_AGE_DOCUMENTS_MINUTES=15 npm start

# More frequent cleanup
CLEANUP_FREQUENCY=5 npm start

# Watch the browser (useful for debugging)
HEADLESS=false npm start

# Run just 5 cycles then stop
MAX_CYCLES=5 npm start

# Combine options
ENABLE_INVOICES=true INVOICE_FREQUENCY=2 CLEANUP_AGE_INVOICES_MINUTES=90 npm start
```

## NPM Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Run with default settings |
| `npm run start:no-uploads` | Disable document uploads |
| `npm run start:no-invoices` | Disable invoice creation |
| `npm run start:browse-only` | Navigation only, no data creation |
| `npm run start:fast` | Faster simulation (1s action, 2s cycle) |
| `npm run start:slow` | Slower simulation (5s action, 10s cycle) |
| `npm run start:visible` | Show browser window |

## Docker

### Build

```bash
docker build -t <username>/procurement-simulator:v10 .
```

### Run

```bash
# Default configuration
docker run --rm <username>/procurement-simulator:v10

# Browse only
docker run --rm \
  -e ENABLE_UPLOADS=false \
  -e ENABLE_INVOICES=false \
  <username>/procurement-simulator:v10

# Custom cleanup settings
docker run --rm \
  -e CLEANUP_AGE_INVOICES_MINUTES=90 \
  -e CLEANUP_AGE_DOCUMENTS_MINUTES=45 \
  -e CLEANUP_FREQUENCY=5 \
  <username>/procurement-simulator:v10
```

## Kubernetes Deployment

### Setup

1. Copy the template to create your deployment file:
   ```bash
   cp simulator-deployment-template.yaml simulator-deployment.yaml
   ```

2. Edit `simulator-deployment.yaml` and replace:
   - `<dockerhub-username>` with your Docker Hub username
   - `<your-domain>` with your application domain

### Deploy

```bash
kubectl apply -f simulator-deployment.yaml -n demo-apps
```

### Monitor

```bash
kubectl logs -f deployment/procurement-simulator -n demo-apps
```

### Control

```bash
# Stop simulator
kubectl scale deployment/procurement-simulator --replicas=0 -n demo-apps

# Start simulator
kubectl scale deployment/procurement-simulator --replicas=1 -n demo-apps
```

## API Endpoints Used

The simulator uses these API endpoints:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/vendors` | Fetch vendors for invoice creation |
| `POST /api/simulator/cleanup` | Delete old SIM-* records |
| `GET /api/simulator/stats` | Get count of simulator records |

## Simulated Workflow

Each cycle performs:

1. **Navigation** - Dashboard, Invoices, Documents, Payments, Vendors (randomized order)
2. **Interactions** - Click rows, refresh dashboard, view architecture modal
3. **Invoice Creation** (every N cycles) - Create invoice → Submit → Approve
4. **Document Upload** (every N cycles) - Upload test document
5. **Payment Processing** - Process available approved invoices
6. **Cleanup** (every N cycles) - Delete old SIM-* records

## Troubleshooting

### Browser not launching

```bash
npx playwright install chromium
```

### Cleanup not working

Check that the API supports the cleanup endpoints:
```bash
curl -X POST https://demo.myhousetech.net/api/simulator/cleanup \
  -H "Content-Type: application/json" \
  -d '{"invoicesAgeMinutes": 60, "documentsAgeMinutes": 30}'
```

### Invoice creation failing

The simulator attempts to create invoices through the UI. If the UI doesn't have a "New Invoice" button visible, invoice creation will be skipped. Run with `HEADLESS=false` to debug.
