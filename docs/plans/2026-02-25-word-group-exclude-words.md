# Word Group Exclude Words Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an optional `exclude_words` list to word trend groups so messages matching any exclude word are not counted, even if they match an include word.

**Architecture:** Add a nullable `exclude_words` JSON column to `word_trend_groups`. Backend stats query adds `NOT ILIKE` conditions. Frontend `WordGroupCard` adds an exclude-words section visible only in edit mode.

**Tech Stack:** PostgreSQL, SQLAlchemy, FastAPI/Pydantic, React + Vitest + React Testing Library

---

## Task 1: DB init file + migration

**Files:**
- Modify: `database/init/12_create_word_trends_tables.sql`
- Create: `database/migrations/22_add_exclude_words_to_word_trend_groups.sql`

**Step 1: Update the CREATE TABLE in the init file**

In `database/init/12_create_word_trends_tables.sql`, add `exclude_words` after `words`:

```sql
CREATE TABLE IF NOT EXISTS word_trend_groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    words JSON NOT NULL,
    exclude_words JSON,
    color VARCHAR(20) DEFAULT '#5470C6',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

Also update the table comment:
```sql
COMMENT ON COLUMN word_trend_groups.exclude_words IS 'Optional JSON array of strings; messages matching any exclude word are not counted even if they match an include word';
```

**Step 2: Create the migration file**

Create `database/migrations/22_add_exclude_words_to_word_trend_groups.sql`:

```sql
-- Add exclude_words column to word_trend_groups
-- Nullable: NULL means no exclusions (backward compatible)
-- ADD COLUMN with no default is instant in PostgreSQL (no table rewrite)

ALTER TABLE word_trend_groups
    ADD COLUMN IF NOT EXISTS exclude_words JSON;

COMMENT ON COLUMN word_trend_groups.exclude_words IS 'Optional JSON array of strings; messages matching any exclude word are not counted even if they match an include word';
```

**Step 3: Commit**

```bash
git add database/init/12_create_word_trends_tables.sql database/migrations/22_add_exclude_words_to_word_trend_groups.sql
git commit -m "feat(db): add exclude_words column to word_trend_groups"
```

---

## Task 2: Backend — ORM model

**Files:**
- Modify: `dashboard/backend/app/models.py` (line ~225, the `WordTrendGroup` class)

**Step 1: Add `exclude_words` column after `words`**

```python
words = Column(JSON, nullable=False)  # existing
exclude_words = Column(JSON, nullable=True)  # new: optional exclusion list
```

No test needed for the ORM column itself — it's covered by the router tests in Task 3.

**Step 2: Commit**

```bash
git add dashboard/backend/app/models.py
git commit -m "feat(backend): add exclude_words to WordTrendGroup model"
```

---

## Task 3: Backend — Pydantic schemas + CRUD

**Files:**
- Modify: `dashboard/backend/app/routers/word_trends.py`
- Test: `dashboard/backend/tests/test_word_trends.py`

### Step 1: Write failing tests

Add to `test_word_trends.py`:

```python
def test_create_word_group_with_exclude_words(admin_client, db):
    """Test creating a word group with exclude words."""
    data = {
        "name": "Group With Exclude",
        "words": ["吉祥"],
        "exclude_words": ["吉祥天", "吉祥物"],
        "color": "#5470C6"
    }
    response = admin_client.post("/api/word-trends/groups", json=data)
    assert response.status_code == 201
    result = response.json()
    assert result["exclude_words"] == ["吉祥天", "吉祥物"]


def test_create_word_group_without_exclude_words_defaults_to_empty(admin_client, db):
    """Test that exclude_words defaults to [] when not provided."""
    data = {"name": "No Exclude", "words": ["word1"]}
    response = admin_client.post("/api/word-trends/groups", json=data)
    assert response.status_code == 201
    assert response.json()["exclude_words"] == []


def test_update_word_group_exclude_words(admin_client, sample_word_groups):
    """Test updating exclude_words on an existing group."""
    group_id = sample_word_groups[0]["id"]
    response = admin_client.put(f"/api/word-trends/groups/{group_id}", json={
        "exclude_words": ["bad_word"]
    })
    assert response.status_code == 200
    assert response.json()["exclude_words"] == ["bad_word"]


