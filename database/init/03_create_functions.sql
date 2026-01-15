-- Hermes Database Functions
-- Essential helper functions for data processing

-- Function: Convert microsecond timestamp to PostgreSQL timestamp with timezone
CREATE OR REPLACE FUNCTION microseconds_to_timestamp(microseconds BIGINT)
RETURNS TIMESTAMPTZ AS $$
BEGIN
    RETURN to_timestamp(microseconds / 1000000.0) AT TIME ZONE 'UTC';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- TODO: Add additional functions when needed:
-- - extract_youtube_video_id(url TEXT)
-- - has_emotes(emotes_json JSONB)
-- - message_char_length(message TEXT)