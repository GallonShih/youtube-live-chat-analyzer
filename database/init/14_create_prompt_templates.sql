-- Prompt Templates Table
-- 用於儲存多個 AI 提示詞範本，可命名並選擇啟用

CREATE TABLE IF NOT EXISTS prompt_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    template TEXT NOT NULL,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) DEFAULT 'admin'
);

-- 創建索引
-- Note: UNIQUE(name) already provides an implicit index for lookups by name.
CREATE INDEX IF NOT EXISTS idx_prompt_templates_active ON prompt_templates(is_active);

-- 插入預設範本
INSERT INTO prompt_templates (name, description, template, is_active) VALUES
(
    'Default Template',
    '預設的 AI 詞彙發現提示詞範本',
    '你是一個專門分析網路直播留言的助手。請分析以下留言，找出：

1. **錯別字和變體詞彙**：需要替換成標準詞彙的錯字或諧音
2. **特殊詞彙**：新出現的梗、角色名、網路用語等需要保留的詞彙

**現有的字典（請避免重複建議這些詞）**：
- 已存在的替換詞彙範例：{{replace_examples}}...（共 {{replace_count}} 個）
- 已存在的特殊詞彙範例：{{special_examples}}...（共 {{special_count}} 個）

**重要規則**：
1. 不要建議已存在的詞彙
2. 替換後的標準詞彙（target）必須是準確、完整的詞
3. 特殊詞彙只建議新發現的梗或重要詞彙

**待分析的留言**：
{{messages_text}}

請以 JSON 格式回應，格式如下：
{
  "replace_words": [
    {
      "source": "錯字或變體",
      "target": "標準詞彙",
      "confidence": 0.95,
      "examples": ["範例留言1", "範例留言2"],
      "reason": "簡短說明"
    }
  ],
  "special_words": [
    {
      "word": "特殊詞彙",
      "type": "meme|typo|variant|character|slang",
      "confidence": 0.90,
      "examples": ["範例留言1"],
      "reason": "簡短說明"
    }
  ]
}

注意事項：
1. 只回報**新發現**的詞彙，避免重複現有字典
2. confidence 分數範圍 0.0-1.0，只回報 >= 0.7 的詞彙
3. 每個詞彙提供 1-3 個範例留言
4. 確保 target（替換後的詞）是正確且完整的標準詞彙',
    true
),
(
    'Strict Mode',
    '嚴格模式 - 提高信心分數門檻，減少誤報',
    '你是一個專門分析網路直播留言的專家助手。請以**嚴格標準**分析以下留言，找出：

1. **錯別字和變體詞彙**：僅建議**明顯且高頻率**的錯字或諧音
2. **特殊詞彙**：僅建議**確定是新梗或重要詞彙**

**現有的字典（請避免重複建議這些詞）**：
- 已存在的替換詞彙範例：{{replace_examples}}...（共 {{replace_count}} 個）
- 已存在的特殊詞彙範例：{{special_examples}}...（共 {{special_count}} 個）

**嚴格規則**：
1. **絕對不要**建議已存在的詞彙
2. 替換後的標準詞彙（target）必須是準確、完整、無歧義的詞
3. 只建議**信心分數 >= 0.9** 的詞彙
4. 特殊詞彙必須有**明確的上下文證據**

**待分析的留言**：
{{messages_text}}

請以 JSON 格式回應，格式如下：
{
  "replace_words": [
    {
      "source": "錯字或變體",
      "target": "標準詞彙",
      "confidence": 0.95,
      "examples": ["範例留言1", "範例留言2"],
      "reason": "簡短說明"
    }
  ],
  "special_words": [
    {
      "word": "特殊詞彙",
      "type": "meme|typo|variant|character|slang",
      "confidence": 0.90,
      "examples": ["範例留言1"],
      "reason": "簡短說明"
    }
  ]
}

注意事項：
1. **只回報信心分數 >= 0.9** 的詞彙
2. 每個詞彙**必須提供 2-3 個範例留言**
3. 確保 target（替換後的詞）是正確且完整的標準詞彙
4. 寧可少報，不要誤報',
    false
),
(
    'Lenient Mode',
    '寬鬆模式 - 發現更多候選詞彙，適合探索性分析',
    '你是一個專門分析網路直播留言的助手。請以**寬鬆標準**分析以下留言，盡可能發現所有潛在的新詞彙：

1. **錯別字和變體詞彙**：包括可能的錯字、諧音、變體
2. **特殊詞彙**：包括新出現的梗、角色名、網路用語、流行語

**現有的字典（請避免重複建議這些詞）**：
- 已存在的替換詞彙範例：{{replace_examples}}...（共 {{replace_count}} 個）
- 已存在的特殊詞彙範例：{{special_examples}}...（共 {{special_count}} 個）

**寬鬆規則**：
1. 不要建議已存在的詞彙
2. 可以建議**信心分數 >= 0.6** 的詞彙
3. 包括可能的新詞彙和潛在的梗

**待分析的留言**：
{{messages_text}}

請以 JSON 格式回應，格式如下：
{
  "replace_words": [
    {
      "source": "錯字或變體",
      "target": "標準詞彙",
      "confidence": 0.75,
      "examples": ["範例留言1"],
      "reason": "簡短說明"
    }
  ],
  "special_words": [
    {
      "word": "特殊詞彙",
      "type": "meme|typo|variant|character|slang",
      "confidence": 0.70,
      "examples": ["範例留言1"],
      "reason": "簡短說明"
    }
  ]
}

注意事項：
1. 可以回報**信心分數 >= 0.6** 的詞彙
2. 每個詞彙至少提供 1 個範例留言
3. 盡可能發現所有潛在的新詞彙',
    false
)
ON CONFLICT (name) DO NOTHING;

-- 更新 etl_settings，新增範本選擇設定
INSERT INTO etl_settings (key, value, value_type, description, category, is_sensitive) VALUES
('ACTIVE_PROMPT_TEMPLATE_ID', '1', 'integer', '啟用的提示詞範本 ID', 'ai', false)
ON CONFLICT (key) DO NOTHING;

-- 添加註釋
COMMENT ON TABLE prompt_templates IS 'AI 提示詞範本庫';
COMMENT ON COLUMN prompt_templates.name IS '範本名稱（唯一）';
COMMENT ON COLUMN prompt_templates.description IS '範本描述';
COMMENT ON COLUMN prompt_templates.template IS '提示詞內容（支援變數：{messages_text}, {replace_examples}, {replace_count}, {special_examples}, {special_count}）';
COMMENT ON COLUMN prompt_templates.is_active IS '是否為啟用的範本（同時只能有一個啟用）';
