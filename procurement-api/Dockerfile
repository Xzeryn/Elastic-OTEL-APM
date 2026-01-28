# =============================================================================
# PROCUREMENT API DOCKERFILE
# =============================================================================
# Node.js/Express API Gateway for Government Procurement System
# Auto-instrumented by OTEL Kubernetes operator
# =============================================================================

FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (production only)
RUN npm install --omit=dev

# Copy application code
COPY server.js ./

# Expose port
EXPOSE 3000

# Start application
CMD ["node", "server.js"]
