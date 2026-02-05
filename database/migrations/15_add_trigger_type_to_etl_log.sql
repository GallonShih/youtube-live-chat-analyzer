-- Migration: Simplify etl_execution_log timestamp fields
-- 1. 新增 trigger_type 欄位以區分排程/手動觸發
-- 2. 移除 created_at 欄位（與 started_at 功能重複）
-- 3. 移除 queued_at 欄位（目前系統沒有真正的排隊機制）

-- 1. Add trigger_type column
ALTER TABLE etl_execution_log
  ADD COLUMN IF NOT EXISTS trigger_type VARCHAR(20) DEFAULT 'scheduled';

-- 2. Migrate queued_at data to started_at (if started_at is NULL)
UPDATE etl_execution_log
SET started_at = queued_at
WHERE started_at IS NULL AND queued_at IS NOT NULL;

-- 3. Drop redundant columns
ALTER TABLE etl_execution_log
  DROP COLUMN IF EXISTS created_at;

ALTER TABLE etl_execution_log
  DROP COLUMN IF EXISTS queued_at;

-- 4. Add comment
COMMENT ON COLUMN etl_execution_log.trigger_type IS '觸發類型：scheduled (排程) / manual (手動)';