def test_list_word_groups_includes_exclude_words(client, db):
    """Test that GET /groups returns exclude_words field."""
    from app.models import WordTrendGroup
    g = WordTrendGroup(name="G", words=["w"], exclude_words=["x"], color="#000000")
    db.add(g)
    db.flush()

    response = client.get("/api/word-trends/groups")
    assert response.status_code == 200
    data = response.json()
    assert data[0]["exclude_words"] == ["x"]
```

**Step 2: Run tests to verify they fail**

```bash
cd /Users/gallon/Documents/hermes
NETWORK_NAME=$(docker network ls --filter name=analyzer-network --format "{{.Name}}")
docker run --rm --network $NETWORK_NAME \
  -v $(pwd)/dashboard/backend:/app \
  -w /app \
  -e DATABASE_URL=postgresql://hermes:hermes@postgres:5432/hermes_test \
  -e ADMIN_PASSWORD=admin123 \
  -e JWT_SECRET_KEY=test_secret_key_for_testing \
  gallonshih/youtube-chat-analyzer-backend:latest \
  sh -c "pip install pytest httpx==0.25.2 -q && pytest tests/test_word_trends.py::test_create_word_group_with_exclude_words tests/test_word_trends.py::test_create_word_group_without_exclude_words_defaults_to_empty tests/test_word_trends.py::test_update_word_group_exclude_words tests/test_word_trends.py::test_list_word_groups_includes_exclude_words -v --no-cov" 2>&1 | tail -20
```

Expected: FAIL (field not in schema/response yet)

**Step 3: Update Pydantic schemas**

In `word_trends.py`, update the three schema classes:

```python
class WordGroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    words: List[str] = Field(..., min_items=1)
    exclude_words: Optional[List[str]] = []
    color: str = Field(default='#5470C6', max_length=20)


class WordGroupUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    words: Optional[List[str]] = Field(None, min_items=0)
    exclude_words: Optional[List[str]] = None
    color: Optional[str] = Field(None, max_length=20)


class WordGroupResponse(BaseModel):
    id: int
    name: str
    words: List[str]
    exclude_words: List[str]
    color: str
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True
```

**Step 4: Update every `WordGroupResponse(...)` constructor call**

There are four places in the router that construct `WordGroupResponse`. Add `exclude_words=g.exclude_words or []` to each:

- `list_word_groups` — the list comprehension (change `g` to match variable name)
- `get_word_group`
- `create_word_group`
- `update_word_group`

Example for `list_word_groups`:
```python
return [
    WordGroupResponse(
        id=g.id,
        name=g.name,
        words=g.words or [],
        exclude_words=g.exclude_words or [],
        color=g.color or '#5470C6',
        created_at=g.created_at.isoformat() if g.created_at else "",
        updated_at=g.updated_at.isoformat() if g.updated_at else ""
    )
    for g in groups
]
```

Also update `create_word_group` to save `exclude_words`:
```python
exclude_words = [w.strip() for w in data.exclude_words if w.strip()] if data.exclude_words else []
group = WordTrendGroup(
    name=data.name.strip(),
    words=words,
    exclude_words=exclude_words or None,
    color=data.color
)
```

And `update_word_group` to handle `exclude_words` updates:
```python
if data.exclude_words is not None:
    exclude_words = [w.strip() for w in data.exclude_words if w.strip()]
    group.exclude_words = exclude_words or None
```

**Step 5: Run tests to verify they pass**

```bash
cd /Users/gallon/Documents/hermes
NETWORK_NAME=$(docker network ls --filter name=analyzer-network --format "{{.Name}}")
docker run --rm --network $NETWORK_NAME \
  -v $(pwd)/dashboard/backend:/app \
  -w /app \
  -e DATABASE_URL=postgresql://hermes:hermes@postgres:5432/hermes_test \
  -e ADMIN_PASSWORD=admin123 \
  -e JWT_SECRET_KEY=test_secret_key_for_testing \
  gallonshih/youtube-chat-analyzer-backend:latest \
  sh -c "pip install pytest httpx==0.25.2 -q && pytest tests/test_word_trends.py -v --no-cov" 2>&1 | tail -30
