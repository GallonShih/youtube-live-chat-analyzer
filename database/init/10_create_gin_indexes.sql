-- ============================================================
-- GIN Indexes for ILIKE Optimization (New Environment)
-- ============================================================
-- This script creates GIN indexes using pg_trgm extension to
-- significantly speed up ILIKE '%keyword%' pattern queries.
--
-- GIN (Generalized Inverted Index) with trigram operators allows
-- PostgreSQL to use indexes for ILIKE queries that would otherwise
-- require full table scans.
--
-- Target columns:
--   - author_name: Used for filtering chat messages by author
--   - message: Used for filtering chat messages by content
--
-- Performance improvement:
--   Without GIN: O(n) full table scan
--   With GIN: O(log n) index lookup (typically 10-100x faster)
-- ============================================================

-- Enable pg_trgm extension (required for gin_trgm_ops)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN index on author_name for ILIKE queries
CREATE INDEX IF NOT EXISTS idx_chat_messages_author_trgm 
    ON chat_messages USING GIN (author_name gin_trgm_ops);

-- Create GIN index on message content for ILIKE queries
CREATE INDEX IF NOT EXISTS idx_chat_messages_message_trgm 
    ON chat_messages USING GIN (message gin_trgm_ops);
