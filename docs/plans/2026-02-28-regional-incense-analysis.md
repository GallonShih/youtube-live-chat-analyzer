# Regional Incense Analysis Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 新增 `analysis/main.py` 的 `extract` 和 `analyze` 兩個子指令，分析直播聊天中「[地區]代表上香」訊息的地區分布。

**Architecture:** 兩階段流程 — Phase 1 用 regex 提取候選地區詞存成 JSON，使用者人工透過 AI 分類後，Phase 2 以核准清單重新查詢 DB 產出最終分析結果。主檔（clean）與對照檔（含 message_ids）分開儲存。

**Tech Stack:** Python 3.12, psycopg2-binary, 根目錄 `.env` 讀取 DB 連線參數，不需額外安裝套件。

---

## 前置知識

### DB 連線
根目錄 `.env` 有以下變數：
```
POSTGRES_DB=hermes
POSTGRES_USER=hermes
POSTGRES_PASSWORD=hermes
POSTGRES_PORT=5432
# POSTGRES_HOST 預設 localhost
```

從 `analysis/` 目錄讀取 `.env` 需往上一層：`../.env`

### Regex 模式
```python
import re
PATTERN = re.compile(r'([\u4e00-\u9fff]{2,6})代表上香')
```

### 輸出檔案位置
所有 JSON 輸出在 `analysis/` 目錄下（腳本執行位置）

---

## Task 1：建立 DB 連線與 .env 讀取工具

**Files:**
- Modify: `analysis/main.py`

**Step 1: 替換 main.py 內容，加入 DB 連線與 .env 讀取**

```python
import argparse
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

import psycopg2


# ── 設定 ────────────────────────────────────────────────────────────────────

PATTERN = re.compile(r'([\u4e00-\u9fff]{2,6})代表上香')
ENV_PATH = Path(__file__).parent.parent / '.env'


def load_env(path: Path) -> dict:
    """從 .env 檔讀取 key=value，忽略註解與空行。"""
    env = {}
    if not path.exists():
        return env
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, _, v = line.partition('=')
        env[k.strip()] = v.strip()
    return env


def get_connection():
    env = load_env(ENV_PATH)
    return psycopg2.connect(
        host=env.get('POSTGRES_HOST', 'localhost'),
        port=int(env.get('POSTGRES_PORT', 5432)),
        dbname=env.get('POSTGRES_DB', 'hermes'),
        user=env.get('POSTGRES_USER', 'hermes'),
        password=env.get('POSTGRES_PASSWORD', 'hermes'),
    )


# ── 主程式入口 ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='地區上香分析工具')
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('extract', help='提取候選地區詞')
    p_analyze = sub.add_parser('analyze', help='分析已核准地區分布')
    p_analyze.add_argument(
        '--approved',
        default='approved_regions.json',
        help='核准地區 JSON 檔路徑（預設: approved_regions.json）',
    )
    args = parser.parse_args()

    if args.command == 'extract':
        cmd_extract()
    elif args.command == 'analyze':
        cmd_analyze(args.approved)


if __name__ == '__main__':
    main()
```

**Step 2: 驗證指令結構可執行**

```bash
cd /Users/gallon/Documents/hermes/analysis
uv run python main.py --help
uv run python main.py extract --help
uv run python main.py analyze --help
```

Expected: 顯示說明文字，無錯誤。

**Step 3: Commit**

```bash
git add analysis/main.py
git commit -m "feat(analysis): add CLI skeleton with DB connection helper"
```

---

## Task 2：實作 `extract` 指令

**Files:**
- Modify: `analysis/main.py`（在 `main()` 前新增 `cmd_extract` 函數）

**Step 1: 新增 `cmd_extract` 函數**

在 `main()` 函數前插入：

