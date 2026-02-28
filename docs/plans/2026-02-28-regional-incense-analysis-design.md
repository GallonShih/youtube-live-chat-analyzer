# 地區上香分析腳本 Design

**Date**: 2026-02-28
**Status**: Approved
**Location**: `analysis/main.py`

## 目標

從 `chat_messages` 資料表中，分析「[地區]代表上香」訊息的地區分布，輸出地區排名 JSON。

## 資料現況

- DB 中符合 `[漢字]代表上香` 的訊息約 **14,391** 筆
- Regex：`([\u4e00-\u9fff]{2,6})代表上香`
- 前幾名候選詞：傳說(1353)、台中(649)、高雄(462)、台北(396)...
- 雜訊例子：「傳說」（遊戲名）、「格力變頻空調」（品牌）、「全體小編」

## 架構：兩階段方案（方案 A）

```
Phase 1: python main.py extract
    → candidates.json        # 乾淨清單，給 AI 分類
    → candidates_detail.json # 含 message_ids 對照表

Phase 2: 人工 AI 分類（使用者複製清單給 AI）
    → approved_regions.json  # AI 回傳的地區清單

Phase 3: python main.py analyze
    → result.json            # 最終分析結果
    → result_detail.json     # 含 message_ids 對照表
```

## 指令規格

### `extract`

從 DB 全表掃描，提取所有符合 regex 的候選詞。

**輸出 `candidates.json`**：
```json
{
  "total_messages": 14391,
  "unique_candidates": 342,
  "candidates": [
    {"word": "台中", "count": 649},
    {"word": "傳說", "count": 1353}
  ]
}
```

**輸出 `candidates_detail.json`**：
```json
{
  "candidates": [
    {"word": "台中", "count": 649, "message_ids": ["abc123", ...]}
  ]
}
```

### `analyze`

讀取 `approved_regions.json`，重新查詢 DB，計算分布。

**輸入 `approved_regions.json`**：
```json
{
  "regions": ["台中", "高雄", "台北", ...]
}
```

**輸出 `result.json`**：
```json
{
  "generated_at": "2026-02-28T12:00:00",
  "total_incense_messages": 14391,
  "region_count": 87,
  "results": [
    {"region": "台中", "count": 649, "percentage": 4.51}
  ]
}
```

**輸出 `result_detail.json`**：
```json
{
  "results": [
    {"region": "台中", "count": 649, "percentage": 4.51, "message_ids": ["abc123", ...]}
  ]
}
```

## AI 分類 Prompt（Phase 2 參考）

> 以下是從直播聊天室提取的詞彙，請判斷哪些是**真實地區名稱**（台灣縣市、行政區、國家、城市），哪些不是，輸出 JSON 格式：`{"regions": ["台中", "高雄", ...], "non_regions": ["傳說", "格力變頻空調", ...]}`

## 檔案結構

```
analysis/
├── main.py                  # 主腳本（修改）
├── candidates.json          # extract 輸出（乾淨）
├── candidates_detail.json   # extract 輸出（含 message_ids）
├── approved_regions.json    # 使用者貼入的 AI 分類結果
├── result.json              # analyze 輸出（乾淨）
└── result_detail.json       # analyze 輸出（含 message_ids）
```

## 範圍限制

- 只擷取格式為 `[漢字]代表上香` 的訊息
- 不含「有人要幫刈包上香嗎」或純「上香」等其他上香訊息
- DB 連線透過根目錄 `.env` 讀取
