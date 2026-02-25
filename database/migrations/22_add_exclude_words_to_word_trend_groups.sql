-- Add exclude_words column to word_trend_groups
-- Nullable: NULL means no exclusions (backward compatible)
-- ADD COLUMN with no default is instant in PostgreSQL (no table rewrite)

ALTER TABLE word_trend_groups
    ADD COLUMN IF NOT EXISTS exclude_words JSON;

COMMENT ON COLUMN word_trend_groups.exclude_words IS 'Optional JSON array of strings; messages matching any exclude word are not counted even if they match an include word';
