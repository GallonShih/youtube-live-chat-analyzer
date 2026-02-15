# Case-Insensitive Text Processing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the entire text processing pipeline case-insensitive by normalizing all text to lowercase, eliminating the need for case-variant dictionary entries.

**Architecture:** Add a single `.lower()` call early in `process_message()` (after emoji extraction, before everything else). All dictionaries (replace_words, special_words, stopwords) are lowercased at load time. Downstream consumers (wordcloud, playback, validation, word discovery) already work with lowered tokens — the only changes needed are to lowercase their own lookup keys. Existing processed data gets a one-time migration.

**Tech Stack:** Python, FastAPI, SQLAlchemy, PostgreSQL, jieba, pytest

---

## Task 1: Add unit tests for case-insensitive text processing

**Files:**
- Create: `dashboard/backend/tests/test_text_processor.py`

**Step 1: Write the failing tests**

```python
"""Tests for text_processor case-insensitive processing."""
import pytest
from unittest.mock import patch, MagicMock
from app.etl.processors.text_processor import (
    apply_replace_words,
    tokenize_text,
    process_message,
    normalize_text,
    load_stopwords,
    clear_stopwords_cache,
)


class TestApplyReplaceWords:
    def test_case_insensitive_replace(self):
        """Replace words should match regardless of case."""
        replace_dict = {"die": "死"}
        assert apply_replace_words("Die in chat", replace_dict) == "死 in chat"
        assert apply_replace_words("DIE in chat", replace_dict) == "死 in chat"
        assert apply_replace_words("die in chat", replace_dict) == "死 in chat"

    def test_mixed_case_chinese_english(self):
        """Mixed Chinese-English words should match case-insensitively."""
        replace_dict = {"竹c辣寶貝": "竹息辣寶貝"}
        assert apply_replace_words("竹C辣寶貝", replace_dict) == "竹息辣寶貝"
        assert apply_replace_words("竹c辣寶貝", replace_dict) == "竹息辣寶貝"

    def test_longer_match_takes_priority(self):
        """Longer matches should still be applied first."""
        replace_dict = {"ab": "X", "abc": "Y"}
        assert apply_replace_words("abc", replace_dict) == "Y"

    def test_empty_dict(self):
        """Empty dict should return original text (lowered)."""
        assert apply_replace_words("Hello World", {}) == "Hello World"


class TestTokenizeText:
    def test_tokens_are_lowercase(self):
        """All tokens should be lowercased."""
        tokens = tokenize_text("Hello WORLD", [], None)
        for t in tokens:
            assert t == t.lower(), f"Token '{t}' is not lowercase"

    def test_special_words_lowered(self):
        """Special words should work regardless of input case."""
        tokens = tokenize_text("i love hololive", ["hololive"], None)
        assert "hololive" in tokens


class TestProcessMessage:
    def test_full_pipeline_case_insensitive(self):
        """Full pipeline should produce lowercase tokens with case-insensitive replacement."""
        replace_dict = {"kusa": "草"}
        special_words = ["hololive"]

        processed, tokens, emojis, emotes = process_message(
            message="KUSA hololive",
            emotes_json=None,
            replace_dict=replace_dict,
            special_words=special_words,
        )

        assert "草" in processed
        assert "hololive" in tokens

    def test_normalize_before_replace(self):
        """Fullwidth chars should be normalized before replacement."""
        # Ｋ is fullwidth K (U+FF2B)
        replace_dict = {"kusa": "草"}
        processed, tokens, _, _ = process_message(
            message="\uff2busa test",
            emotes_json=None,
            replace_dict=replace_dict,
            special_words=[],
        )
        assert "草" in processed
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/gallon/Documents/hermes && docker compose exec dashboard-backend python -m pytest tests/test_text_processor.py -v --no-cov`
Expected: FAIL — `apply_replace_words` is currently case-sensitive, tokens are not lowered.

**Step 3: Skip to Task 2 for implementation**

---

## Task 2: Make text_processor case-insensitive

**Files:**
- Modify: `dashboard/backend/app/etl/processors/text_processor.py`

**Step 1: Modify `apply_replace_words` to do case-insensitive matching**

