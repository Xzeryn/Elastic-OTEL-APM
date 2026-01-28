"""
=============================================================================
DOCUMENT SERVICE - Python/Flask
=============================================================================
Handles document management for the Government Procurement system.

Features:
- Actual file upload with binary data
- File processing simulation (virus scan, validation)
- Scheduled file deletion for cleanup
- PostgreSQL integration (auto-instrumented by OTEL)
- Rich tracing with file I/O operations
=============================================================================
"""

import os
import time
import uuid
import random
import logging
import threading
from datetime import datetime
from flask import Flask, request, jsonify
import psycopg2
from psycopg2.extras import RealDictCursor

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# =============================================================================
# CONFIGURATION
# =============================================================================
UPLOAD_FOLDER = '/tmp/documents'
CLEANUP_DELAY_SECONDS = 30  # Delete files after 30 seconds
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

# Ensure upload folder exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# =============================================================================
# DATABASE CONFIGURATION
# =============================================================================
def get_db_connection():
    """Create a new database connection."""
    return psycopg2.connect(
        host=os.environ.get('POSTGRES_HOST', 'postgres'),
        port=os.environ.get('POSTGRES_PORT', '5432'),
        database=os.environ.get('POSTGRES_DB', 'procurement'),
        user=os.environ.get('POSTGRES_USER', 'procurement_user'),
        password=os.environ.get('POSTGRES_PASSWORD', 'procurement_pass'),
        cursor_factory=RealDictCursor
    )

# =============================================================================
# FILE CLEANUP SCHEDULER
# =============================================================================
def schedule_file_deletion(file_path, doc_id, delay_seconds):
    """Schedule a file for deletion after a delay."""
    def delete_file():
        time.sleep(delay_seconds)
        try:
            if os.path.exists(file_path):
                # Get file size before deletion for logging
                file_size = os.path.getsize(file_path)
                
                # Delete the file
                os.remove(file_path)
                logger.info(f"[Cleanup] Deleted file: {file_path} ({file_size} bytes)")
                
                # Update database status
                try:
                    conn = get_db_connection()
                    with conn.cursor() as cur:
                        cur.execute("""
                            UPDATE documents SET status = 'deleted', validated_at = NOW()
                            WHERE id = %s
                        """, (doc_id,))
                        
                        # Log audit
                        cur.execute("""
                            INSERT INTO audit_logs (entity_type, entity_id, action, details)
                            VALUES ('document', %s, 'deleted', %s)
                        """, (doc_id, f'{{"reason": "scheduled_cleanup", "file_size": {file_size}}}'))
                        conn.commit()
                    conn.close()
                    logger.info(f"[Cleanup] Updated database for document {doc_id}")
                except Exception as db_err:
                    logger.error(f"[Cleanup] Database update failed: {db_err}")
            else:
                logger.warning(f"[Cleanup] File not found: {file_path}")
        except Exception as e:
            logger.error(f"[Cleanup] Error deleting file {file_path}: {e}")
    
    # Start deletion in background thread
    thread = threading.Thread(target=delete_file, daemon=True)
    thread.start()
    logger.info(f"[Cleanup] Scheduled deletion of {file_path} in {delay_seconds} seconds")

# =============================================================================
# LOGGING MIDDLEWARE
# =============================================================================
@app.before_request
def log_request():
    """Log incoming requests."""
    logger.info(f"{request.method} {request.path}")

# =============================================================================
# HEALTH CHECK
# =============================================================================
@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute('SELECT 1')
        conn.close()
        return jsonify({
            'status': 'healthy',
            'service': 'document-service',
            'timestamp': datetime.utcnow().isoformat()
        })
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return jsonify({'status': 'unhealthy', 'error': str(e)}), 500