```python
def cmd_extract():
    """
    從 chat_messages 提取所有符合 [漢字]代表上香 的候選地區詞。
    輸出：
      candidates.json        — 乾淨清單（word + count），按 count 降冪
      candidates_detail.json — 含 message_ids 對照表
    """
    print('連線至 DB ...')
    conn = get_connection()
    cur = conn.cursor()

    print('查詢 chat_messages ...')
    cur.execute("SELECT message_id, message FROM chat_messages")

    # {word: {"count": int, "message_ids": list}}
    word_map: dict[str, dict] = {}

    for message_id, message in cur:
        for match in PATTERN.finditer(message):
            word = match.group(1)
            if word not in word_map:
                word_map[word] = {'count': 0, 'message_ids': []}
            word_map[word]['count'] += 1
            word_map[word]['message_ids'].append(message_id)

    cur.close()
    conn.close()

    # 按 count 降冪排序
    sorted_words = sorted(word_map.items(), key=lambda x: x[1]['count'], reverse=True)
    total_messages = sum(v['count'] for v in word_map.values())

    # candidates.json — 乾淨
    candidates_clean = {
        'total_messages': total_messages,
        'unique_candidates': len(word_map),
        'candidates': [
            {'word': w, 'count': d['count']}
            for w, d in sorted_words
        ],
    }
    out_clean = Path('candidates.json')
    out_clean.write_text(json.dumps(candidates_clean, ensure_ascii=False, indent=2))
    print(f'寫入 {out_clean}（{len(word_map)} 個候選詞）')

    # candidates_detail.json — 含 message_ids
    candidates_detail = {
        'total_messages': total_messages,
        'unique_candidates': len(word_map),
        'candidates': [
            {'word': w, 'count': d['count'], 'message_ids': d['message_ids']}
            for w, d in sorted_words
        ],
    }
    out_detail = Path('candidates_detail.json')
    out_detail.write_text(json.dumps(candidates_detail, ensure_ascii=False, indent=2))
    print(f'寫入 {out_detail}')

    print('\n完成！請將 candidates.json 中的詞清單貼給 AI 分類，')
    print('再將結果存為 approved_regions.json 後執行 analyze 指令。')
```

**Step 2: 執行 extract 確認輸出**

```bash
cd /Users/gallon/Documents/hermes/analysis
uv run python main.py extract
```

Expected：
```
連線至 DB ...
查詢 chat_messages ...
寫入 candidates.json（3XX 個候選詞）
寫入 candidates_detail.json
完成！請將 candidates.json 中的詞清單貼給 AI 分類，
再將結果存為 approved_regions.json 後執行 analyze 指令。
```

**Step 3: 檢查輸出格式**

```bash
cd /Users/gallon/Documents/hermes/analysis
head -30 candidates.json
```

Expected：JSON 格式，`candidates` 陣列按 count 降冪，第一筆應為「傳說」或出現次數最高者。

```bash
python -c "
import json
d = json.load(open('candidates_detail.json'))
first = d['candidates'][0]
print(first['word'], first['count'], 'message_ids 數量:', len(first['message_ids']))
"
```

Expected：message_ids 數量與 count 相同。

**Step 4: Commit**

```bash
git add analysis/main.py
git commit -m "feat(analysis): implement extract command"
```

---

## Task 3：實作 `analyze` 指令

**Files:**
- Modify: `analysis/main.py`（在 `cmd_extract` 後新增 `cmd_analyze` 函數）

**Step 1: 新增 `cmd_analyze` 函數**

在 `cmd_extract` 函數後插入：