Change the function (lines 129-146) to lowercase both the text and the dict keys before matching:

```python
def apply_replace_words(text: str, replace_dict: Dict[str, str]) -> str:
    """
    套用替換詞彙（大小寫不敏感）

    Args:
        text: 原始文字（會先轉為小寫再比對）
        replace_dict: 替換詞彙字典 {source: target}，key 應為小寫

    Returns:
        替換後的文字
    """
    result = text.lower()
    # 按照 source 長度降序排列，優先替換較長的詞
    sorted_sources = sorted(replace_dict.keys(), key=len, reverse=True)
    for source in sorted_sources:
        target = replace_dict[source]
        result = result.replace(source, target)
    return result
```

**Step 2: Modify `tokenize_text` to lowercase output tokens**

Change the function (lines 221-251) — add `.lower()` to tokens after jieba:

```python
def tokenize_text(
    text: str,
    special_words: List[str],
    stopwords: Optional[Set[str]] = None
) -> List[str]:
    # 加入特殊詞彙到 jieba 詞典
    for word in special_words:
        jieba.add_word(word)

    # 進行斷詞
    tokens = list(jieba.cut(text))

    # 過濾空白和空字串，統一轉小寫
    tokens = [t.strip().lower() for t in tokens if t.strip()]

    # 過濾停用詞
    if stopwords:
        tokens = [t for t in tokens if t not in stopwords]

    return tokens
```

**Step 3: Modify `process_message` to normalize BEFORE replace**

Change the processing order in `process_message` (lines 254-290). Move `normalize_text` to step 2, before `apply_replace_words`:

```python
def process_message(
    message: str,
    emotes_json: Optional[List[Dict[str, Any]]],
    replace_dict: Dict[str, str],
    special_words: List[str]
) -> Tuple[str, List[str], List[str], List[Dict[str, str]]]:
    # 1. 提取 emoji 和 emotes（在任何處理之前）
    unicode_emojis = extract_unicode_emojis(message)
    youtube_emotes = extract_youtube_emotes(emotes_json)

    # 2. 正規化文字（全形轉半形、清理空白）— 移到 replace 之前
    processed = normalize_text(message)

    # 3. 套用替換詞彙（內部會 .lower()）
    processed = apply_replace_words(processed, replace_dict)

    # 4. 移除 emoji 和 YouTube emotes
    processed = remove_emojis(processed)
    processed = remove_youtube_emotes(processed, emotes_json)

    # 5. 清理多餘空白（normalize 的部分功能）
    processed = re.sub(r'\s+', ' ', processed).strip()

    # 6. 載入停用詞並斷詞
    stopwords = load_stopwords()
    tokens = tokenize_text(processed, special_words, stopwords)

    return processed, tokens, unicode_emojis, youtube_emotes
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/gallon/Documents/hermes && docker compose exec dashboard-backend python -m pytest tests/test_text_processor.py -v --no-cov`
Expected: All PASS

**Step 5: Commit**

```bash
git add dashboard/backend/tests/test_text_processor.py dashboard/backend/app/etl/processors/text_processor.py
git commit -m "feat: make text processor case-insensitive

Lowercase all text before replacement matching and lowercase all
output tokens. Normalize fullwidth chars before replacement so
dictionary entries don't need fullwidth variants."
```

---

## Task 3: Lowercase dictionaries at load time in ChatProcessor

**Files:**
- Modify: `dashboard/backend/app/etl/processors/chat_processor.py` (lines 212-233)

**Step 1: Write the failing test**

Add to `dashboard/backend/tests/test_chat_processor.py`:

