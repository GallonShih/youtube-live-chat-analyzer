# Message Context Modal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to click a button on any message row in the Dashboard's MessageList to open a full-screen modal showing the full time-filtered message list, auto-navigated and scrolled to that specific message.

**Architecture:** `MessageRow` gets a hover-visible trigger button; `Dashboard` holds `contextMessage` state and renders a new `MessageContextModal`; the modal calls the existing `fetchChatMessages` API twice — first with `limit=1` and `endTime=message.time` to compute the page position, then again to load that page — and scrolls to the matched message by ID using `useRef`.

**Tech Stack:** React, heroicons, `fetchChatMessages` from `src/api/chat.js`, `formatMessageTime` from `src/utils/formatters`

---

## Task 1: Add trigger button to `MessageRow`

**Files:**
- Modify: `dashboard/frontend/src/features/messages/MessageList.jsx`

The `MessageRow` component needs:
- A new `onViewInContext` prop
- Desktop (grid row): 5th column `w-8` with a button, visible only on group-hover
- Mobile (card): a small button next to the timestamp, always visible
- The desktop header row needs a matching empty 5th column

### Step 1: Add `ArrowsPointingOutIcon` to the imports in `MessageList.jsx`

Current import block (top of file, line ~2):
```js
import { ArrowPathIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
```
Change to:
```js
import { ArrowPathIcon, ChatBubbleLeftRightIcon, ArrowsPointingOutIcon } from '@heroicons/react/24/outline';
```

### Step 2: Update `MessageRow` signature and add trigger buttons

Current signature (line ~33):
```jsx
const MessageRow = ({ message, onAuthorSelect }) => {
```
New signature:
```jsx
const MessageRow = ({ message, onAuthorSelect, onViewInContext }) => {
```

#### Desktop row (currently line ~123):
Change the outer `div` className from `hidden md:grid grid-cols-[140px_minmax(100px,1fr)_minmax(200px,2fr)_100px] lg:grid-cols-[180px_minmax(150px,1fr)_minmax(300px,2fr)_120px]` to:
```
hidden md:grid grid-cols-[140px_minmax(100px,1fr)_minmax(200px,2fr)_100px_32px] lg:grid-cols-[180px_minmax(150px,1fr)_minmax(300px,2fr)_120px_32px]
```
Also add `group relative` to the className.

After the money `<span>` (4th cell), add the 5th cell:
```jsx
<button
    type="button"
    onClick={() => onViewInContext?.(message)}
    className="opacity-0 group-hover:opacity-100 flex items-center justify-center text-gray-400 hover:text-blue-600 transition-opacity cursor-pointer"
    title="在列表中定位"
>
    <ArrowsPointingOutIcon className="w-4 h-4" />
</button>
```

#### Mobile card (currently line ~105):
In the top row (`flex items-center justify-between`), add the button next to the timestamp:
```jsx
<div className="flex items-center gap-1.5">
    <span className="text-xs text-gray-400">{formatMessageTime(message.time)}</span>
    <button
        type="button"
        onClick={() => onViewInContext?.(message)}
        className="text-gray-400 hover:text-blue-600 cursor-pointer"
        title="在列表中定位"
    >
        <ArrowsPointingOutIcon className="w-3.5 h-3.5" />
    </button>
</div>
```

### Step 3: Update the desktop header row to add an empty 5th column

Find the header row (line ~407):
```jsx
<div className="hidden md:grid grid-cols-[140px_minmax(100px,1fr)_minmax(200px,2fr)_100px] lg:grid-cols-[180px_minmax(150px,1fr)_minmax(300px,2fr)_120px] gap-2 lg:gap-4 mb-2 text-sm font-semibold text-gray-600 border-b-2 border-gray-300 pb-2">
    <span>時間</span><span>作者</span><span>訊息</span><span>金額</span>
</div>
```
Change to add 5th column:
```jsx
<div className="hidden md:grid grid-cols-[140px_minmax(100px,1fr)_minmax(200px,2fr)_100px_32px] lg:grid-cols-[180px_minmax(150px,1fr)_minmax(300px,2fr)_120px_32px] gap-2 lg:gap-4 mb-2 text-sm font-semibold text-gray-600 border-b-2 border-gray-300 pb-2">
    <span>時間</span><span>作者</span><span>訊息</span><span>金額</span><span></span>
</div>
```

### Step 4: Thread `onViewInContext` through `MessageList`

Update `MessageList` props (line ~140):
```jsx
const MessageList = ({ startTime, endTime, hasTimeFilter = false, onAuthorSelect, onViewInContext }) => {
```

Update the message map (line ~411) to pass the prop:
```jsx
messages.map((msg) => (
    <MessageRow
        key={msg.id}
        message={msg}
        onAuthorSelect={onAuthorSelect}
        onViewInContext={onViewInContext}
    />
))
```

