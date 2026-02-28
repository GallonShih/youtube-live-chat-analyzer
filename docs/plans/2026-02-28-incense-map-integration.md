# Incense Map Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 新增「地區上香分布」功能，整合進現有 Dashboard — 後端 API 用 PostgreSQL server-side regex 聚合，前端新頁面顯示候選詞排行表格。

**Architecture:** 新增後端 router (`incense_map.py`) + 前端 feature (`IncenseMapPage.jsx`)，遵循現有 infection-map 的 feature 結構與 stats.js 的 API client 模式。不需要 AI 分類，直接呈現所有候選詞與次數。

**Tech Stack:** FastAPI + SQLAlchemy raw SQL、React + TailwindCSS、`@heroicons/react`

---

## 前置知識

### 後端 router 模式
```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.settings import get_current_video_id

router = APIRouter(prefix="/api/incense-map", tags=["incense-map"])
```

### PostgreSQL regex 聚合查詢
```sql
SELECT
    (regexp_match(message, '([\u4e00-\u9fff]{2,6})代表上香'))[1] AS word,
    COUNT(*) AS count
FROM chat_messages
WHERE message ~ '[\u4e00-\u9fff]{2,6}代表上香'
  AND live_stream_id = :video_id
GROUP BY word
ORDER BY count DESC
```

### 後端 main.py 位置
- Import: `dashboard/backend/main.py` 頂部 from app.routers import 區塊
- Register: `app.include_router(incense_map.router)` 在其他 router 之後

### 前端模式
- API client: `dashboard/frontend/src/api/incenseMap.js`（用普通 `fetch`，非 admin）
- Feature page: `dashboard/frontend/src/features/incense-map/IncenseMapPage.jsx`
- Route: `dashboard/frontend/src/App.jsx`
- Nav: `dashboard/frontend/src/components/common/Navigation.jsx`

---

## Task 1：後端 API endpoint

**Files:**
- Create: `dashboard/backend/app/routers/incense_map.py`
- Modify: `dashboard/backend/main.py`

**Step 1: 建立 router 檔案**

建立 `dashboard/backend/app/routers/incense_map.py`：

```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.core.database import get_db
from app.core.settings import get_current_video_id

router = APIRouter(prefix="/api/incense-map", tags=["incense-map"])


@router.get("/candidates")
def get_incense_candidates(db: Session = Depends(get_db)):
    video_id = get_current_video_id(db)

    sql = text("""
        SELECT
            (regexp_match(message, '([\\u4e00-\\u9fff]{2,6})代表上香'))[1] AS word,
            COUNT(*) AS count
        FROM chat_messages
        WHERE message ~ '[\\u4e00-\\u9fff]{2,6}代表上香'
          AND live_stream_id = :video_id
        GROUP BY word
        ORDER BY count DESC
    """)

    rows = db.execute(sql, {"video_id": video_id}).fetchall()
    total = sum(r.count for r in rows)

    candidates = [
        {
            "word": r.word,
            "count": r.count,
            "percentage": round(r.count / total * 100, 2) if total > 0 else 0,
        }
        for r in rows
    ]

    return {
        "total_matched": total,
        "unique_candidates": len(candidates),
        "candidates": candidates,
    }
```

**Step 2: 在 main.py 註冊 router**

在 `dashboard/backend/main.py` 的 import 區塊加入 `incense_map`，並在 include_router 區塊加上：
```python
app.include_router(incense_map.router)
```

**Step 3: 重啟後端並驗證**

```bash
docker-compose up -d --build dashboard-backend
sleep 5
curl -s http://localhost:8000/api/incense-map/candidates | python3 -m json.tool | head -30
```

Expected：JSON 回傳，包含 `total_matched`、`unique_candidates`、`candidates` 陣列，第一筆 word 有值且 count > 0。

**Step 4: Commit**

```bash
git add dashboard/backend/app/routers/incense_map.py dashboard/backend/main.py
git commit -m "feat(backend): add incense map candidates endpoint"
```

---

## Task 2：前端 API client + Feature 頁面

**Files:**
- Create: `dashboard/frontend/src/api/incenseMap.js`
- Create: `dashboard/frontend/src/features/incense-map/IncenseMapPage.jsx`

**Step 1: 建立 API client**

建立 `dashboard/frontend/src/api/incenseMap.js`：

```javascript
import API_BASE_URL from './client';

export const fetchIncenseCandidates = async () => {
    const res = await fetch(`${API_BASE_URL}/api/incense-map/candidates`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
};
```

**Step 2: 建立 Feature 頁面**

建立 `dashboard/frontend/src/features/incense-map/IncenseMapPage.jsx`：