```

Expected: All tests pass.

**Step 6: Commit**

```bash
git add dashboard/backend/app/routers/word_trends.py dashboard/backend/tests/test_word_trends.py
git commit -m "feat(backend): add exclude_words to word group CRUD schemas and responses"
```

---

## Task 4: Backend — Stats query with exclude filter

**Files:**
- Modify: `dashboard/backend/app/routers/word_trends.py` (`get_trend_stats` function)
- Test: `dashboard/backend/tests/test_word_trends.py`

**Step 1: Write failing test**

Add to `test_word_trends.py`:

```python
@patch('app.routers.word_trends.get_current_video_id')
def test_get_trend_stats_with_exclude_words(mock_get_video_id, client, db, sample_messages_for_trends):
    """Messages matching an exclude word are not counted even if they match an include word."""
    from app.models import WordTrendGroup
    mock_get_video_id.return_value = 'test_stream'

    # "This contains word1" and "Another word1 message" match word1
    # "Yet another word1" also matches word1 but also contains "yet" — use that as exclude
    group = WordTrendGroup(
        name="Exclude Test",
        words=["word1"],
        exclude_words=["Yet another"],
        color="#000000"
    )
    db.add(group)
    db.flush()

    request_data = {
        "group_ids": [group.id],
        "start_time": "2026-01-12T09:00:00Z",
        "end_time": "2026-01-12T13:00:00Z"
    }
    response = client.post("/api/word-trends/stats", json=request_data)
    assert response.status_code == 200
    data = response.json()

    group_data = data["groups"][0]
    hourly_counts = {item["hour"]: item["count"] for item in group_data["data"]}

    # "Yet another word1" (msg_3) should be excluded → count is 2, not 3
    assert hourly_counts.get("2026-01-12T10:00:00+00:00") == 2
    # Hour 1: "word1 in hour 1" (msg_6) still counted
    assert hourly_counts.get("2026-01-12T11:00:00+00:00") == 1


@patch('app.routers.word_trends.get_current_video_id')
def test_get_trend_stats_empty_exclude_words_no_effect(mock_get_video_id, client, db, sample_messages_for_trends):
    """Empty exclude_words has no effect on counts."""
    from app.models import WordTrendGroup
    mock_get_video_id.return_value = 'test_stream'

    group = WordTrendGroup(
        name="No Exclude",
        words=["word1"],
        exclude_words=None,
        color="#000000"
    )
    db.add(group)
    db.flush()

    request_data = {
        "group_ids": [group.id],
        "start_time": "2026-01-12T09:00:00Z",
        "end_time": "2026-01-12T13:00:00Z"
    }
    response = client.post("/api/word-trends/stats", json=request_data)
    assert response.status_code == 200
    data = response.json()

    hourly_counts = {item["hour"]: item["count"] for item in data["groups"][0]["data"]}
    assert hourly_counts.get("2026-01-12T10:00:00+00:00") == 3  # unchanged
```

**Step 2: Run tests to verify they fail**

```bash
cd /Users/gallon/Documents/hermes
NETWORK_NAME=$(docker network ls --filter name=analyzer-network --format "{{.Name}}")
docker run --rm --network $NETWORK_NAME \
  -v $(pwd)/dashboard/backend:/app \
  -w /app \
  -e DATABASE_URL=postgresql://hermes:hermes@postgres:5432/hermes_test \
  -e ADMIN_PASSWORD=admin123 \
  -e JWT_SECRET_KEY=test_secret_key_for_testing \
  gallonshih/youtube-chat-analyzer-backend:latest \
  sh -c "pip install pytest httpx==0.25.2 -q && pytest tests/test_word_trends.py::test_get_trend_stats_with_exclude_words tests/test_word_trends.py::test_get_trend_stats_empty_exclude_words_no_effect -v --no-cov" 2>&1 | tail -20
```

Expected: FAIL

**Step 3: Update `get_trend_stats` in `word_trends.py`**

After the existing `word_conditions` block inside the `for group in groups` loop:

```python
# Existing include conditions
from sqlalchemy import or_
word_conditions = [ChatMessage.message.ilike(f'%{word}%') for word in words]

query = db.query(
    trunc_func.label('hour'),
    func.count(func.distinct(ChatMessage.message_id)).label('count')
).filter(
    ChatMessage.published_at >= start_time,
    ChatMessage.published_at <= end_time,
    or_(*word_conditions)
)

# NEW: exclude conditions
exclude_words = group.exclude_words or []
if exclude_words:
    exclude_conditions = [ChatMessage.message.ilike(f'%{w}%') for w in exclude_words]
    query = query.filter(~or_(*exclude_conditions))