```python
def test_chat_processor_case_insensitive(setup_integration_data):
    """Verify ChatProcessor produces lowercase tokens regardless of input case."""
    engine = create_engine(TEST_DB_URL)

    # Insert a message with mixed case
    now = datetime.datetime.now(datetime.timezone.utc)
    msg_time = now - datetime.timedelta(minutes=30)
    timestamp = int(msg_time.timestamp() * 1000000)

    with engine.connect() as conn:
        conn.execute(
            text("""
                INSERT INTO chat_messages
                (message_id, live_stream_id, message, timestamp, published_at, author_name, author_id, message_type)
                VALUES (:mid, :sid, :msg, :ts, :pub_at, :auth_n, :auth_id, :type)
            """),
            {
                "mid": "msg_case_test",
                "sid": "stream_1",
                "msg": "KUSA Hololive TEST",
                "ts": timestamp,
                "pub_at": msg_time,
                "auth_n": "User2",
                "auth_id": "user_2",
                "type": "text_message",
            },
        )
        conn.commit()

    processor = ChatProcessor(database_url=TEST_DB_URL)
    result = processor.run()
    assert result["status"] == "completed"

    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT tokens FROM processed_chat_messages WHERE message_id = 'msg_case_test'")
        ).fetchone()
        assert row is not None
        tokens = row[0]
        for t in tokens:
            assert t == t.lower(), f"Token '{t}' is not lowercase"
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/gallon/Documents/hermes && docker compose exec dashboard-backend python -m pytest tests/test_chat_processor.py::test_chat_processor_case_insensitive -v --no-cov`
Expected: FAIL — tokens contain uppercase chars.

**Step 3: Modify `_load_dictionaries` to lowercase dict keys/values**

In `chat_processor.py`, change `_load_dictionaries` (lines 212-233):

```python
def _load_dictionaries(self) -> tuple:
    engine = self.get_engine()

    with engine.connect() as conn:
        # 載入替換詞彙（統一小寫）
        result = conn.execute(text("SELECT source_word, target_word FROM replace_words;"))
        replace_dict = {row[0].lower(): row[1].lower() for row in result}

        # 載入特殊詞彙（統一小寫）
        result = conn.execute(text("SELECT word FROM special_words;"))
        special_words = list({row[0].lower() for row in result})

    logger.info(f"Loaded {len(replace_dict)} replace words (lowercased)")
    logger.info(f"Loaded {len(special_words)} special words (lowercased)")

    return replace_dict, special_words
```

**Step 4: Run tests**

Run: `cd /Users/gallon/Documents/hermes && docker compose exec dashboard-backend python -m pytest tests/test_chat_processor.py -v --no-cov`
Expected: All PASS

**Step 5: Commit**

```bash
git add dashboard/backend/app/etl/processors/chat_processor.py dashboard/backend/tests/test_chat_processor.py
git commit -m "feat: lowercase dictionaries at load time in ChatProcessor"
```

---

## Task 4: Lowercase dictionaries at import time in DictImporter

**Files:**
- Modify: `dashboard/backend/app/etl/processors/dict_importer.py`
- Create: `dashboard/backend/tests/test_dict_importer.py`

**Step 1: Write the failing test**

```python
"""Tests for DictImporter case-insensitive import."""
import pytest
import json
import os
from pathlib import Path
from unittest.mock import patch
from sqlalchemy import create_engine, text
from app.etl.processors.dict_importer import DictImporter

TEST_DB_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://hermes:hermes@localhost:5432/hermes_test",
)


@pytest.fixture
def temp_dicts(tmp_path):
    """Create temp dict files with mixed-case entries."""
    (tmp_path / "replace_words.json").write_text(
        json.dumps({"replace_words": {"Die": "die", "KUSA": "草"}}),
        encoding="utf-8",
    )
    (tmp_path / "special_words.json").write_text(
        json.dumps({"special_words": ["HoloLive", "hololive", "HOLOLIVE"]}),
        encoding="utf-8",
    )
    (tmp_path / "meaningless_words.json").write_text(
        json.dumps({"meaningless_words": ["的", "了"]}),
        encoding="utf-8",
    )
    return tmp_path


def test_import_lowercases_replace_words(setup_database, temp_dicts):
    engine = create_engine(TEST_DB_URL)
    with engine.connect() as conn:
        conn.execute(text("TRUNCATE TABLE replace_words CASCADE;"))
        conn.execute(text("TRUNCATE TABLE special_words CASCADE;"))
        conn.execute(text("TRUNCATE TABLE meaningless_words CASCADE;"))
        conn.commit()

    importer = DictImporter(database_url=TEST_DB_URL, text_analysis_dir=temp_dicts)
    result = importer.run()
    assert result["status"] == "completed"

    with engine.connect() as conn:
        rows = conn.execute(text("SELECT source_word, target_word FROM replace_words")).fetchall()
        for source, target in rows:
            assert source == source.lower(), f"source '{source}' not lowercase"
            assert target == target.lower(), f"target '{target}' not lowercase"


def test_import_deduplicates_special_words(setup_database, temp_dicts):
    engine = create_engine(TEST_DB_URL)
    with engine.connect() as conn:
        conn.execute(text("TRUNCATE TABLE special_words CASCADE;"))
        conn.execute(text("TRUNCATE TABLE meaningless_words CASCADE;"))
        conn.execute(text("TRUNCATE TABLE replace_words CASCADE;"))
        conn.commit()

    importer = DictImporter(database_url=TEST_DB_URL, text_analysis_dir=temp_dicts)
    importer.run()

    with engine.connect() as conn:
        rows = conn.execute(text("SELECT word FROM special_words")).fetchall()
        words = [r[0] for r in rows]
        # "HoloLive", "hololive", "HOLOLIVE" should all collapse to one "hololive"
        assert len(words) == 1
        assert words[0] == "hololive"
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/gallon/Documents/hermes && docker compose exec dashboard-backend python -m pytest tests/test_dict_importer.py -v --no-cov`
Expected: FAIL — values stored as-is with original casing.

