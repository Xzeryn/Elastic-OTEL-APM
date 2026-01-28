package com.procurement.payment;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * =============================================================================
 * PAYMENT SERVICE - Java/Spring Boot
 * =============================================================================
 * Handles payment processing for the Government Procurement system.
 * 
 * Features:
 * - Payment validation
 * - Payment processing simulation
 * - PostgreSQL integration (auto-instrumented by OTEL)
 * - Audit logging
 * =============================================================================
 */
@SpringBootApplication
public class PaymentServiceApplication {
    
    private static final Logger logger = LoggerFactory.getLogger(PaymentServiceApplication.class);
    
    public static void main(String[] args) {
        logger.info("Starting Payment Service...");
        logger.info("Environment: {}", System.getenv().getOrDefault("DEPLOYMENT_ENVIRONMENT", "development"));
        SpringApplication.run(PaymentServiceApplication.class, args);
    }
}