```

**Step 4: Run all stats tests**

```bash
cd /Users/gallon/Documents/hermes
NETWORK_NAME=$(docker network ls --filter name=analyzer-network --format "{{.Name}}")
docker run --rm --network $NETWORK_NAME \
  -v $(pwd)/dashboard/backend:/app \
  -w /app \
  -e DATABASE_URL=postgresql://hermes:hermes@postgres:5432/hermes_test \
  -e ADMIN_PASSWORD=admin123 \
  -e JWT_SECRET_KEY=test_secret_key_for_testing \
  gallonshih/youtube-chat-analyzer-backend:latest \
  sh -c "pip install pytest httpx==0.25.2 -q && pytest tests/test_word_trends.py -v --no-cov" 2>&1 | tail -30
```

Expected: All pass.

**Step 5: Commit**

```bash
git add dashboard/backend/app/routers/word_trends.py dashboard/backend/tests/test_word_trends.py
git commit -m "feat(backend): apply exclude_words filter in trend stats query"
```

---

## Task 5: Frontend — WordGroupCard exclude words UI

**Files:**
- Modify: `dashboard/frontend/src/features/trends/WordGroupCard.jsx`
- Test: `dashboard/frontend/src/features/trends/WordGroupCard.test.jsx`

**Step 1: Write failing tests**

Add to `WordGroupCard.test.jsx`:

```jsx
test('shows exclude words section in edit mode and hides in view mode', async () => {
    const user = userEvent.setup();

    render(
        <WordGroupCard
            group={{ id: 1, name: 'G', words: ['吉祥'], exclude_words: ['吉祥天'], color: '#5470C6' }}
            isAdmin
            isVisible
            onToggleVisibility={vi.fn()}
            onDelete={vi.fn()}
            onSave={vi.fn()}
        />,
    );

    // View mode: exclude words NOT visible
    expect(screen.queryByText('吉祥天')).not.toBeInTheDocument();

    // Enter edit mode
    await user.click(screen.getByLabelText('編輯詞彙組'));

    // Edit mode: exclude word visible
    expect(screen.getByText('吉祥天')).toBeInTheDocument();
});

test('can add and remove exclude words, saved in onSave payload', async () => {
    const onSave = vi.fn().mockResolvedValue({});
    const user = userEvent.setup();

    render(
        <WordGroupCard
            group={{ id: 2, name: 'G2', words: ['w'], exclude_words: [], color: '#5470C6' }}
            isAdmin
            onSave={onSave}
        />,
    );

    await user.click(screen.getByLabelText('編輯詞彙組'));

    // Add an exclude word
    await user.type(screen.getByPlaceholderText('新增排除詞...'), '吉祥物');
    await user.keyboard('{Enter}');

    // Save
    await user.click(screen.getByRole('button', { name: '儲存' }));

    await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({ exclude_words: ['吉祥物'] })
        );
    });
});

test('exclude word can be removed with × button', async () => {
    const user = userEvent.setup();

    render(
        <WordGroupCard
            group={{ id: 3, name: 'G3', words: ['w'], exclude_words: ['bad'], color: '#5470C6' }}
            isAdmin
            onSave={vi.fn().mockResolvedValue({})}
        />,
    );

    await user.click(screen.getByLabelText('編輯詞彙組'));
    expect(screen.getByText('bad')).toBeInTheDocument();

    // Remove the exclude word
    const badTag = screen.getByText('bad').closest('span');
    await user.click(badTag.querySelector('button'));

    expect(screen.queryByText('bad')).not.toBeInTheDocument();
});
```

**Step 2: Run tests to verify they fail**

```bash
cd /Users/gallon/Documents/hermes/dashboard/frontend
npx vitest run --coverage src/features/trends/WordGroupCard.test.jsx 2>&1 | tail -20
```

Expected: FAIL

**Step 3: Update `WordGroupCard.jsx`**

Add `excludeWords` state beside `words`:

```jsx
const [excludeWords, setExcludeWords] = useState(group?.exclude_words || []);
const [newExcludeWord, setNewExcludeWord] = useState('');
const excludeWordInputRef = useRef(null);
```

Update `useEffect` to sync `exclude_words`:

```jsx
useEffect(() => {
    if (group) {
        setName(group.name || '');
        setWords(group.words || []);
        setExcludeWords(group.exclude_words || []);
        setColor(group.color || '#5470C6');
    }
}, [group]);
```

Add handlers:

```jsx
const handleAddExcludeWord = () => {
    const trimmed = newExcludeWord.trim();
    if (trimmed && !excludeWords.includes(trimmed) && !words.includes(trimmed)) {
        setExcludeWords([...excludeWords, trimmed]);
        setNewExcludeWord('');
        excludeWordInputRef.current?.focus();
    }
};