**Step 3: Modify `_import_replace_words` and `_import_special_words`**

In `dict_importer.py`, change `_import_replace_words` (line 235):

```python
        with engine.connect() as conn:
            for source, target in replace_map.items():
                conn.execute(
                    text("""
                        INSERT INTO replace_words (source_word, target_word)
                        VALUES (:source, :target)
                        ON CONFLICT (source_word) DO UPDATE SET
                            target_word = EXCLUDED.target_word,
                            updated_at = NOW();
                    """),
                    {"source": source.lower(), "target": target.lower()}
                )
            conn.commit()
```

Change `_import_special_words` (line 275):

```python
        with engine.connect() as conn:
            for word in words:
                conn.execute(
                    text("""
                        INSERT INTO special_words (word)
                        VALUES (:word)
                        ON CONFLICT (word) DO NOTHING;
                    """),
                    {"word": word.lower()}
                )
            conn.commit()
```

**Step 4: Run tests**

Run: `cd /Users/gallon/Documents/hermes && docker compose exec dashboard-backend python -m pytest tests/test_dict_importer.py -v --no-cov`
Expected: All PASS

**Step 5: Commit**

```bash
git add dashboard/backend/app/etl/processors/dict_importer.py dashboard/backend/tests/test_dict_importer.py
git commit -m "feat: lowercase dictionary entries at import time in DictImporter"
```

---

## Task 5: Lowercase post-tokenization lookups in wordcloud routers

**Files:**
- Modify: `dashboard/backend/app/routers/wordcloud.py`
- Modify: `dashboard/backend/app/routers/playback_wordcloud.py`

Since tokens are now always lowercase, the post-tokenization replacement/exclusion dictionaries must also use lowercase keys. These dictionaries come from `ReplacementWordlist` and `ExclusionWordlist` DB tables, and from user query params.

**Step 1: Write the failing test**

Add to `dashboard/backend/tests/test_wordcloud.py` (or create if not exists):

```python
def test_wordcloud_exclude_case_insensitive(client, db, sample_processed_messages):
    """Excluding 'Hello' should also exclude 'hello' tokens."""
    response = client.get(
        "/api/wordcloud/word-frequency",
        params={"exclude_words": "Hello"}
    )
    assert response.status_code == 200
    words = [w["word"] for w in response.json()["words"]]
    assert "hello" not in words
```

**Step 2: Run test to see it fail**

Expected: FAIL — `"Hello"` in excluded set doesn't match `"hello"` tokens.

**Step 3: Modify `wordcloud.py`**

In `wordcloud.py`, lowercase user exclusions (line 114) and replacement dict keys:

```python
        # 解析用戶指定的排除詞
        user_excluded = set()
        if exclude_words:
            user_excluded = set(w.strip().lower() for w in exclude_words.split(",") if w.strip())
```