# =============================================================================
# DOCUMENT UPLOAD - Actual File Handling
# =============================================================================
@app.route('/api/documents/upload', methods=['POST'])
def upload_document():
    """
    Handle actual document file upload.
    - Receives binary file data
    - Saves to temp storage
    - Simulates processing (virus scan, validation)
    - Schedules automatic deletion
    """
    upload_start = time.time()
    logger.info("Processing document upload...")
    
    # Check if file is in request
    if 'file' not in request.files:
        # Fallback to JSON metadata only (for backward compatibility)
        data = request.get_json() or {}
        return handle_metadata_upload(data)
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({'success': False, 'error': 'No file selected'}), 400
    
    # Get additional form data
    invoice_id = request.form.get('invoice_id')
    document_type = request.form.get('document_type', 'invoice')
    
    # Read file data
    file_data = file.read()
    file_size = len(file_data)
    original_filename = file.filename
    mime_type = file.content_type or 'application/octet-stream'
    
    logger.info(f"Received file: {original_filename}, Size: {file_size} bytes, Type: {mime_type}")
    
    # Check file size
    if file_size > MAX_FILE_SIZE:
        return jsonify({
            'success': False, 
            'error': f'File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)}MB'
        }), 400
    
    # Generate unique filename and reference
    file_ext = os.path.splitext(original_filename)[1] or '.bin'
    unique_id = uuid.uuid4().hex[:12]
    stored_filename = f"{unique_id}{file_ext}"
    file_path = os.path.join(UPLOAD_FOLDER, stored_filename)
    doc_reference = f"DOC-{datetime.now().strftime('%Y%m%d')}-{unique_id[:8].upper()}"
    
    try:
        # =================================================================
        # STEP 1: Write file to disk (traced I/O operation)
        # =================================================================
        write_start = time.time()
        with open(file_path, 'wb') as f:
            f.write(file_data)
        write_duration = time.time() - write_start
        logger.info(f"[I/O] File written to {file_path} in {write_duration*1000:.1f}ms")
        
        # =================================================================
        # STEP 2: Simulate virus scan (processing delay based on file size)
        # =================================================================
        scan_start = time.time()
        scan_duration = min(file_size / 1000000 * 0.3, 1.5)  # ~300ms per MB, max 1.5s
        time.sleep(scan_duration)
        logger.info(f"[Scan] Virus scan completed in {(time.time() - scan_start)*1000:.1f}ms - CLEAN")
        
        # =================================================================
        # STEP 3: Simulate format validation
        # =================================================================
        validation_start = time.time()
        validation_duration = random.uniform(0.1, 0.3)
        time.sleep(validation_duration)
        logger.info(f"[Validate] Format validation completed in {(time.time() - validation_start)*1000:.1f}ms - VALID")
        
        # =================================================================
        # STEP 4: Store metadata in database
        # =================================================================
        db_start = time.time()
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO documents 
                (invoice_id, filename, original_filename, file_size, mime_type, document_type, status)
                VALUES (%s, %s, %s, %s, %s, %s, 'uploaded')
                RETURNING *
            """, (invoice_id if invoice_id else None, doc_reference, original_filename, 
                  file_size, mime_type, document_type))
            document = cur.fetchone()
            conn.commit()
            
            # Log audit
            cur.execute("""
                INSERT INTO audit_logs (entity_type, entity_id, action, details)
                VALUES ('document', %s, 'uploaded', %s)
            """, (document['id'], f'{{"filename": "{original_filename}", "size": {file_size}, "path": "{file_path}"}}'))
            conn.commit()
        conn.close()
        db_duration = time.time() - db_start
        logger.info(f"[DB] Metadata stored in {db_duration*1000:.1f}ms")
        
        # =================================================================
        # STEP 5: Schedule file deletion
        # =================================================================
        schedule_file_deletion(file_path, document['id'], CLEANUP_DELAY_SECONDS)
        
        total_duration = time.time() - upload_start
        logger.info(f"Document upload complete: {doc_reference} in {total_duration*1000:.1f}ms")
        
        return jsonify({
            'success': True,
            'document': dict(document),
            'reference': doc_reference,
            'file_path': file_path,
            'processing': {
                'write_ms': round(write_duration * 1000),
                'scan_ms': round(scan_duration * 1000),
                'validation_ms': round(validation_duration * 1000),
                'database_ms': round(db_duration * 1000),
                'total_ms': round(total_duration * 1000)
            },
            'cleanup_scheduled_seconds': CLEANUP_DELAY_SECONDS
        }), 201
        
    except Exception as e:
        logger.error(f"Upload error: {e}")
        # Clean up file if it was written
        if os.path.exists(file_path):
            os.remove(file_path)
        return jsonify({'success': False, 'error': str(e)}), 500


def handle_metadata_upload(data):
    """Handle legacy metadata-only uploads."""
    invoice_id = data.get('invoice_id')
    filename = data.get('filename', f'document_{uuid.uuid4().hex[:8]}.pdf')
    file_size = data.get('file_size', random.randint(100000, 5000000))
    document_type = data.get('document_type', 'invoice')
    mime_type = data.get('mime_type', 'application/pdf')
    
    # Simulate processing
    processing_time = min(file_size / 1000000 * 0.5, 2.0)
    time.sleep(processing_time)
    
    doc_reference = f"DOC-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:8].upper()}"
    
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO documents 
                (invoice_id, filename, original_filename, file_size, mime_type, document_type, status)
                VALUES (%s, %s, %s, %s, %s, %s, 'uploaded')
                RETURNING *
            """, (invoice_id, doc_reference, filename, file_size, mime_type, document_type))
            document = cur.fetchone()
            conn.commit()
        conn.close()
        
        return jsonify({
            'success': True,
            'document': dict(document),
            'reference': doc_reference,
            'processing_time_ms': int(processing_time * 1000)
        }), 201
        
    except Exception as e:
        logger.error(f"Metadata upload error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

# =============================================================================
# GET DOCUMENT
# =============================================================================
@app.route('/api/documents/<int:doc_id>', methods=['GET'])
def get_document(doc_id):
    """Retrieve document metadata."""
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT d.*, i.invoice_number
                FROM documents d
                LEFT JOIN invoices i ON d.invoice_id = i.id
                WHERE d.id = %s
            """, (doc_id,))
            document = cur.fetchone()
        conn.close()
        
        if not document:
            return jsonify({'error': 'Document not found'}), 404
            
        return jsonify(dict(document))
        
    except Exception as e:
        logger.error(f"Get document error: {e}")
        return jsonify({'error': str(e)}), 500

# =============================================================================
# DOCUMENT VALIDATION
# =============================================================================
@app.route('/api/documents/validate', methods=['POST'])
def validate_documents():
    """
    Validate documents for an invoice.
    Checks document count, types, and completeness.
    """
    logger.info("Validating documents...")
    
    data = request.get_json() or {}
    invoice_id = data.get('invoice_id')
    
    if not invoice_id:
        return jsonify({
            'valid': False,
            'error': 'Invoice ID required'
        }), 400
    
    # Simulate validation processing
    validation_time = random.uniform(0.1, 0.5)
    time.sleep(validation_time)
    
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM documents WHERE invoice_id = %s", (invoice_id,))
            documents = cur.fetchall()
            
            cur.execute("SELECT * FROM invoices WHERE id = %s", (invoice_id,))
            invoice = cur.fetchone()
        conn.close()
        
        if not invoice:
            return jsonify({'valid': False, 'error': 'Invoice not found'}), 404
        
        validations = []
        issues = []
        
        if len(documents) == 0:
            issues.append({'type': 'warning', 'message': 'No supporting documents attached'})
            validations.append({'check': 'documents_present', 'passed': False})
        else:
            validations.append({'check': 'documents_present', 'passed': True})
        
        has_invoice_doc = any(d['document_type'] == 'invoice' for d in documents)
        validations.append({'check': 'invoice_document', 'passed': has_invoice_doc})
        if not has_invoice_doc:
            issues.append({'type': 'warning', 'message': 'Invoice document not found'})
        
        total_size = sum(d['file_size'] or 0 for d in documents)
        max_total_size = 50 * 1024 * 1024
        size_ok = total_size <= max_total_size
        validations.append({'check': 'total_size', 'passed': size_ok, 'total_mb': round(total_size / 1024 / 1024, 2)})
        
        if not size_ok:
            issues.append({'type': 'error', 'message': f'Total size exceeds {max_total_size // 1024 // 1024}MB'})
        
        if len(issues) == 0 or all(i['type'] == 'warning' for i in issues):
            conn = get_db_connection()
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE documents SET status = 'validated', validated_at = NOW()
                    WHERE invoice_id = %s
                """, (invoice_id,))
                conn.commit()
            conn.close()
        
        is_valid = len([i for i in issues if i['type'] == 'error']) == 0
        logger.info(f"Validation complete for invoice {invoice_id}: valid={is_valid}")
        
        return jsonify({
            'valid': is_valid,
            'invoice_id': invoice_id,
            'document_count': len(documents),
            'validations': validations,
            'issues': issues,
            'validation_time_ms': int(validation_time * 1000)
        })
        
    except Exception as e:
        logger.error(f"Validation error: {e}")
        return jsonify({'valid': False, 'error': str(e)}), 500

