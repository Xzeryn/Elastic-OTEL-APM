# =============================================================================
# PROCUREMENT SIMULATOR DOCKERFILE
# =============================================================================
# Builds a containerized version of the APM traffic simulator using Playwright.
#
# BUILD:
#   docker build -t <username>/procurement-simulator:v1 .
#
# RUN:
#   docker run --rm procurement-simulator:v1
#   docker run --rm -e ENABLE_UPLOADS=false procurement-simulator:v1
#   docker run --rm -e UPLOAD_FREQUENCY=10 -e ACTION_DELAY=3000 procurement-simulator:v1
#
# KUBERNETES:
#   See simulator-deployment.yaml for K8s deployment configuration
# =============================================================================

FROM mcr.microsoft.com/playwright:v1.40.0-jammy

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
ENV ACTION_DELAY=2000
ENV CYCLE_DELAY=5000
ENV ENABLE_UPLOADS=true
ENV UPLOAD_FREQUENCY=5
ENV HEADLESS=true
ENV MAX_CYCLES=0
ENV VERBOSE=false

# Run the simulator
CMD ["node", "simulator.js"]