In `build_replace_dict` (line 27-37), lowercase keys:

```python
def build_replace_dict(replacements: List[Dict]) -> Dict[str, str]:
    if not replacements:
        return {}
    sorted_replacements = sorted(replacements, key=lambda r: len(r.get("source", "")), reverse=True)
    return {r["source"].lower(): r["target"].lower() for r in sorted_replacements if r.get("source")}
```

**Step 4: Apply same changes to `playback_wordcloud.py`**

Same two changes:
1. `build_replace_dict` — lowercase keys/values (line 42-50)
2. User exclusion words — `.lower()` (line 117)
3. ExclusionWordlist words — `.lower()` when loading (line 126):

```python
            if wordlist and wordlist.words:
                excluded |= set(w.lower() for w in wordlist.words)
```

**Step 5: Run all wordcloud tests**

Run: `cd /Users/gallon/Documents/hermes && docker compose exec dashboard-backend python -m pytest tests/ -k "wordcloud" -v --no-cov`
Expected: All PASS

**Step 6: Commit**

```bash
git add dashboard/backend/app/routers/wordcloud.py dashboard/backend/app/routers/playback_wordcloud.py
git commit -m "feat: lowercase post-tokenization lookups in wordcloud routers"
```

---

## Task 6: Case-insensitive validation service

**Files:**
- Modify: `dashboard/backend/app/services/validation.py`

**Step 1: Write the failing test**

Add to `dashboard/backend/tests/test_validation.py`:

```python
    def test_source_in_special_words_case_insensitive(self, db):
        """Validation should detect conflict regardless of case."""
        db.add(SpecialWord(word="hololive"))
        db.flush()

        result = validate_replace_word(db, "HoloLive", "目標")
        assert result["valid"] == False
        assert any(c["type"] == "source_in_special_words" for c in result["conflicts"])
```

Add to `TestValidateSpecialWord`:

```python
    def test_word_in_source_words_case_insensitive(self, db):
        """Validation should detect conflict regardless of case."""
        db.add(ReplaceWord(source_word="hololive", target_word="正字"))
        db.flush()

        result = validate_special_word(db, "HoloLive")
        assert result["valid"] == False
        assert any(c["type"] == "word_in_source_words" for c in result["conflicts"])
```

**Step 2: Run to verify failure**

Run: `cd /Users/gallon/Documents/hermes && docker compose exec dashboard-backend python -m pytest tests/test_validation.py -v --no-cov`
Expected: FAIL — exact match `==` doesn't match different cases.

**Step 3: Change all exact matches to use `func.lower()`**

In `validation.py`, replace all `==` comparisons with case-insensitive versions:

```python
from sqlalchemy import func

# In validate_replace_word:
    special = db.query(SpecialWord).filter(
        func.lower(SpecialWord.word) == source_word.lower()
    ).first()

    existing_target = db.query(ReplaceWord).filter(
        func.lower(ReplaceWord.target_word) == source_word.lower()
    ).first()

    existing_source = db.query(ReplaceWord).filter(
        func.lower(ReplaceWord.source_word) == source_word.lower()
    ).first()

# Also lowercase the comparison for same_word check:
    if source_word.lower() == target_word.lower():

# In PendingReplaceWord check:
    query = db.query(PendingReplaceWord).filter(
        func.lower(PendingReplaceWord.source_word) == source_word.lower(),
        func.lower(PendingReplaceWord.target_word) == target_word.lower(),
        PendingReplaceWord.status == 'pending'
    )

# In validate_special_word:
    source = db.query(ReplaceWord).filter(
        func.lower(ReplaceWord.source_word) == word.lower()
    ).first()

    existing = db.query(SpecialWord).filter(
        func.lower(SpecialWord.word) == word.lower()
    ).first()

    query = db.query(PendingSpecialWord).filter(
        func.lower(PendingSpecialWord.word) == word.lower(),
        PendingSpecialWord.status == 'pending'
    )
```

**Step 4: Run tests**

Run: `cd /Users/gallon/Documents/hermes && docker compose exec dashboard-backend python -m pytest tests/test_validation.py -v --no-cov`
Expected: All PASS