# =============================================================================
# LIST DOCUMENTS
# =============================================================================
@app.route('/api/documents', methods=['GET'])
def list_documents():
    """List all documents."""
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT d.*, i.invoice_number
                FROM documents d
                LEFT JOIN invoices i ON d.invoice_id = i.id
                ORDER BY d.uploaded_at DESC
                LIMIT 100
            """)
            documents = cur.fetchall()
        conn.close()
        
        return jsonify({
            'documents': [dict(d) for d in documents],
            'count': len(documents)
        })
        
    except Exception as e:
        logger.error(f"List documents error: {e}")
        return jsonify({'error': str(e)}), 500

# =============================================================================
# ERROR HANDLER
# =============================================================================
@app.errorhandler(Exception)
def handle_error(e):
    logger.error(f"Unhandled error: {e}")
    return jsonify({'error': str(e)}), 500

# =============================================================================
# MAIN
# =============================================================================
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    logger.info(f"Document Service starting on port {port}")
    logger.info(f"Environment: {os.environ.get('DEPLOYMENT_ENVIRONMENT', 'development')}")
    logger.info(f"Upload folder: {UPLOAD_FOLDER}")
    logger.info(f"Cleanup delay: {CLEANUP_DELAY_SECONDS} seconds")
    app.run(host='0.0.0.0', port=port, debug=False)
