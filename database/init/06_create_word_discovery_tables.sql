-- Word Discovery Tables
-- 用於自動發現和管理新詞彙

-- 待審核的替換詞彙表
CREATE TABLE IF NOT EXISTS pending_replace_words (
    id SERIAL PRIMARY KEY,
    source_word VARCHAR(255) NOT NULL,
    target_word VARCHAR(255) NOT NULL,
    confidence_score DECIMAL(3,2),  -- AI 信心分數 (0.00-1.00)
    occurrence_count INTEGER DEFAULT 1,  -- 出現次數
    example_messages TEXT[],  -- 範例留言（最多保留 5 條）
    discovered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending',  -- pending, approved, rejected
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewed_by VARCHAR(100),
    notes TEXT,
    UNIQUE(source_word, target_word)
);

-- 待審核的特殊詞彙表
CREATE TABLE IF NOT EXISTS pending_special_words (
    id SERIAL PRIMARY KEY,
    word VARCHAR(255) NOT NULL UNIQUE,
    confidence_score DECIMAL(3,2),
    occurrence_count INTEGER DEFAULT 1,
    example_messages TEXT[],
    word_type VARCHAR(50),  -- meme（梗）, typo（錯字）, variant（變體）, character（角色）, slang（俚語）
    discovered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending',
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewed_by VARCHAR(100),
    notes TEXT
);

-- 詞彙分析執行記錄
CREATE TABLE IF NOT EXISTS word_analysis_log (
    id SERIAL PRIMARY KEY,
    run_id VARCHAR(100) NOT NULL,
    etl_log_id INTEGER REFERENCES etl_execution_log(id),  -- 關聯到 ETL 執行記錄
    analysis_start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    analysis_end_time TIMESTAMP WITH TIME ZONE,
    messages_analyzed INTEGER DEFAULT 0,
    new_replace_words_found INTEGER DEFAULT 0,
    new_special_words_found INTEGER DEFAULT 0,
    api_calls_made INTEGER DEFAULT 0,
    tokens_used INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'running',  -- running, completed, failed
    error_message TEXT,
    execution_time_seconds INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 已分析留言追蹤表（記錄已分析到哪裡）
CREATE TABLE IF NOT EXISTS word_analysis_checkpoint (
    id SERIAL PRIMARY KEY,
    last_analyzed_message_id VARCHAR(255),
    last_analyzed_timestamp TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 初始化 checkpoint
INSERT INTO word_analysis_checkpoint (last_analyzed_timestamp)
VALUES (NOW() - INTERVAL '3 hours')
ON CONFLICT DO NOTHING;

-- 創建索引
CREATE INDEX IF NOT EXISTS idx_pending_replace_status ON pending_replace_words(status);
CREATE INDEX IF NOT EXISTS idx_pending_replace_discovered ON pending_replace_words(discovered_at);
CREATE INDEX IF NOT EXISTS idx_pending_special_status ON pending_special_words(status);
CREATE INDEX IF NOT EXISTS idx_pending_special_discovered ON pending_special_words(discovered_at);
CREATE INDEX IF NOT EXISTS idx_word_analysis_log_run_id ON word_analysis_log(run_id);
CREATE INDEX IF NOT EXISTS idx_word_analysis_log_status ON word_analysis_log(status);

-- 添加註釋
COMMENT ON TABLE pending_replace_words IS '待審核的替換詞彙，由 AI 自動發現';
COMMENT ON TABLE pending_special_words IS '待審核的特殊詞彙，由 AI 自動發現';
COMMENT ON TABLE word_analysis_log IS '詞彙分析執行記錄';
COMMENT ON TABLE word_analysis_checkpoint IS '已分析留言的檢查點';

COMMENT ON COLUMN pending_replace_words.confidence_score IS 'AI 判斷的信心分數 (0.00-1.00)';
COMMENT ON COLUMN pending_replace_words.example_messages IS '發現此詞彙的範例留言';
COMMENT ON COLUMN pending_special_words.word_type IS '詞彙類型：meme/typo/variant/character/slang';