**Step 5: Commit**

```bash
git add dashboard/backend/app/services/validation.py dashboard/backend/tests/test_validation.py
git commit -m "feat: case-insensitive validation for replace/special words"
```

---

## Task 7: Case-insensitive admin_words router

**Files:**
- Modify: `dashboard/backend/app/routers/admin_words.py`

**Step 1: Identify exact-match lines to change**

There are two key spots:

1. **Approve replace word** (line 215): `ReplaceWord.source_word == pending.source_word`
2. **Manual add replace word** (line 734): `ReplaceWord.source_word == source_word`

Also, when storing new words, force lowercase:

3. **Approve** (line 223-225): `source_word=pending.source_word` → `.lower()`
4. **Manual add** (line 746-748): `source_word=source_word` → `.lower()`

**Step 2: Modify admin_words.py**

At the approve endpoint (~line 215):
```python
        existing = db.query(ReplaceWord).filter(
            func.lower(ReplaceWord.source_word) == pending.source_word.lower()
        ).first()

        if existing:
            existing.target_word = pending.target_word.lower()
            existing.updated_at = func.now()
        else:
            new_word = ReplaceWord(
                source_word=pending.source_word.lower(),
                target_word=pending.target_word.lower()
            )
            db.add(new_word)
```

At the manual add endpoint (~line 734):
```python
        existing = db.query(ReplaceWord).filter(
            func.lower(ReplaceWord.source_word) == source_word.lower(),
            func.lower(ReplaceWord.target_word) == target_word.lower()
        ).first()
        ...
        new_word = ReplaceWord(
            source_word=source_word.lower(),
            target_word=target_word.lower()
        )
```

Similarly, the approve_special_word endpoint should store `.lower()`:
```python
        new_word = SpecialWord(word=pending.word.lower())
```

**Step 3: Run admin words tests**

Run: `cd /Users/gallon/Documents/hermes && docker compose exec dashboard-backend python -m pytest tests/test_admin_words.py -v --no-cov`
Expected: All PASS

**Step 4: Commit**

```bash
git add dashboard/backend/app/routers/admin_words.py
git commit -m "feat: case-insensitive lookups and lowercase storage in admin_words"
```

---

## Task 8: Case-insensitive word discovery deduplication

**Files:**
- Modify: `dashboard/backend/app/etl/processors/word_discovery.py`

**Step 1: Write the failing test**

Add to `dashboard/backend/tests/test_word_discovery.py`:

```python
    def test_case_insensitive_dedup(self):
        """Existing words should be matched case-insensitively."""
        gemini_replace = [
            {'source': 'KUSA', 'target': '草', 'confidence': 0.9}
        ]
        gemini_special = [
            {'word': 'HoloLive', 'confidence': 0.9}
        ]
        existing_replace = {'kusa': '草'}
        existing_special = {'hololive'}

        filtered_replace, filtered_special = filter_and_validate_words(
            gemini_replace, gemini_special, existing_replace, existing_special
        )

        # Both should be filtered out (already exist, just different case)
        assert len(filtered_replace) == 0
        assert len(filtered_special) == 0
```

**Step 2: Run test to verify failure**

Run: `cd /Users/gallon/Documents/hermes && docker compose exec dashboard-backend python -m pytest tests/test_word_discovery.py::TestFilterAndValidateWords::test_case_insensitive_dedup -v --no-cov`
Expected: FAIL — case-sensitive set lookup doesn't match.

**Step 3: Modify `filter_and_validate_words`**

In `word_discovery.py`, lowercase all lookups in `filter_and_validate_words` (lines 25-119):

