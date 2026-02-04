-- Migration: ETL Logging Enhancements
-- Adds 4-state lifecycle support to etl_execution_log
-- Adds foreign key relationship from word_analysis_log

-- 1. Add queued_at column to etl_execution_log
ALTER TABLE etl_execution_log
  ADD COLUMN IF NOT EXISTS queued_at TIMESTAMP WITH TIME ZONE;

-- 2. Add etl_log_id foreign key to word_analysis_log
ALTER TABLE word_analysis_log
  ADD COLUMN IF NOT EXISTS etl_log_id INTEGER REFERENCES etl_execution_log(id);

-- 3. Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_etl_execution_log_status ON etl_execution_log(status);
CREATE INDEX IF NOT EXISTS idx_word_analysis_log_etl_log_id ON word_analysis_log(etl_log_id);

-- Note: Historical word_analysis_log records will have etl_log_id = NULL
