package com.procurement.payment.controller;

import com.procurement.payment.model.Payment;
import com.procurement.payment.repository.PaymentRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * =============================================================================
 * PAYMENT CONTROLLER - REST API for Payment Operations
 * =============================================================================
 * Handles payment processing and validation for the Government Procurement system.
 * 
 * OTEL AUTO-INSTRUMENTATION:
 * - All HTTP endpoints are automatically traced via OpenTelemetry Java Agent
 * - Database queries in PaymentRepository are auto-instrumented
 * - Trace context (traceparent header) is automatically propagated from upstream services
 * - No manual instrumentation code required - the K8s OTEL Operator injects the agent
 * 
 * DISTRIBUTED TRACING FLOW:
 * Browser (RUM) → Nginx → procurement-api → payment-service → PostgreSQL
 *                                          ↑ You are here
 * 
 * KEY ENDPOINTS:
 * - POST /api/payments/validate - Validate payment before processing
 * - POST /api/payments/process  - Process payment and create record
 * - GET  /api/payments          - List all payments
 * - GET  /api/payments/{id}     - Get specific payment
 * =============================================================================
 */
@RestController
@RequestMapping("/api/payments")
@CrossOrigin(origins = "*")
public class PaymentController {
    
    private static final Logger logger = LoggerFactory.getLogger(PaymentController.class);
    private final PaymentRepository paymentRepository;
    private final Random random = new Random();
    
    public PaymentController(PaymentRepository paymentRepository) {
        this.paymentRepository = paymentRepository;
    }
    
    /**
     * Log incoming requests with trace context.
     */
    private void logRequest(String method, String path, String traceparent) {
        logger.info("{} {}", method, path);
        if (traceparent != null) {
            logger.info("[Trace] traceparent: {}", traceparent);
        }
    }
    
    /**
     * Get all payments.
     */
    @GetMapping
    public ResponseEntity<Map<String, Object>> getAllPayments(
            @RequestHeader(value = "traceparent", required = false) String traceparent) {
        logRequest("GET", "/api/payments", traceparent);
        
        List<Payment> payments = paymentRepository.findAll();
        Map<String, Object> response = new HashMap<>();
        response.put("payments", payments);
        response.put("count", payments.size());
        return ResponseEntity.ok(response);
    }
    
    /**
     * Get payment by ID.
     */
    @GetMapping("/{id}")
    public ResponseEntity<Object> getPaymentById(
            @PathVariable Long id,
            @RequestHeader(value = "traceparent", required = false) String traceparent) {
        logRequest("GET", "/api/payments/" + id, traceparent);
        
        return paymentRepository.findById(id)
            .<ResponseEntity<Object>>map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }
    
    /**
     * Validate payment details.
     * Called before processing a payment to ensure validity.
     */
    @PostMapping("/validate")
    public ResponseEntity<Map<String, Object>> validatePayment(
            @RequestBody Map<String, Object> request,
            @RequestHeader(value = "traceparent", required = false) String traceparent) {
        logRequest("POST", "/api/payments/validate", traceparent);
        
        Long invoiceId = ((Number) request.get("invoice_id")).longValue();
        BigDecimal amount = new BigDecimal(request.get("amount").toString());
        
        logger.info("Validating payment for invoice: {}, amount: {}", invoiceId, amount);
        
        // Simulate validation processing time
        simulateProcessingTime(100, 300);
        
        Map<String, Object> response = new HashMap<>();
        List<Map<String, Object>> validations = new ArrayList<>();
        List<Map<String, Object>> issues = new ArrayList<>();
        
        // Validation 1: Amount range check
        boolean amountValid = amount.compareTo(BigDecimal.ZERO) > 0 && 
                             amount.compareTo(new BigDecimal("1000000")) <= 0;
        validations.add(createValidation("amount_range", amountValid));
        if (!amountValid) {
            issues.add(createIssue("error", "Amount must be between $0 and $1,000,000"));
        }
        
        // Validation 2: Check for duplicate payment
        Optional<Payment> existingPayment = paymentRepository.findByInvoiceId(invoiceId);
        boolean noDuplicate = existingPayment.isEmpty() || 
                              !"completed".equals(existingPayment.get().getStatus());
        validations.add(createValidation("no_duplicate", noDuplicate));
        if (!noDuplicate) {
            issues.add(createIssue("error", "Invoice has already been paid"));
        }
        
        // Validation 3: Budget compliance (simulated)
        boolean budgetCompliant = amount.compareTo(new BigDecimal("500000")) <= 0 || 
                                  random.nextBoolean(); // Large amounts need approval
        validations.add(createValidation("budget_compliance", budgetCompliant));
        if (!budgetCompliant) {
            issues.add(createIssue("warning", "Amount exceeds $500,000 - requires additional approval"));
        }
        
        boolean isValid = issues.stream().noneMatch(i -> "error".equals(i.get("type")));
        
        response.put("valid", isValid);
        response.put("invoice_id", invoiceId);
        response.put("amount", amount);
        response.put("validations", validations);
        response.put("issues", issues);
        response.put("validation_time_ms", random.nextInt(200) + 100);
        
        logger.info("Payment validation complete: valid={}", isValid);
        
        return ResponseEntity.ok(response);
    }
    
