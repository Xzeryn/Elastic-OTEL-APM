package com.procurement.payment.repository;

import com.procurement.payment.model.Payment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * =============================================================================
 * PAYMENT REPOSITORY - Database Operations
 * =============================================================================
 * Handles all payment-related database operations using Spring JdbcTemplate.
 * 
 * OTEL AUTO-INSTRUMENTATION:
 * - All JDBC queries are automatically traced by the OpenTelemetry Java Agent
 * - Each SQL query creates a span with:
 *   - db.system: postgresql
 *   - db.statement: The SQL query
 *   - db.name: The database name
 * - Query execution time is captured automatically
 * - Parent trace context is inherited from the calling controller method
 * 
 * DATABASE TABLES USED:
 * - payments: Stores payment records
 * - audit_logs: Stores audit trail for compliance
 * =============================================================================
 */
@Repository
public class PaymentRepository {
    
    private static final Logger logger = LoggerFactory.getLogger(PaymentRepository.class);
    private final JdbcTemplate jdbcTemplate;
    
    public PaymentRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }
    
    private final RowMapper<Payment> paymentRowMapper = (rs, rowNum) -> {
        Payment payment = new Payment();
        payment.setId(rs.getLong("id"));
        payment.setPaymentNumber(rs.getString("payment_number"));
        payment.setInvoiceId(rs.getLong("invoice_id"));
        payment.setAmount(rs.getBigDecimal("amount"));
        payment.setPaymentMethod(rs.getString("payment_method"));
        payment.setStatus(rs.getString("status"));
        Timestamp processedAt = rs.getTimestamp("processed_at");
        if (processedAt != null) {
            payment.setProcessedAt(processedAt.toLocalDateTime());
        }
        payment.setConfirmationNumber(rs.getString("confirmation_number"));
        Timestamp createdAt = rs.getTimestamp("created_at");
        if (createdAt != null) {
            payment.setCreatedAt(createdAt.toLocalDateTime());
        }
        return payment;
    };
    
    public List<Payment> findAll() {
        logger.info("Fetching all payments");
        String sql = "SELECT * FROM payments ORDER BY created_at DESC";
        return jdbcTemplate.query(sql, paymentRowMapper);
    }
    
    public Optional<Payment> findById(Long id) {
        logger.info("Fetching payment by id: {}", id);
        String sql = "SELECT * FROM payments WHERE id = ?";
        List<Payment> payments = jdbcTemplate.query(sql, paymentRowMapper, id);
        return payments.isEmpty() ? Optional.empty() : Optional.of(payments.get(0));
    }
    
    public Optional<Payment> findByInvoiceId(Long invoiceId) {
        logger.info("Fetching payment by invoice_id: {}", invoiceId);
        String sql = "SELECT * FROM payments WHERE invoice_id = ? ORDER BY created_at DESC LIMIT 1";
        List<Payment> payments = jdbcTemplate.query(sql, paymentRowMapper, invoiceId);
        return payments.isEmpty() ? Optional.empty() : Optional.of(payments.get(0));
    }
    
    public Payment save(Payment payment) {
        logger.info("Saving payment for invoice: {}", payment.getInvoiceId());
        String sql = """
            INSERT INTO payments (payment_number, invoice_id, amount, payment_method, status, processed_at, confirmation_number)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            RETURNING *
        """;
        return jdbcTemplate.queryForObject(sql, paymentRowMapper,
            payment.getPaymentNumber(),
            payment.getInvoiceId(),
            payment.getAmount(),
            payment.getPaymentMethod(),
            payment.getStatus(),
            payment.getProcessedAt() != null ? Timestamp.valueOf(payment.getProcessedAt()) : null,
            payment.getConfirmationNumber()
        );
    }
    
    public void updateStatus(Long id, String status, String confirmationNumber) {
        logger.info("Updating payment {} status to: {}", id, status);
        String sql = "UPDATE payments SET status = ?, confirmation_number = ?, processed_at = NOW() WHERE id = ?";
        jdbcTemplate.update(sql, status, confirmationNumber, id);
    }
    
    public void logAudit(String entityType, Long entityId, String action, String details) {
        logger.info("Logging audit: {} {} {}", entityType, entityId, action);
        String sql = "INSERT INTO audit_logs (entity_type, entity_id, action, details) VALUES (?, ?, ?, ?::jsonb)";
        jdbcTemplate.update(sql, entityType, entityId, action, details);
    }
}
