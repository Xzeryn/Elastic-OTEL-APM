# Procurement Demo APM Traffic Simulator

A Playwright-based simulator that generates real user traffic to the Procurement Demo application, creating authentic APM data including:

- **Elastic RUM traces** - Frontend user interactions, page loads, route changes
- **Distributed backend traces** - Node.js → Python → Java service calls
- **Database queries** - PostgreSQL operations
- **Cache operations** - Redis interactions

## Features

- Simulates realistic user behavior (navigation, clicks, uploads, payments)
- Configurable upload frequency (or disable entirely)
- Adjustable timing between actions
- Runs headless or with visible browser
- Docker support for containerized deployment
- Kubernetes deployment manifests included

## Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Run with defaults
npm start

# Run without uploads
npm run start:no-uploads

# Run faster (1 second between actions)
npm run start:fast
```

### Configuration

All configuration is via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `https://demo.myhousetech.net` | Target application URL |
| `ACTION_DELAY` | `2000` | Delay between actions (ms) |
| `CYCLE_DELAY` | `5000` | Delay between full cycles (ms) |
| `ENABLE_UPLOADS` | `true` | Enable document upload simulation |
| `UPLOAD_FREQUENCY` | `5` | Upload every N cycles |
| `HEADLESS` | `true` | Run browser in headless mode |
| `MAX_CYCLES` | `0` | Max cycles to run (0 = infinite) |
| `VERBOSE` | `false` | Enable verbose logging |

### Examples

```bash
# Disable uploads entirely
ENABLE_UPLOADS=false npm start

# Upload less frequently (every 10 cycles)
UPLOAD_FREQUENCY=10 npm start

# Watch the browser (useful for debugging)
HEADLESS=false npm start

# Run just 5 cycles then stop
MAX_CYCLES=5 npm start

# Slower simulation (5 seconds between actions)
ACTION_DELAY=5000 npm start

# Custom URL
BASE_URL=http://localhost:3000 npm start

# Combine options
ENABLE_UPLOADS=true UPLOAD_FREQUENCY=10 ACTION_DELAY=3000 HEADLESS=false npm start
```

## Docker

### Build

```bash
docker build -t <username>/procurement-simulator:v1 .
```

### Run

```bash
# Default configuration
docker run --rm <username>/procurement-simulator:v1

# Disable uploads
docker run --rm -e ENABLE_UPLOADS=false <username>/procurement-simulator:v1

# Custom configuration
docker run --rm \
  -e BASE_URL=https://your-domain.com \
  -e UPLOAD_FREQUENCY=10 \
  -e ACTION_DELAY=3000 \
  <username>/procurement-simulator:v1
```

## Kubernetes Deployment

### Deploy

```bash
# Update the image name in simulator-deployment.yaml first
kubectl apply -f simulator-deployment.yaml -n demo-apps
```

### Monitor

```bash
# View logs
kubectl logs -f deployment/procurement-simulator -n demo-apps

# Check status
kubectl get pods -n demo-apps -l app=procurement-simulator
```

### Control

```bash
# Stop simulator (scale to 0)
kubectl scale deployment/procurement-simulator --replicas=0 -n demo-apps

# Start simulator
kubectl scale deployment/procurement-simulator --replicas=1 -n demo-apps

# Remove entirely
kubectl delete -f simulator-deployment.yaml -n demo-apps
```

## Simulated Actions

Each cycle performs a randomized sequence of:

1. **Dashboard** - View dashboard, click refresh button
2. **Invoices** - Navigate to invoices, click on invoice rows
3. **Documents** - View document list
4. **Payments** - View payments, attempt to process payments
5. **Vendors** - View vendor list, click on vendor rows
6. **Architecture Modal** - Open and close the architecture diagram

**Document Upload** (if enabled) runs every N cycles:
- Creates a temporary test file
- Selects the file via file input
- Clicks the upload button
- Cleans up old test files automatically

## APM Data Generated

The simulator generates the following trace types:

| Trace Type | Description |
|------------|-------------|
| `page-load` | Initial page loads |
| `route-change` | SPA navigation between pages |
| `user-interaction` | Click events on buttons and elements |
| `http-request` | API calls to backend services |

Backend services will show correlated spans:
- `procurement-api` - API Gateway handling
- `document-service` - Document processing (Python)
- `payment-service` - Payment processing (Java)
- PostgreSQL queries
- Redis cache operations

## Troubleshooting

### Browser not launching

```bash
# Ensure Playwright browsers are installed
npx playwright install chromium
```

### Connection refused

- Verify `BASE_URL` is correct and accessible
- Check if the application is running
- Ensure network connectivity (if running in container)

### Uploads failing

- Verify the document upload feature is working in the app
- Check browser console for errors (run with `HEADLESS=false`)
- Enable verbose logging: `VERBOSE=true npm start`
