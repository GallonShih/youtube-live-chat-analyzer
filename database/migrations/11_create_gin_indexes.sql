-- ============================================================
-- GIN Indexes for ILIKE Optimization (Migration for Existing DB)
-- ============================================================
-- Run this manually on an already-running PostgreSQL instance.
--
-- IMPORTANT: Uses CONCURRENTLY option to avoid locking writes.
-- This takes longer but doesn't block your application.
--
-- Estimated time for 4 million rows: 5-15 minutes per index
-- ============================================================

-- Step 1: Enable pg_trgm extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Step 2: Create GIN index on author_name (non-blocking)
-- This allows the database to continue accepting writes during index creation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_messages_author_trgm 
    ON chat_messages USING GIN (author_name gin_trgm_ops);

-- Step 3: Create GIN index on message content (non-blocking)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_messages_message_trgm 
    ON chat_messages USING GIN (message gin_trgm_ops);

-- ============================================================
-- Verification: Run these queries to confirm indexes are created
-- ============================================================
-- 
-- SELECT indexname, indexdef 
-- FROM pg_indexes 
-- WHERE tablename = 'chat_messages' AND indexname LIKE '%trgm%';
--
-- Expected output:
--   idx_chat_messages_author_trgm  | CREATE INDEX ... USING gin (author_name gin_trgm_ops)
--   idx_chat_messages_message_trgm | CREATE INDEX ... USING gin (message gin_trgm_ops)
--
-- ============================================================
-- Performance test: Compare EXPLAIN ANALYZE before/after
-- ============================================================
--
-- EXPLAIN ANALYZE 
-- SELECT * FROM chat_messages 
-- WHERE author_name ILIKE '%test%' 
-- LIMIT 10;
--
-- Before GIN: Seq Scan (scans all rows)
-- After GIN:  Bitmap Index Scan (uses trigram index)
-- ============================================================
