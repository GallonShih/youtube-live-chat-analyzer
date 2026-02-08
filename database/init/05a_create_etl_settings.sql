-- ETL Settings Table
-- 用於儲存 ETL 任務的配置設定（遷移自 Airflow Variables）

CREATE TABLE IF NOT EXISTS etl_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT,
    value_type VARCHAR(20) DEFAULT 'string',  -- string, text, boolean, integer, float, datetime
    description TEXT,
    is_sensitive BOOLEAN DEFAULT FALSE,  -- 敏感資訊不會在 UI 完整顯示
    category VARCHAR(50),  -- api, etl, import, ai
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(100) DEFAULT 'system'
);

-- 創建分類索引
CREATE INDEX IF NOT EXISTS idx_etl_settings_category ON etl_settings(category);

-- ETL Job Execution Log Table
-- 記錄每次 ETL 任務的執行狀態
CREATE TABLE IF NOT EXISTS etl_execution_log (
    id SERIAL PRIMARY KEY,
    job_id VARCHAR(100) NOT NULL,
    job_name VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'running',  -- running, completed, failed
    trigger_type VARCHAR(20) DEFAULT 'scheduled',  -- scheduled, manual
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    records_processed INTEGER DEFAULT 0,
    error_message TEXT,
    metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_etl_execution_log_job_id ON etl_execution_log(job_id);
CREATE INDEX IF NOT EXISTS idx_etl_execution_log_status ON etl_execution_log(status);
CREATE INDEX IF NOT EXISTS idx_etl_execution_log_started ON etl_execution_log(started_at DESC);

-- 插入預設值（從 Airflow Variables 遷移）
INSERT INTO etl_settings (key, value, value_type, description, category, is_sensitive) VALUES
-- API 設定
('GEMINI_API_KEY', '', 'string', 'Google Gemini API 金鑰（用於 AI 詞彙發現）', 'api', true),

-- ETL 處理設定
('PROCESS_CHAT_START_TIME', '', 'datetime', '聊天訊息處理起始時間（ISO 格式，空白則從 7 天前開始）', 'etl', false),
('PROCESS_CHAT_BATCH_SIZE', '1000', 'integer', '每批次處理的訊息數量', 'etl', false),
('PROCESS_CHAT_RESET', 'false', 'boolean', '下次執行時重置處理表（執行後自動重設為 false）', 'etl', false),

-- 字典匯入設定
('TRUNCATE_REPLACE_WORDS', 'false', 'boolean', '匯入時清空替換詞表', 'import', false),
('TRUNCATE_SPECIAL_WORDS', 'false', 'boolean', '匯入時清空特殊詞表', 'import', false),
('TRUNCATE_MEANINGLESS_WORDS', 'false', 'boolean', '匯入時清空無意義詞表', 'import', false),

-- AI 詞彙發現設定
('DISCOVER_NEW_WORDS_ENABLED', 'true', 'boolean', '啟用 AI 詞彙發現功能', 'ai', false),
('DISCOVER_NEW_WORDS_MIN_CONFIDENCE', '0.7', 'float', 'AI 發現詞彙的最低信心分數', 'ai', false),
('DISCOVER_NEW_WORDS_BATCH_SIZE', '500', 'integer', '每次 AI 分析的訊息數量', 'ai', false),

-- Collector 監控設定
('DISCORD_WEBHOOK_URL', '', 'string', 'Discord Webhook URL（用於 Collector 監控告警）', 'monitor', true),
('MONITOR_ENABLED', 'true', 'boolean', '啟用 Collector 監控', 'monitor', false),
('MONITOR_NO_DATA_THRESHOLD_MINUTES', '10', 'integer', '無新資料告警閾值（分鐘）', 'monitor', false),
('MONITOR_ALERT_STATE', '{}', 'string', 'Collector 監控告警狀態（系統內部使用）', 'monitor', true)
ON CONFLICT (key) DO NOTHING;


-- 添加註釋
COMMENT ON TABLE etl_settings IS 'ETL 任務配置設定，取代 Airflow Variables';
COMMENT ON TABLE etl_execution_log IS 'ETL 任務執行記錄';

COMMENT ON COLUMN etl_settings.key IS '設定鍵名';
COMMENT ON COLUMN etl_settings.value IS '設定值';
COMMENT ON COLUMN etl_settings.value_type IS '值類型：string/text/boolean/integer/float/datetime';
COMMENT ON COLUMN etl_settings.is_sensitive IS '是否為敏感資訊（API Key 等）';
COMMENT ON COLUMN etl_settings.category IS '設定分類：api/etl/import/ai';