const handleRemoveExcludeWord = (word) => {
    setExcludeWords(excludeWords.filter(w => w !== word));
};

const handleExcludeKeyDown = (e) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
        e.preventDefault();
        handleAddExcludeWord();
    }
};
```

Update `handleCancel` to reset `excludeWords`:

```jsx
const handleCancel = () => {
    if (isNew) {
        onCancel?.();
    } else {
        setName(group.name);
        setWords(group.words);
        setExcludeWords(group.exclude_words || []);
        setColor(group.color);
        setIsEditing(false);
        setError('');
    }
};
```

Update `handleSave` payload:

```jsx
await onSave({
    id: group?.id,
    name: name.trim(),
    words,
    exclude_words: excludeWords,
    color
});
```

Add the exclude words section in JSX, **after the include words `<div className="flex flex-wrap gap-2 mb-3">`** and **before Color Picker**, but only in edit mode:

```jsx
{/* Exclude Words Tags (edit mode only) */}
{isEditing && (
    <div className="mb-3">
        <p className="text-xs text-gray-500 mb-1">排除詞彙</p>
        <div className="flex flex-wrap gap-2">
            {excludeWords.map((word, idx) => (
                <span
                    key={idx}
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-50 text-red-500"
                >
                    {word}
                    <button
                        onClick={() => handleRemoveExcludeWord(word)}
                        className="ml-2 text-current opacity-60 hover:opacity-100"
                    >
                        ×
                    </button>
                </span>
            ))}
            <div className="inline-flex items-center">
                <input
                    ref={excludeWordInputRef}
                    type="text"
                    value={newExcludeWord}
                    onChange={(e) => setNewExcludeWord(e.target.value)}
                    onKeyDown={handleExcludeKeyDown}
                    placeholder="新增排除詞..."
                    className="px-3 py-1 border border-dashed border-red-300 rounded-full text-sm focus:outline-none focus:border-red-400 w-32"
                />
                <button
                    onClick={handleAddExcludeWord}
                    className="ml-1 px-2 py-1 text-red-500 hover:bg-red-50 rounded-full text-sm font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-400"
                    aria-label="新增排除詞"
                >
                    +
                </button>
            </div>
        </div>
    </div>
)}
```

**Step 4: Run tests**

```bash
cd /Users/gallon/Documents/hermes/dashboard/frontend
npx vitest run --coverage src/features/trends/WordGroupCard.test.jsx 2>&1 | tail -30
```

Expected: All pass.

**Step 5: Commit**

```bash
git add dashboard/frontend/src/features/trends/WordGroupCard.jsx dashboard/frontend/src/features/trends/WordGroupCard.test.jsx
git commit -m "feat(frontend): add exclude words UI to WordGroupCard"
```

---

## Task 6: Run full test suites + apply migration

**Step 1: Backend full suite (411+ tests, coverage >= 70%)**

```bash
cd /Users/gallon/Documents/hermes
NETWORK_NAME=$(docker network ls --filter name=analyzer-network --format "{{.Name}}")
docker run --rm --network $NETWORK_NAME \
  -v $(pwd)/dashboard/backend:/app \
  -w /app \
  -e DATABASE_URL=postgresql://hermes:hermes@postgres:5432/hermes_test \
  -e ADMIN_PASSWORD=admin123 \
  -e JWT_SECRET_KEY=test_secret_key_for_testing \
  gallonshih/youtube-chat-analyzer-backend:latest \
  sh -c "pip install pytest pytest-cov httpx==0.25.2 -q && pytest" 2>&1 | tail -20
```

Expected: 411+ passed, coverage >= 70%.

**Step 2: Frontend full suite (coverage >= 70%)**

```bash
cd /Users/gallon/Documents/hermes/dashboard/frontend && npm run test:coverage 2>&1 | tail -20
```

Expected: All pass, coverage >= 70%.

**Step 3: Apply migration to running DB**

```bash
cd /Users/gallon/Documents/hermes
docker-compose exec postgres psql -U hermes -d hermes \
  -f /docker-entrypoint-initdb.d/../migrations/22_add_exclude_words_to_word_trend_groups.sql
```

Or pipe directly:
```bash
cat database/migrations/22_add_exclude_words_to_word_trend_groups.sql | \
  docker-compose exec -T postgres psql -U hermes -d hermes
```

**Step 4: Rebuild and restart backend**

```bash
cd /Users/gallon/Documents/hermes
docker-compose up -d --build dashboard-backend
```