```python
def filter_and_validate_words(
    gemini_replace_words: List[Dict],
    gemini_special_words: List[Dict],
    existing_replace_mapping: Dict[str, str],
    existing_special_words: Set[str]
) -> Tuple[List[Dict], List[Dict]]:
    # Lowercase all existing data for comparison
    lower_replace_mapping = {k.lower(): v.lower() for k, v in existing_replace_mapping.items()}
    lower_special_words = {w.lower() for w in existing_special_words}

    replace_sources_set = set(lower_replace_mapping.keys())
    replace_targets_set = set(lower_replace_mapping.values())
    protected_words_set = replace_targets_set | lower_special_words

    filtered_replace = []
    auto_add_special = []

    for item in gemini_replace_words:
        source = item.get('source', '').lower()
        target = item.get('target', '').lower()
        item['source'] = source
        item['target'] = target

        if source == target:
            continue

        original_source = source
        original_target = target

        # 規則 1: Protected Words 自動顛倒
        if source in protected_words_set:
            source, target = target, source
            item['source'] = source
            item['target'] = target
            item['_transformation'] = f'swapped (protected): {original_source} <-> {original_target}'

            if source in replace_sources_set and lower_replace_mapping[source] == target:
                continue

        # 規則 2: Source 已存在自動轉換
        if source in replace_sources_set:
            db_target = lower_replace_mapping[source]
            new_source = target
            new_target = db_target
            item['source'] = new_source
            item['target'] = new_target
            item['_transformation'] = f'transformed: {original_source}->{original_target} => {new_source}->{new_target}'
            source = new_source
            target = new_target

            if source in replace_sources_set:
                continue

        filtered_replace.append(item)

        if target not in lower_special_words:
            auto_add_special.append({
                'word': target,
                'type': 'auto_from_replace',
                'confidence': 1.0,
                'examples': [f'替換詞彙的目標：{source} -> {target}'],
                'reason': f'自動從替換詞彙的目標詞彙加入',
                '_auto_added': True
            })
            lower_special_words.add(target)

    filtered_special = []
    for item in gemini_special_words:
        word = item.get('word', '').lower()
        item['word'] = word

        if word in lower_special_words:
            continue
        filtered_special.append(item)

    all_special = filtered_special + auto_add_special
    return filtered_replace, all_special
```

**Step 4: Also modify `_load_existing_dictionaries`**

In `WordDiscoveryProcessor._load_existing_dictionaries` (lines 412-436), lowercase at load time:

```python
        replace_mapping = {r[0].lower(): r[1].lower() for r in replace_records}
        existing_special_words = {r[0].lower() for r in special_records}
```

**Step 5: Also change occurrence counting from `LIKE` to `ILIKE`**

In `_save_discoveries` (line 686):
```python
WHERE message ILIKE :pattern
```

And (line 729):
```python
WHERE message ILIKE ANY(:patterns)
```

**Step 6: Run tests**

Run: `cd /Users/gallon/Documents/hermes && docker compose exec dashboard-backend python -m pytest tests/test_word_discovery.py -v --no-cov`
Expected: All PASS

**Step 7: Commit**

```bash
git add dashboard/backend/app/etl/processors/word_discovery.py dashboard/backend/tests/test_word_discovery.py
git commit -m "feat: case-insensitive dedup and ILIKE matching in word discovery"
```

---

## Task 9: Lowercase stopwords at load time

**Files:**
- Modify: `dashboard/backend/app/etl/processors/text_processor.py` (`load_stopwords`)

Since tokens are now all lowercase, stopwords must also be lowercase to match.

**Step 1: Modify `load_stopwords`**

In `text_processor.py`, change line 54:

```python
            _stopwords_cache = set(line.rstrip().lower() for line in f if line.rstrip())
```

**Step 2: Run all text processor tests**

Run: `cd /Users/gallon/Documents/hermes && docker compose exec dashboard-backend python -m pytest tests/test_text_processor.py -v --no-cov`
Expected: All PASS

**Step 3: Commit**

```bash
git add dashboard/backend/app/etl/processors/text_processor.py
git commit -m "feat: lowercase stopwords at load time"
```

---

## Task 10: Database migration for existing data

**Files:**
- Create: `database/init/15_lowercase_text_data.sql`

This is a one-time migration to lowercase all existing data.

**Step 1: Write migration SQL**

