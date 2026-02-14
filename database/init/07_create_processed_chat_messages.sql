-- Processed Chat Messages Table
-- 用於存放經過 ETL 處理後的留言資料，支援文字分析

-- 處理後的留言表
CREATE TABLE IF NOT EXISTS processed_chat_messages (
    message_id VARCHAR(255) PRIMARY KEY,
    live_stream_id VARCHAR(255) NOT NULL,
    original_message TEXT NOT NULL,
    processed_message TEXT NOT NULL,
    tokens TEXT[],
    unicode_emojis TEXT[],
    youtube_emotes JSONB,
    author_name VARCHAR(255) NOT NULL,
    author_id VARCHAR(255) NOT NULL,
    published_at TIMESTAMP WITH TIME ZONE NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ETL 檢查點表
CREATE TABLE IF NOT EXISTS processed_chat_checkpoint (
    id SERIAL PRIMARY KEY,
    last_processed_message_id VARCHAR(255),
    last_processed_timestamp TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 創建索引以提升查詢效能
-- Composite index for (live_stream_id, published_at) — covers most wordcloud/playback queries.
-- Also serves as an index on live_stream_id alone (prefix matching).
CREATE INDEX IF NOT EXISTS idx_processed_chat_stream_published ON processed_chat_messages(live_stream_id, published_at);
CREATE INDEX IF NOT EXISTS idx_processed_chat_published_at ON processed_chat_messages(published_at);
CREATE INDEX IF NOT EXISTS idx_processed_chat_author_id ON processed_chat_messages(author_id);

-- GIN 索引用於陣列查詢（詞頻、emoji 統計）
CREATE INDEX IF NOT EXISTS idx_processed_chat_tokens ON processed_chat_messages USING GIN(tokens);
CREATE INDEX IF NOT EXISTS idx_processed_chat_emojis ON processed_chat_messages USING GIN(unicode_emojis);

-- 添加註釋
COMMENT ON TABLE processed_chat_messages IS '處理後的聊天留言表，包含斷詞結果和 emoji 解析';
COMMENT ON COLUMN processed_chat_messages.original_message IS '原始留言內容';
COMMENT ON COLUMN processed_chat_messages.processed_message IS '處理後的留言（經過替換詞彙、移除 emoji）';
COMMENT ON COLUMN processed_chat_messages.tokens IS '斷詞結果陣列';
COMMENT ON COLUMN processed_chat_messages.unicode_emojis IS 'Unicode emoji 列表';
COMMENT ON COLUMN processed_chat_messages.youtube_emotes IS 'YouTube 自定義表情包 JSON';
COMMENT ON TABLE processed_chat_checkpoint IS 'ETL 處理檢查點，記錄最後處理的位置';
