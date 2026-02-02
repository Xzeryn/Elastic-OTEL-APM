# =============================================================================
# PROCUREMENT SIMULATOR DOCKERFILE
# =============================================================================
# Builds a containerized version of the APM traffic simulator using Playwright.
#
# BUILD:
#   docker build -t <username>/procurement-simulator:v2 .
#
# RUN:
#   docker run --rm procurement-simulator:v2
#   docker run --rm -e ENABLE_UPLOADS=false -e ENABLE_INVOICES=false procurement-simulator:v2
#   docker run --rm -e CLEANUP_AGE_HOURS=12 procurement-simulator:v2
#
# KUBERNETES:
#   See simulator-deployment.yaml for K8s deployment configuration
# =============================================================================

FROM mcr.microsoft.com/playwright:v1.58.1-jammy

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install --production

# Copy simulator script
COPY simulator.js ./

# Create test-files directory
RUN mkdir -p /app/test-files

# Default environment variables
ENV BASE_URL=https://demo.myhousetech.net
ENV API_URL=https://demo.myhousetech.net
ENV ACTION_DELAY=2000
ENV CYCLE_DELAY=5000
ENV ENABLE_UPLOADS=true
ENV UPLOAD_FREQUENCY=5
ENV ENABLE_INVOICES=true
ENV INVOICE_FREQUENCY=3
ENV CLEANUP_FREQUENCY=10
ENV CLEANUP_AGE_HOURS=24
ENV HEADLESS=true
ENV MAX_CYCLES=0
ENV VERBOSE=false

# Run the simulator
CMD ["node", "simulator.js"]