### Step 5: Manual verification

Run the frontend dev server and confirm:
- Desktop: hovering a message row shows the `ArrowsPointingOutIcon` button in the 5th column
- Mobile: the icon appears next to the timestamp on every card
- Clicking triggers `onViewInContext` (console.log it temporarily)

---

## Task 2: Create `MessageContextModal` component

**Files:**
- Create: `dashboard/frontend/src/features/messages/MessageContextModal.jsx`

This component:
1. On `targetMessage` change: fetches `total` count of messages at/before `targetMessage.time` to compute `initialPage`
2. On `page` change: fetches one page of messages (no text filters, just `startTime`/`endTime`)
3. After messages load: finds the target by ID, scrolls the row into view using a ref
4. Highlights the target row with amber styling
5. Provides simple prev/next/jump pagination

```jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { XMarkIcon, ArrowsPointingOutIcon } from '@heroicons/react/24/outline';
import { fetchChatMessages } from '../../api/chat';
import { formatMessageTime } from '../../utils/formatters';

const PAGE_SIZE = 20;

function MessageContextModal({ isOpen, onClose, targetMessage, startTime, endTime }) {
    const [page, setPage] = useState(1);
    const [messages, setMessages] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [highlightId, setHighlightId] = useState(null);
    const rowRefs = useRef({});

    const totalPages = Math.ceil(total / PAGE_SIZE);

    // Compute initial page and highlight id from targetMessage
    useEffect(() => {
        if (!isOpen || !targetMessage) return;

        setHighlightId(targetMessage.id);
        setLoading(true);

        // Fetch total count of messages at or before the target time
        fetchChatMessages({
            limit: 1,
            offset: 0,
            startTime,
            endTime: targetMessage.time,
        })
            .then(({ total: countBefore }) => {
                // countBefore = number of messages from startTime up to and including target time
                const targetPage = Math.max(1, Math.ceil(countBefore / PAGE_SIZE));
                setPage(targetPage);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [isOpen, targetMessage, startTime, endTime]);

    // Load messages for current page
    useEffect(() => {
        if (!isOpen) return;

        setLoading(true);
        fetchChatMessages({
            limit: PAGE_SIZE,
            offset: (page - 1) * PAGE_SIZE,
            startTime,
            endTime,
        })
            .then(({ messages: msgs, total: t }) => {
                setMessages(msgs);
                setTotal(t);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [isOpen, page, startTime, endTime]);

    // Scroll to highlighted message after messages load
    useEffect(() => {
        if (!highlightId || messages.length === 0) return;
        const el = rowRefs.current[highlightId];
        if (el) {
            // Small delay to let the DOM paint
            setTimeout(() => {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        }
    }, [messages, highlightId]);

    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setMessages([]);
            setTotal(0);
            setPage(1);
            setHighlightId(null);
            rowRefs.current = {};
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const isPaid = (msg) =>
        msg.message_type === 'paid_message' || msg.message_type === 'ticker_paid_message_item';

    return (
        <div
            className="fixed inset-0 z-50 flex flex-col bg-white"
            role="dialog"
            aria-modal="true"
            aria-label="訊息列表"
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50 shrink-0">
                <div className="flex items-center gap-2">
                    <ArrowsPointingOutIcon className="w-5 h-5 text-gray-600" />
                    <h2 className="font-bold text-gray-800">訊息列表</h2>
                    {(startTime || endTime) && (
                        <span className="text-xs text-gray-500 ml-2">
                            {startTime ? formatMessageTime(startTime) : ''}
                            {' → '}
                            {endTime ? formatMessageTime(endTime) : '現在'}
                        </span>
                    )}
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 rounded hover:bg-gray-200 cursor-pointer text-gray-500 hover:text-gray-800 transition-colors"
                    aria-label="關閉"
                >
                    <XMarkIcon className="w-5 h-5" />
                </button>
            </div>

            {/* Desktop column header */}
            <div className="hidden md:grid grid-cols-[140px_minmax(100px,1fr)_minmax(200px,2fr)_100px] lg:grid-cols-[180px_minmax(150px,1fr)_minmax(300px,2fr)_120px] gap-2 lg:gap-4 px-4 py-2 text-sm font-semibold text-gray-600 border-b border-gray-200 bg-gray-50 shrink-0">
                <span>時間</span><span>作者</span><span>訊息</span><span>金額</span>
            </div>

            {/* Message list */}
            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="flex justify-center items-center h-full text-gray-500">載入中...</div>
                ) : messages.length === 0 ? (
                    <div className="flex justify-center items-center h-full text-gray-500">無資料</div>
                ) : (
                    messages.map((msg) => {
                        const isHighlighted = msg.id === highlightId;
                        const moneyText = isPaid(msg) && msg.money ? msg.money.text : '';

                        return (
                            <div
                                key={msg.id}
                                ref={(el) => { rowRefs.current[msg.id] = el; }}
                                className={`transition-colors duration-300 ${
                                    isHighlighted
                                        ? 'bg-amber-50 ring-2 ring-amber-400 ring-inset'
                                        : 'hover:bg-gray-50'
                                }`}
                            >
                                {/* Mobile card */}
                                <div className="md:hidden border-b border-gray-200 py-3 px-4 space-y-1">
                                    <div className="flex items-center justify-between">
                                        <span className="font-semibold text-gray-700 truncate max-w-[60%]">
                                            {msg.author || 'Unknown'}
                                        </span>
                                        <span className="text-xs text-gray-400">{formatMessageTime(msg.time)}</span>
                                    </div>
                                    <div className="text-sm text-gray-900 break-words">{msg.message}</div>
                                    {moneyText && <div className="text-sm font-semibold text-green-600">{moneyText}</div>}
                                </div>
                                {/* Desktop grid */}
                                <div className="hidden md:grid grid-cols-[140px_minmax(100px,1fr)_minmax(200px,2fr)_100px] lg:grid-cols-[180px_minmax(150px,1fr)_minmax(300px,2fr)_120px] gap-2 lg:gap-4 px-4 text-sm border-b border-gray-200 py-2">
                                    <span className="text-gray-500 whitespace-nowrap text-xs lg:text-sm">{formatMessageTime(msg.time)}</span>
                                    <span className="font-semibold text-gray-700 truncate">{msg.author || 'Unknown'}</span>
                                    <span className="text-gray-900 break-words">{msg.message}</span>
                                    <span className={`font-semibold ${moneyText ? 'text-green-600' : 'text-gray-400'}`}>{moneyText || '-'}</span>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Pagination footer */}
            {total > 0 && (
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-200 bg-gray-50 shrink-0">
                    <button
                        onClick={() => setPage((p) => p - 1)}
                        disabled={page === 1 || loading}
                        className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer text-sm"
                    >
                        上一頁
                    </button>
                    <span className="text-sm text-gray-600">
                        第 {page} / {totalPages} 頁（共 {total} 則）
                    </span>
                    <button
                        onClick={() => setPage((p) => p + 1)}
                        disabled={page >= totalPages || loading}
                        className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer text-sm"
                    >
                        下一頁
                    </button>
                </div>
            )}
        </div>
    );
}

export default MessageContextModal;
```

