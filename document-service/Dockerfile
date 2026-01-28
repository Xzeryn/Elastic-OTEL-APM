# =============================================================================
# DOCUMENT SERVICE DOCKERFILE
# =============================================================================
# Python/Flask Document Management Service for Government Procurement System
# Auto-instrumented by OTEL Kubernetes operator
# =============================================================================

FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app.py .

# Expose port
EXPOSE 5000

# Start with Python directly (better compatibility with OTEL auto-instrumentation)
CMD ["python", "app.py"]
