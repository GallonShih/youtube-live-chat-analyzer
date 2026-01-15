-- Migration: Convert timestamp columns to timestamptz (UTC)
-- Run this script to migrate existing data
-- 
-- Prerequisites:
--   - Backup database before running
--   - Run during low traffic period (chat_messages may be large)
--
-- Usage:
--   docker compose exec -T postgres psql -U hermes -d hermes -f /path/to/08_migrate_timestamps_to_utc.sql
--   or
--   docker compose exec -T postgres psql -U hermes -d hermes < database/migrations/08_migrate_timestamps_to_utc.sql

BEGIN;

-- ============================================
-- chat_messages table
-- ============================================
ALTER TABLE chat_messages 
    ALTER COLUMN published_at TYPE TIMESTAMPTZ 
    USING published_at AT TIME ZONE 'UTC';

ALTER TABLE chat_messages 
    ALTER COLUMN created_at TYPE TIMESTAMPTZ 
    USING created_at AT TIME ZONE 'UTC';

-- ============================================
-- stream_stats table
-- ============================================
ALTER TABLE stream_stats 
    ALTER COLUMN actual_start_time TYPE TIMESTAMPTZ 
    USING actual_start_time AT TIME ZONE 'UTC';

ALTER TABLE stream_stats 
    ALTER COLUMN scheduled_start_time TYPE TIMESTAMPTZ 
    USING scheduled_start_time AT TIME ZONE 'UTC';

ALTER TABLE stream_stats 
    ALTER COLUMN collected_at TYPE TIMESTAMPTZ 
    USING collected_at AT TIME ZONE 'UTC';

-- ============================================
-- hourly_message_stats table
-- ============================================
ALTER TABLE hourly_message_stats 
    ALTER COLUMN hour_timestamp TYPE TIMESTAMPTZ 
    USING hour_timestamp AT TIME ZONE 'UTC';

ALTER TABLE hourly_message_stats 
    ALTER COLUMN created_at TYPE TIMESTAMPTZ 
    USING created_at AT TIME ZONE 'UTC';

ALTER TABLE hourly_message_stats 
    ALTER COLUMN updated_at TYPE TIMESTAMPTZ 
    USING updated_at AT TIME ZONE 'UTC';

COMMIT;

-- Verify the migration
SELECT table_name, column_name, udt_name 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name IN ('chat_messages', 'stream_stats', 'hourly_message_stats')
  AND udt_name LIKE 'timestamp%'
ORDER BY table_name, column_name;
