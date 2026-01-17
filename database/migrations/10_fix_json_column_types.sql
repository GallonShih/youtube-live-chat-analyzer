-- Migration: Fix JSON column types for PostgreSQL compatibility
-- Run this on existing databases

-- Fix confidence_score: JSON -> NUMERIC(5,4)
ALTER TABLE pending_replace_words 
    ALTER COLUMN confidence_score TYPE NUMERIC(5,4) 
    USING (confidence_score::text::numeric);

ALTER TABLE pending_special_words 
    ALTER COLUMN confidence_score TYPE NUMERIC(5,4) 
    USING (confidence_score::text::numeric);

-- Fix example_messages: JSON -> JSONB
ALTER TABLE pending_replace_words 
    ALTER COLUMN example_messages TYPE JSONB 
    USING example_messages::jsonb;

ALTER TABLE pending_special_words 
    ALTER COLUMN example_messages TYPE JSONB 
    USING example_messages::jsonb;

-- Fix rate_to_twd: JSON -> NUMERIC(12,4)
ALTER TABLE currency_rates 
    ALTER COLUMN rate_to_twd TYPE NUMERIC(12,4) 
    USING (rate_to_twd::text::numeric);