```jsx
import { useState, useEffect, useMemo } from 'react';
import { fetchIncenseCandidates } from '../../api/incenseMap';

export default function IncenseMapPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [sortKey, setSortKey] = useState('count');
    const [sortAsc, setSortAsc] = useState(false);
    const [search, setSearch] = useState('');

    useEffect(() => {
        fetchIncenseCandidates()
            .then(setData)
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, []);

    const sorted = useMemo(() => {
        if (!data) return [];
        let list = data.candidates.filter(c =>
            search === '' || c.word.includes(search)
        );
        list = [...list].sort((a, b) => {
            const av = a[sortKey], bv = b[sortKey];
            if (typeof av === 'string') return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
            return sortAsc ? av - bv : bv - av;
        });
        return list;
    }, [data, sortKey, sortAsc, search]);

    const handleSort = (key) => {
        if (sortKey === key) setSortAsc(v => !v);
        else { setSortKey(key); setSortAsc(false); }
    };

    const SortIcon = ({ col }) => {
        if (sortKey !== col) return <span className="text-gray-300 ml-1">↕</span>;
        return <span className="ml-1">{sortAsc ? '↑' : '↓'}</span>;
    };

    if (loading) return (
        <div className="flex items-center justify-center h-64 text-gray-500">載入中...</div>
    );
    if (error) return (
        <div className="flex items-center justify-center h-64 text-red-500">錯誤：{error}</div>
    );

    return (
        <div className="max-w-3xl mx-auto p-6">
            <h1 className="text-2xl font-bold text-gray-800 mb-1">地區上香分布</h1>
            <p className="text-sm text-gray-500 mb-6">
                共 {data.total_matched.toLocaleString()} 則上香訊息，{data.unique_candidates} 個候選詞
            </p>

            <input
                type="text"
                placeholder="搜尋詞彙..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="mb-4 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />

            <div className="bg-white rounded-xl shadow overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600 font-semibold">
                        <tr>
                            <th className="px-4 py-3 text-left w-12">#</th>
                            <th
                                className="px-4 py-3 text-left cursor-pointer hover:text-indigo-600 select-none"
                                onClick={() => handleSort('word')}
                            >
                                詞彙 <SortIcon col="word" />
                            </th>
                            <th
                                className="px-4 py-3 text-right cursor-pointer hover:text-indigo-600 select-none"
                                onClick={() => handleSort('count')}
                            >
                                次數 <SortIcon col="count" />
                            </th>
                            <th
                                className="px-4 py-3 text-right cursor-pointer hover:text-indigo-600 select-none"
                                onClick={() => handleSort('percentage')}
                            >
                                比例 <SortIcon col="percentage" />
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {sorted.map((c, i) => (
                            <tr key={c.word} className="hover:bg-indigo-50 transition-colors">
                                <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                                <td className="px-4 py-2 font-medium text-gray-800">{c.word}</td>
                                <td className="px-4 py-2 text-right text-gray-700">
                                    {c.count.toLocaleString()}
                                </td>
                                <td className="px-4 py-2 text-right text-gray-500">
                                    {c.percentage}%
                                </td>
                            </tr>
                        ))}
                        {sorted.length === 0 && (
                            <tr>
                                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                                    找不到符合的詞彙
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
```

**Step 3: Commit**

```bash
git add dashboard/frontend/src/api/incenseMap.js dashboard/frontend/src/features/incense-map/IncenseMapPage.jsx
git commit -m "feat(frontend): add incense map API client and page"
```

---

## Task 3：前端 Route 與 Navigation

**Files:**
- Modify: `dashboard/frontend/src/App.jsx`
- Modify: `dashboard/frontend/src/components/common/Navigation.jsx`

**Step 1: 在 App.jsx 加入 route**

在 App.jsx 的 import 區塊加入：
```jsx
import IncenseMapPage from './features/incense-map/IncenseMapPage';
```

在 `<Routes>` 區塊加入：
```jsx
<Route path="/incense-map" element={<IncenseMapPage />} />
```

**Step 2: 在 Navigation.jsx 加入 nav item**

在 navItems 陣列加入（放在 Trends 之後）：
```jsx
{ path: '/incense-map', label: 'Incense', icon: FireIcon },
```

並在 import 的 heroicons 加入 `FireIcon`：
```jsx
import { ..., FireIcon } from '@heroicons/react/24/outline';
```

**Step 3: 驗證前端**

```bash
docker-compose up -d --build dashboard-frontend
```

開啟瀏覽器 `http://localhost:3000/incense-map`，確認：
- 頁面正常載入，顯示表格
- 點欄位標題可排序
- 搜尋框可過濾

**Step 4: Commit**

```bash
git add dashboard/frontend/src/App.jsx dashboard/frontend/src/components/common/Navigation.jsx
git commit -m "feat(frontend): add incense map route and nav link"
```

---

## 完整使用流程

1. 開啟 `http://localhost:3000/incense-map`
2. 看到所有候選詞（含非地區詞如「傳說」、「格力變頻空調」）
3. 用搜尋框過濾
4. 點欄位排序
