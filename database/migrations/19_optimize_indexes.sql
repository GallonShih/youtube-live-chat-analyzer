-- ============================================================
-- Index Optimization Migration
-- ============================================================
-- Priority: P0 (composite index, drop redundant) + P1 (partial index, ETL log)
--
-- IMPORTANT: This script uses CONCURRENTLY to avoid blocking writes.
-- CONCURRENTLY cannot run inside a transaction block.
--
-- How to run:
--   Option A (recommended): psql command line (autocommit by default)
--     psql -U hermes -d hermes -f 19_optimize_indexes.sql
--
--   Option B: pgAdmin — do NOT paste the entire file.
--     Copy and execute each statement ONE AT A TIME.
--     Ensure "Auto commit" is ON (Query Tool toolbar).
--
--   Option C: If you cannot avoid transactions (e.g. some GUI tools),
--     use the non-CONCURRENTLY version at the bottom of this file.
--     Note: non-CONCURRENTLY will briefly LOCK the table for writes.
--
-- Side effects (no-downtime safe):
--   - CREATE INDEX CONCURRENTLY: Non-blocking, allows reads/writes during build.
--     May take several minutes on large tables. If interrupted, leaves an
--     INVALID index — clean up with: DROP INDEX CONCURRENTLY <index_name>;
--   - DROP INDEX CONCURRENTLY: Non-blocking, waits for active queries to finish.
--     Existing queries using the dropped index will complete normally.
--   - All operations are idempotent (IF EXISTS / IF NOT EXISTS).
--
-- Estimated time on ~4M rows: 2-5 minutes total
-- ============================================================


-- ============================================================
-- P0: Composite index on processed_chat_messages
-- ============================================================
-- Most wordcloud/playback queries filter by (live_stream_id, published_at).
-- Currently two separate indexes exist; a composite is far more efficient
-- as PostgreSQL can seek directly instead of bitmap AND.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_processed_chat_stream_published
    ON processed_chat_messages(live_stream_id, published_at);

-- Drop the now-redundant standalone live_stream_id index.
-- The composite index's prefix covers live_stream_id-only lookups.
-- Keep idx_processed_chat_published_at — some queries filter by time alone.
DROP INDEX CONCURRENTLY IF EXISTS idx_processed_chat_live_stream;


-- ============================================================
-- P0: Drop redundant indexes (duplicates of UNIQUE constraints)
-- ============================================================
-- PostgreSQL automatically creates a B-tree index for every UNIQUE constraint.
-- These manually-created indexes are exact duplicates, doubling write cost
-- for zero query benefit.

-- meaningless_words: UNIQUE(word) already provides idx
DROP INDEX CONCURRENTLY IF EXISTS idx_meaningless_words_word;

-- replace_words: UNIQUE(source_word) already provides idx
DROP INDEX CONCURRENTLY IF EXISTS idx_replace_words_source;

-- special_words: UNIQUE(word) already provides idx
DROP INDEX CONCURRENTLY IF EXISTS idx_special_words_word;

-- word_trend_groups: UNIQUE(name) already provides idx
DROP INDEX CONCURRENTLY IF EXISTS idx_word_trend_groups_name;

-- prompt_templates: UNIQUE(name) already provides idx
DROP INDEX CONCURRENTLY IF EXISTS idx_prompt_templates_name;


-- ============================================================
-- P1: Partial index for paid messages (Super Chat)
-- ============================================================
-- Super Chat queries filter message_type = 'paid_message' which is a tiny
-- fraction of all rows. A partial index is extremely compact and fast.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_messages_paid
    ON chat_messages(live_stream_id, published_at)
    WHERE message_type = 'paid_message';


-- ============================================================
-- P1: Composite index on etl_execution_log
-- ============================================================
-- ETL log queries always filter by job_id + ORDER BY started_at DESC.
-- A composite index covers this pattern; the old job_id-only index is redundant.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_etl_log_job_started
    ON etl_execution_log(job_id, started_at DESC);

-- Drop the now-redundant standalone job_id index (covered by composite prefix).
DROP INDEX CONCURRENTLY IF EXISTS idx_etl_execution_log_job_id;


-- ============================================================
-- Verification queries (run after migration)
-- ============================================================
--
-- 1. Check all indexes on affected tables:
--
--   SELECT tablename, indexname, indexdef
--   FROM pg_indexes
--   WHERE tablename IN (
--     'processed_chat_messages', 'chat_messages', 'etl_execution_log',
--     'meaningless_words', 'replace_words', 'special_words',
--     'word_trend_groups', 'prompt_templates'
--   )
--   ORDER BY tablename, indexname;
--
-- 2. Check for INVALID indexes (failed CONCURRENTLY builds):
--
--   SELECT indexrelid::regclass AS index_name, indisvalid
--   FROM pg_index
--   WHERE NOT indisvalid;
--
-- 3. Verify composite index is used:
--
--   EXPLAIN ANALYZE
--   SELECT DISTINCT message_id, unnest(tokens) AS word
--   FROM processed_chat_messages
--   WHERE live_stream_id = 'test' AND published_at >= NOW() - INTERVAL '1 hour';
--
-- ============================================================


-- ============================================================
-- Option C: Non-CONCURRENTLY version (for pgAdmin / GUI tools)
-- ============================================================
-- This version can run inside a transaction but will briefly
-- LOCK tables for writes during index creation.
-- Safe to run during low-traffic periods.
--
-- Uncomment the block below and run it as a single script.
-- ============================================================

-- BEGIN;
--
-- -- P0: Composite index on processed_chat_messages
-- CREATE INDEX IF NOT EXISTS idx_processed_chat_stream_published
--     ON processed_chat_messages(live_stream_id, published_at);
-- DROP INDEX IF EXISTS idx_processed_chat_live_stream;
--
-- -- P0: Drop redundant indexes (duplicates of UNIQUE constraints)
-- DROP INDEX IF EXISTS idx_meaningless_words_word;
-- DROP INDEX IF EXISTS idx_replace_words_source;
-- DROP INDEX IF EXISTS idx_special_words_word;
-- DROP INDEX IF EXISTS idx_word_trend_groups_name;
-- DROP INDEX IF EXISTS idx_prompt_templates_name;
--
-- -- P1: Partial index for paid messages (Super Chat)
-- CREATE INDEX IF NOT EXISTS idx_chat_messages_paid
--     ON chat_messages(live_stream_id, published_at)
--     WHERE message_type = 'paid_message';
--
-- -- P1: Composite index on etl_execution_log
-- CREATE INDEX IF NOT EXISTS idx_etl_log_job_started
--     ON etl_execution_log(job_id, started_at DESC);
-- DROP INDEX IF EXISTS idx_etl_execution_log_job_id;
--
-- COMMIT;
