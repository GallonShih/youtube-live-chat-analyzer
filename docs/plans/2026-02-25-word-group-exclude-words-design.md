# Word Group Exclude Words — Design

Date: 2026-02-25
Branch: feat/data-analytics

## Overview

Add an optional "exclude words" list to word trend groups. A message that contains any include word but also contains any exclude word is not counted for that group.

Filtering is at the message level: if a message matches any exclude word, the entire message is excluded from the group's count.

## Use Cases

- **Disambiguation**: include `吉祥`, exclude `吉祥天` — track "吉祥" without a character name
- **Negation filtering**: include `好笑`, `笑死`; exclude `不好笑` — track positive reactions only
- **Abbreviation precision**: include `GG`; exclude `GGWP`, `GGez` — track specific usage

## Database

### Schema change (Approach A)

Add a nullable JSON column to `word_trend_groups`. NULL means no exclusions (backward compatible). `ADD COLUMN` with no default is instant in PostgreSQL — no table rewrite.

```sql
ALTER TABLE word_trend_groups
  ADD COLUMN IF NOT EXISTS exclude_words JSON;
```

### Files to change

- `database/init/12_create_word_trends_tables.sql` — add `exclude_words JSON` to CREATE TABLE
- `database/migrations/22_add_exclude_words_to_word_trend_groups.sql` — migration for existing DBs

## Backend

### ORM (`app/models.py`)

```python
exclude_words = Column(JSON, nullable=True)
```

### Pydantic schemas (`app/routers/word_trends.py`)

- `WordGroupCreate`: `exclude_words: Optional[List[str]] = []`
- `WordGroupUpdate`: `exclude_words: Optional[List[str]] = None`
- `WordGroupResponse`: `exclude_words: List[str]` (null → `[]`)

### Stats query (`/stats` endpoint)

After the existing include-word OR conditions, add NOT conditions:

```python
exclude_words = group.exclude_words or []
exclude_conditions = [ChatMessage.message.ilike(f'%{w}%') for w in exclude_words]
if exclude_conditions:
    query = query.filter(~or_(*exclude_conditions))
```

### Performance

- `published_at` index already narrows the dataset before ILIKE runs
- NOT ILIKE adds marginal cost proportional to number of exclude words (typically 1–5)
- No additional index needed

## Frontend (`WordGroupCard.jsx`)

### Edit mode

Add an "排除詞彙" section below the include words section. Shares the same add/remove UX pattern but with red/gray tags to distinguish visually.

```
包含：[吉祥 ×]  [新增詞彙... +]
排除：[吉祥天 ×]  [新增排除詞... +]   ← new
```

### View mode

Exclude words are not shown — card stays clean.

### Validation

- Exclude words cannot overlap with include words (frontend check)
- Exclude words are optional (empty list is valid)

## Files Changed

| File | Change |
|------|--------|
| `database/init/12_create_word_trends_tables.sql` | Add `exclude_words JSON` column |
| `database/migrations/22_add_exclude_words_to_word_trend_groups.sql` | Migration script |
| `dashboard/backend/app/models.py` | Add `exclude_words` column |
| `dashboard/backend/app/routers/word_trends.py` | Schema + query update |
| `dashboard/frontend/src/features/trends/WordGroupCard.jsx` | Add exclude words UI |