```python
def cmd_analyze(approved_path: str):
    """
    讀取 approved_regions.json，重新查詢 DB，輸出地區分布。
    輸出：
      result.json        — 乾淨結果（region + count + percentage）
      result_detail.json — 含 message_ids 對照表
    """
    approved_file = Path(approved_path)
    if not approved_file.exists():
        print(f'錯誤：找不到 {approved_path}', file=sys.stderr)
        print('請先執行 extract 指令並完成 AI 分類。', file=sys.stderr)
        sys.exit(1)

    approved_data = json.loads(approved_file.read_text())
    approved_set = set(approved_data.get('regions', []))
    if not approved_set:
        print('錯誤：approved_regions.json 中 regions 為空。', file=sys.stderr)
        sys.exit(1)

    print(f'載入 {len(approved_set)} 個核准地區')
    print('連線至 DB ...')
    conn = get_connection()
    cur = conn.cursor()

    print('查詢 chat_messages ...')
    cur.execute("SELECT message_id, message FROM chat_messages")

    # 全部上香訊息數（分母）
    total_incense = 0
    # {region: {"count": int, "message_ids": list}}
    region_map: dict[str, dict] = {}

    for message_id, message in cur:
        for match in PATTERN.finditer(message):
            total_incense += 1
            word = match.group(1)
            if word not in approved_set:
                continue
            if word not in region_map:
                region_map[word] = {'count': 0, 'message_ids': []}
            region_map[word]['count'] += 1
            region_map[word]['message_ids'].append(message_id)

    cur.close()
    conn.close()

    sorted_regions = sorted(region_map.items(), key=lambda x: x[1]['count'], reverse=True)
    generated_at = datetime.now().isoformat(timespec='seconds')

    def pct(count: int) -> float:
        if total_incense == 0:
            return 0.0
        return round(count / total_incense * 100, 2)

    # result.json — 乾淨
    result_clean = {
        'generated_at': generated_at,
        'total_incense_messages': total_incense,
        'region_count': len(region_map),
        'results': [
            {'region': r, 'count': d['count'], 'percentage': pct(d['count'])}
            for r, d in sorted_regions
        ],
    }
    out_clean = Path('result.json')
    out_clean.write_text(json.dumps(result_clean, ensure_ascii=False, indent=2))
    print(f'寫入 {out_clean}（{len(region_map)} 個地區）')

    # result_detail.json — 含 message_ids
    result_detail = {
        'generated_at': generated_at,
        'total_incense_messages': total_incense,
        'region_count': len(region_map),
        'results': [
            {
                'region': r,
                'count': d['count'],
                'percentage': pct(d['count']),
                'message_ids': d['message_ids'],
            }
            for r, d in sorted_regions
        ],
    }
    out_detail = Path('result_detail.json')
    out_detail.write_text(json.dumps(result_detail, ensure_ascii=False, indent=2))
    print(f'寫入 {out_detail}')

    print('\n=== 地區分布 TOP 10 ===')
    for entry in result_clean['results'][:10]:
        print(f"  {entry['region']:6s}  {entry['count']:5d} 次  ({entry['percentage']}%)")
```

**Step 2: 建立測試用 approved_regions.json**

```bash
cd /Users/gallon/Documents/hermes/analysis
cat > approved_regions.json << 'EOF'
{
  "regions": ["台中", "高雄", "台北", "台南", "桃園", "新竹", "彰化", "嘉義", "三重", "板橋"]
}
EOF
```

**Step 3: 執行 analyze 確認輸出**

```bash
cd /Users/gallon/Documents/hermes/analysis
uv run python main.py analyze
```

Expected：
```
載入 10 個核准地區
連線至 DB ...
查詢 chat_messages ...
寫入 result.json（10 個地區）
寫入 result_detail.json

=== 地區分布 TOP 10 ===
  台中    649 次  (4.51%)
  高雄    462 次  (3.21%)
  ...
```

**Step 4: 驗證 result_detail.json message_ids 對應正確**

```bash
cd /Users/gallon/Documents/hermes/analysis
python -c "
import json
d = json.load(open('result_detail.json'))
first = d['results'][0]
print('地區:', first['region'])
print('count:', first['count'])
print('message_ids 數量:', len(first['message_ids']))
print('前 3 個 message_id:', first['message_ids'][:3])
assert first['count'] == len(first['message_ids']), 'count 與 message_ids 數量不符！'
print('驗證通過 ✓')
"
```

Expected：`驗證通過 ✓`，count 與 message_ids 數量相符。

**Step 5: Commit**

```bash
git add analysis/main.py
git commit -m "feat(analysis): implement analyze command with region distribution output"
```

---

## Task 4：加入 .gitignore 排除輸出檔

**Files:**
- Modify: `analysis/.gitignore`（若不存在則建立）

**Step 1: 建立 .gitignore**

```bash
cat > /Users/gallon/Documents/hermes/analysis/.gitignore << 'EOF'
candidates.json
candidates_detail.json
approved_regions.json
result.json
result_detail.json
__pycache__/
*.pyc
EOF
```

**Step 2: Commit**

```bash
git add analysis/.gitignore
git commit -m "chore(analysis): gitignore analysis output files"
```

---

## 完整使用流程（供參考）

```bash
cd /Users/gallon/Documents/hermes/analysis

# 1. 提取候選詞
uv run python main.py extract
# → 產生 candidates.json, candidates_detail.json

# 2. 把 candidates.json 的詞清單貼給 AI，指示：
#    「以下詞彙哪些是真實地區名稱？輸出 JSON：{"regions": [...], "non_regions": [...]}」
#    將 AI 回傳的 regions 存成 approved_regions.json

# 3. 正式分析
uv run python main.py analyze
# → 產生 result.json, result_detail.json
# → Terminal 顯示 TOP 10
```
