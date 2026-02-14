-- YouTube Live Chat Analyzer Database Schema
-- YouTube Live Chat Collection and Analysis System

-- Create chat_messages table
CREATE TABLE chat_messages (
    message_id VARCHAR(255) PRIMARY KEY,
    live_stream_id VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    timestamp BIGINT NOT NULL,
    published_at TIMESTAMP WITH TIME ZONE NOT NULL,
    author_name VARCHAR(255) NOT NULL,
    author_id VARCHAR(255) NOT NULL,
    author_images JSONB,
    emotes JSONB,
    message_type VARCHAR(50),
    action_type VARCHAR(50),
    raw_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create stream_stats table
CREATE TABLE stream_stats (
    id SERIAL PRIMARY KEY,
    live_stream_id VARCHAR(255) NOT NULL,
    concurrent_viewers INTEGER,
    view_count BIGINT,
    like_count INTEGER,
    favorite_count INTEGER,
    comment_count INTEGER,
    actual_start_time TIMESTAMP WITH TIME ZONE,
    scheduled_start_time TIMESTAMP WITH TIME ZONE,
    active_live_chat_id VARCHAR(255),
    etag VARCHAR(255),
    raw_response JSONB,
    collected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_chat_messages_live_stream_published ON chat_messages(live_stream_id, published_at);
CREATE INDEX idx_chat_messages_published_at ON chat_messages(published_at);
CREATE INDEX idx_chat_messages_author_id ON chat_messages(author_id);
CREATE INDEX idx_chat_messages_timestamp ON chat_messages(timestamp);

-- Partial index for Super Chat (paid_message) queries — compact and fast
CREATE INDEX idx_chat_messages_paid ON chat_messages(live_stream_id, published_at)
    WHERE message_type = 'paid_message';

CREATE INDEX idx_stream_stats_live_stream_collected ON stream_stats(live_stream_id, collected_at);
CREATE INDEX idx_stream_stats_collected_at ON stream_stats(collected_at);