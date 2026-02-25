# Collector 未取得 Message 事件紀錄（2026-02-20）

## 1. 事件摘要

- 事件日期：2026-02-20
- 服務：`collector`
- 現象：
  - `youtube_api` stats 持續寫入（concurrent/view 持續更新）
  - `chat_messages` 在某時間點後停止新增
  - 表面看起來像「collector 活著，但拿不到 message」

## 2. 影響範圍

- `chat_messages` 停止新增，前端與後端依賴 message 的功能都會出現「無新資料」：
  - 即時留言列表
  - 文字分析/後續 ETL 的輸入資料
- `stream_stats` 不受影響（仍有更新）

## 3. 觀測與證據

### 3.1 容器狀態

- `collector` 容器持續 `running`
- `postgres` healthy

### 3.2 Collector log 時間線（UTC）

- 最後 message 活動：
  - `2026-02-20 11:20:06` `chat_collector - Buffer flushed ...`
- 之後 watchdog 觀察 idle_time 持續上升：
  - 11:20:22 / 11:20:52 / ... / 11:25:22
- 觸發 hung 判定與重啟：
  - `2026-02-20 11:25:22` `Chat watchdog: collector appears hung`
  - `2026-02-20 11:25:22` `Stopping chat collection...`
  - `2026-02-20 11:25:24` `ChatCollector initialized ...`
  - `2026-02-20 11:25:24` `Chat watchdog: collector restarted`
- 問題點：
  - 重啟後沒有再看到 `Starting chat collection...` 或後續 `Buffer flushed`（message pipeline 未恢復）
  - 但仍持續看到 `youtube_api - Saved stats ...`

### 3.3 資料庫證據

- 查詢結果（UTC）：
  - `now_utc = 2026-02-20 16:29:54+00`
  - `MAX(chat_messages.published_at) = 2026-02-20 11:20:03.65115+00`
  - `msg_last_1h = 0`
- 結論：11:20 後 message 確實未再寫入 DB

## 4. Root Cause

### 4.1 直接原因

`chat watchdog` 的「重啟」邏輯只重建 `ChatCollector` 物件，沒有保證 chat 收集執行緒仍在執行或被重啟。

- 問題路徑（事件發生前）在 `collector/main.py` 原邏輯：
  - `self.chat_collector.stop_collection()`
  - `self.chat_collector = ChatCollector(...)`
  - 但沒有明確重建/喚醒 chat collection thread

### 4.2 為何 watchdog 後續看起來失效

- watchdog 判斷依賴 `self.chat_collector.last_activity_time`
- 新建的 `ChatCollector` 在未開始收集前 `last_activity_time` 為 `None`
- 條件 `if self.chat_collector and self.chat_collector.last_activity_time:` 變為 false
- 進入 `debug` 分支，不會再以 idle_time 觸發 hung 告警

換句話說：**watchdog 有觸發一次，但重啟策略只換物件，沒有確保「收集 loop」恢復，導致 message 永久停擺。**

## 5. 修正內容（已套用）

檔案：`collector/main.py`

### 5.1 新增統一 thread 啟動方法

- `CollectorWorker._start_chat_thread()`（`collector/main.py:49`）
- 保證 chat thread 不在跑時才建立新 thread，並加啟動 log

### 5.2 啟動流程改用統一方法

- `start()` 內改為 `self._start_chat_thread()`（`collector/main.py:90-91`）

### 5.3 Chat watchdog 重啟流程強化

位置：`collector/main.py:338-355`

- 發生 timeout 時，在 lock 內執行：
  - `stop_collection()`
  - `join` 舊 chat thread（最多 10 秒）
  - 重建 `ChatCollector`
  - 呼叫 `_start_chat_thread()` 確保 loop 重新啟動
  - `self._url_changed.set()` 喚醒等待中的流程
- log 調整為：
  - `collector restarted and collection loop resumed`

### 5.4 無 heartbeat 時自我修復

位置：`collector/main.py:356-365`

- 若 `last_activity_time` 缺失且 thread 不在跑，watchdog 會主動重建 collector + 重啟 thread

## 6. 驗證狀態

- 已完成：
  - 語法檢查：`python3 -m py_compile collector/main.py`（通過）
- Runtime 驗證（2026-02-20）：
  - 已執行 `docker compose restart collector`
  - log 驗證通過：
    - 出現 `Starting chat collection...`
    - 出現 `Chat collection thread started`
    - 出現 `Retrieving chat for ...`
    - 出現多筆 `Buffer flushed: 10 saved, 0 errors`
  - DB 驗證通過：
    - `now_utc = 2026-02-20 16:41:25+00`
    - `last_published_at = 2026-02-20 16:41:20+00`
    - `msg_last_10m = 116`
    - `msg_last_1m = 116`
  - 結論：修正後 message pipeline 已恢復，`chat_messages` 再次持續寫入。

## 7. 建議後續驗證步驟

1. 重啟服務：`docker compose restart collector`
2. 追 log：`docker compose logs -f collector`
3. 確認 message 寫入：
   - `SELECT MAX(published_at), COUNT(*) FILTER (WHERE published_at > NOW() - interval '10 minutes') FROM chat_messages;`
4. 人工模擬（可選）：
   - 暫時阻塞 chat 流程，確認 watchdog 仍能恢復並重新出現 `Buffer flushed`