```sql
-- Migration: Lowercase all text analysis data for case-insensitive processing
-- This is idempotent - safe to run multiple times.

-- 1. Lowercase replace_words (handle dedup conflicts with ON CONFLICT)
-- First, find and remove case-duplicate entries (keep lowest ID)
DELETE FROM replace_words a
USING replace_words b
WHERE a.id > b.id
  AND lower(a.source_word) = lower(b.source_word);

UPDATE replace_words
SET source_word = lower(source_word),
    target_word = lower(target_word),
    updated_at = NOW()
WHERE source_word != lower(source_word)
   OR target_word != lower(target_word);

-- 2. Lowercase special_words (handle dedup)
DELETE FROM special_words a
USING special_words b
WHERE a.id > b.id
  AND lower(a.word) = lower(b.word);

UPDATE special_words
SET word = lower(word),
    updated_at = NOW()
WHERE word != lower(word);

-- 3. Lowercase meaningless_words (handle dedup)
DELETE FROM meaningless_words a
USING meaningless_words b
WHERE a.id > b.id
  AND lower(a.word) = lower(b.word);

UPDATE meaningless_words
SET word = lower(word),
    updated_at = NOW()
WHERE word != lower(word);

-- 4. Lowercase tokens in processed_chat_messages
-- This updates the TEXT[] array by lowering each element.
UPDATE processed_chat_messages
SET tokens = (
    SELECT array_agg(lower(t))
    FROM unnest(tokens) AS t
),
    processed_at = NOW()
WHERE EXISTS (
    SELECT 1 FROM unnest(tokens) AS t WHERE t != lower(t)
);

-- 5. Lowercase pending tables
UPDATE pending_replace_words
SET source_word = lower(source_word),
    target_word = lower(target_word)
WHERE source_word != lower(source_word)
   OR target_word != lower(target_word);

DELETE FROM pending_special_words a
USING pending_special_words b
WHERE a.id > b.id
  AND lower(a.word) = lower(b.word);

UPDATE pending_special_words
SET word = lower(word)
WHERE word != lower(word);
```

**Step 2: Test migration locally**

Run: `docker compose exec postgres psql -U hermes -d hermes -f /docker-entrypoint-initdb.d/15_lowercase_text_data.sql`

Verify:
```bash
docker compose exec postgres psql -U hermes -d hermes -c "SELECT source_word FROM replace_words WHERE source_word != lower(source_word) LIMIT 5;"
# Expected: 0 rows
```

**Step 3: Commit**

```bash
git add database/init/15_lowercase_text_data.sql
git commit -m "feat: add migration to lowercase existing text analysis data"
```

---

## Task 11: Run full test suite and verify

**Step 1: Run all backend tests**

Run: `cd /Users/gallon/Documents/hermes && docker compose exec dashboard-backend python -m pytest tests/ -v --no-cov`
Expected: All PASS (existing tests may need minor adjustments for lowercase expectations)

**Step 2: Fix any broken tests**

Existing tests that insert mixed-case data and assert exact values may need updating:
- `test_chat_processor.py`: Assertion `"草" in processed_message` should still pass (Chinese chars unaffected)
- `conftest.py` fixtures: No change needed (Chinese test data is unaffected by `.lower()`)

**Step 3: Final commit**

```bash
git commit -m "test: fix existing tests for case-insensitive processing"
```

---

## Summary of Changes

| File | Change | Risk |
|---|---|---|
| `text_processor.py` | `.lower()` in apply_replace, tokenize; reorder normalize | **Core** — all new tokens will be lowercase |
| `chat_processor.py` | `.lower()` when loading dicts | Low |
| `dict_importer.py` | `.lower()` at import time | Low |
| `wordcloud.py` | `.lower()` on exclusion/replacement keys | Low |
| `playback_wordcloud.py` | `.lower()` on exclusion/replacement keys | Low |
| `validation.py` | `func.lower()` on all comparisons | Low |
| `admin_words.py` | `func.lower()` lookups, `.lower()` storage | Low |
| `word_discovery.py` | `.lower()` all comparisons, `ILIKE` | Low |
| `15_lowercase_text_data.sql` | One-time data migration | **Must run manually on existing DB** |

**Performance impact:** Negligible. `.lower()` is O(n), GIN index unaffected, token cardinality decreases slightly.

**Breaking changes:** After this change, all tokens in `processed_chat_messages.tokens` will be lowercase. Any external system reading tokens directly must account for this. The migration script handles existing data.
