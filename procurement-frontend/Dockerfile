# =============================================================================
# PROCUREMENT FRONTEND DOCKERFILE
# =============================================================================
# React application with Elastic RUM for Government Procurement System
# Multi-stage build: Node.js for building, Nginx for serving
# =============================================================================

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source files
COPY public ./public
COPY src ./src

# Build production bundle
RUN npm run build

# Runtime stage
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/build /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
