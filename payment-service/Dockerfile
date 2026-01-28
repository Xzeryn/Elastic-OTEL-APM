# =============================================================================
# PAYMENT SERVICE DOCKERFILE
# =============================================================================
# Java/Spring Boot Payment Service for Government Procurement System
# Multi-stage build for optimized image size
# Auto-instrumented by OTEL Kubernetes operator
# =============================================================================

# Build stage
FROM maven:3.9-eclipse-temurin-17-alpine AS builder

WORKDIR /app

# Copy pom.xml and download dependencies (cached layer)
COPY pom.xml .
RUN mvn dependency:go-offline -B

# Copy source and build
COPY src ./src
RUN mvn package -DskipTests -B

# Runtime stage
FROM eclipse-temurin:17-jre-alpine

WORKDIR /app

# Copy the built JAR
COPY --from=builder /app/target/*.jar app.jar

# Expose port
EXPOSE 8080

# Start application
ENTRYPOINT ["java", "-jar", "app.jar"]
