-- Text Analysis Dictionary Tables
-- 用於存放文字分析所需的字典資料

-- 無意義詞彙表
CREATE TABLE IF NOT EXISTS meaningless_words (
    id SERIAL PRIMARY KEY,
    word VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 替換詞彙表 (key-value mapping)
CREATE TABLE IF NOT EXISTS replace_words (
    id SERIAL PRIMARY KEY,
    source_word VARCHAR(255) NOT NULL UNIQUE,
    target_word VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 特殊詞彙表
CREATE TABLE IF NOT EXISTS special_words (
    id SERIAL PRIMARY KEY,
    word VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 創建索引以提升查詢效能
-- Note: meaningless_words.word, replace_words.source_word, special_words.word
-- already have implicit indexes from their UNIQUE constraints.
CREATE INDEX IF NOT EXISTS idx_replace_words_target ON replace_words(target_word);

-- 添加註釋
COMMENT ON TABLE meaningless_words IS '無意義詞彙表，用於過濾無意義的詞彙';
COMMENT ON TABLE replace_words IS '替換詞彙對照表，用於將特定詞彙替換為標準詞彙';
COMMENT ON TABLE special_words IS '特殊詞彙表，需要特別處理或保留的詞彙';