### Verification

Open browser, click the trigger button on any message:
- Modal opens full-screen
- Shows the message list paged to the correct page
- Target message has amber highlight and is scrolled into view
- Prev/Next pagination works
- Close (×) dismisses the modal

---

## Task 3: Wire up Dashboard

**Files:**
- Modify: `dashboard/frontend/src/features/dashboard/Dashboard.jsx`

### Step 1: Import `MessageContextModal`

Add to existing imports at the top of `Dashboard.jsx`:
```jsx
import MessageContextModal from '../messages/MessageContextModal';
```

### Step 2: Add `contextMessage` state

Inside the `Dashboard` function, after the existing state declarations (e.g., near `isAuthorDrawerOpen`):
```jsx
const [contextMessage, setContextMessage] = useState(null);
```

### Step 3: Pass `onViewInContext` to `MessageList`

Find the existing `<MessageList ... />` block (line ~525):
```jsx
<MessageList
    startTime={detailStartTime}
    endTime={detailEndTime}
    hasTimeFilter={!!endDate}
    onAuthorSelect={handleAuthorSelect}
/>
```
Add one prop:
```jsx
<MessageList
    startTime={detailStartTime}
    endTime={detailEndTime}
    hasTimeFilter={!!endDate}
    onAuthorSelect={handleAuthorSelect}
    onViewInContext={setContextMessage}
/>
```

### Step 4: Render `MessageContextModal`

After `<AuthorDetailDrawer ... />` (line ~532), add:
```jsx
<MessageContextModal
    isOpen={contextMessage !== null}
    onClose={() => setContextMessage(null)}
    targetMessage={contextMessage}
    startTime={detailStartTime}
    endTime={detailEndTime}
/>
```

### Step 5: Final verification

1. Set a time filter in the Dashboard (any range)
2. Hover a message row → confirm trigger button appears
3. Click it → full-screen modal opens, scrolled to that message (amber highlight)
4. Paginate forward/back — works
5. Click × → modal closes, Dashboard state is unchanged
6. Repeat with no time filter (rolling window) — should still work

---

## Commit

```bash
git add dashboard/frontend/src/features/messages/MessageList.jsx \
        dashboard/frontend/src/features/messages/MessageContextModal.jsx \
        dashboard/frontend/src/features/dashboard/Dashboard.jsx
git commit -m "feat(dashboard): add message context modal with scroll-to-target"
```