    /**
     * Process a payment.
     * Creates a payment record and simulates payment gateway interaction.
     */
    @PostMapping("/process")
    public ResponseEntity<Map<String, Object>> processPayment(
            @RequestBody Map<String, Object> request,
            @RequestHeader(value = "traceparent", required = false) String traceparent) {
        logRequest("POST", "/api/payments/process", traceparent);
        
        Long invoiceId = ((Number) request.get("invoice_id")).longValue();
        BigDecimal amount = new BigDecimal(request.get("amount").toString());
        String invoiceNumber = (String) request.getOrDefault("invoice_number", "UNKNOWN");
        
        logger.info("Processing payment for invoice: {}, amount: {}", invoiceId, amount);
        
        // Simulate payment gateway processing
        long startTime = System.currentTimeMillis();
        simulateProcessingTime(500, 1500);
        
        // Generate payment reference
        String paymentNumber = "PAY-" + 
            LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd")) + 
            "-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        
        String confirmationNumber = "CONF-" + 
            UUID.randomUUID().toString().substring(0, 12).toUpperCase();
        
        // Simulate success/failure (95% success rate)
        boolean success = random.nextInt(100) < 95;
        String status = success ? "completed" : "failed";
        
        // Create payment record
        Payment payment = new Payment();
        payment.setPaymentNumber(paymentNumber);
        payment.setInvoiceId(invoiceId);
        payment.setAmount(amount);
        payment.setPaymentMethod("ACH");
        payment.setStatus(status);
        payment.setProcessedAt(LocalDateTime.now());
        payment.setConfirmationNumber(success ? confirmationNumber : null);
        
        Payment savedPayment = paymentRepository.save(payment);
        
        // Log audit
        String auditDetails = String.format(
            "{\"invoice_number\": \"%s\", \"amount\": %s, \"status\": \"%s\", \"confirmation\": \"%s\"}",
            invoiceNumber, amount, status, confirmationNumber
        );
        paymentRepository.logAudit("payment", savedPayment.getId(), "processed", auditDetails);
        
        long processingTime = System.currentTimeMillis() - startTime;
        
        Map<String, Object> response = new HashMap<>();
        response.put("success", success);
        response.put("payment_id", savedPayment.getId());
        response.put("payment_number", paymentNumber);
        response.put("invoice_id", invoiceId);
        response.put("amount", amount);
        response.put("status", status);
        response.put("confirmation_number", success ? confirmationNumber : null);
        response.put("processing_time_ms", processingTime);
        response.put("processed_at", LocalDateTime.now().toString());
        
        if (!success) {
            response.put("error", "Payment processing failed - please retry");
        }
        
        logger.info("Payment processed: {} - status: {}", paymentNumber, status);
        
        return ResponseEntity.ok(response);
    }
    
    /**
     * Create a validation result map.
     */
    private Map<String, Object> createValidation(String check, boolean passed) {
        Map<String, Object> validation = new HashMap<>();
        validation.put("check", check);
        validation.put("passed", passed);
        return validation;
    }
    
    /**
     * Create an issue map.
     */
    private Map<String, Object> createIssue(String type, String message) {
        Map<String, Object> issue = new HashMap<>();
        issue.put("type", type);
        issue.put("message", message);
        return issue;
    }
    
    /**
     * Simulate processing time to make traces more realistic.
     */
    private void simulateProcessingTime(int minMs, int maxMs) {
        try {
            int delay = random.nextInt(maxMs - minMs) + minMs;
            Thread.sleep(delay);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
