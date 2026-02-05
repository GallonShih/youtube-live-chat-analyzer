# Hermes (YouTube Chat Analyzer) - Zeabur Deployment Guide

本指南詳細說明如何將 Hermes 專案的各個組件（Backend, Frontend, Collector, Database）部署至 [Zeabur](https://zeabur.com) 平台。

## 1. 專案架構概觀

在 Zeabur 的同一個 Project 中，我們將建立 4 個獨立的服務：

1.  **PostgreSQL**: 託管資料庫 (Managed Database)。
2.  **Backend (dashboard-backend)**: 負責 API 與 ETL 排程。
3.  **Frontend (dashboard-frontend)**: React 前端介面。
4.  **Collector**: (選擇性) 負責抓取 YouTube 聊天室資料。
    *   *建議方案*: 雲端部署 Backend/Frontend/DB，但 **Collector 跑在本地** (Localhost) 以避免 IP 被 YouTube 封鎖。

---

## 2. PostgreSQL 資料庫設定

1.  在 Zeabur 專案中點選 **Create Service** -> **Prebuilt (Marketplace)** -> 搜尋 **PostgreSQL**。
2.  建立完成後，進入該服務的 **Instruction** (或 Connection) 頁籤。
3.  複製 **Connection String** (格式：`postgresql://user:pass@host:port/db`)。
    *   **注意**: 務必確認開頭是 `postgresql://`。如果是 `postgres://` 或 `https://`，請手動修改開頭為 `postgresql://` 以相容 SQLAlchemy。

### 資料庫初始化 (首次部署必做)
由於這是全新的資料庫，需要手動執行初始化 Script 來建立預設設定與 Prompt Template。
在 Backend 部署成功後，使用 Zeabur 內建的 SQL Client 或 DBeaver 連線，依序執行以下檔案內容：
1.  `database/init/05a_create_etl_settings.sql` (ETL 設定)
2.  `database/init/14_create_prompt_templates.sql` (AI 提示詞模板)

### 3. 匯入字典 (重要)
安裝完畢後，請務必執行以下步驟以匯入初始字典：
1.  登入 Dashboard 後台 (Admin)。
2.  進入 **ETL Jobs** (或 ETL Status) 頁面。
3.  在 **Manual Tasks** 列表中找到 **Import Dictionary** (匯入字典)。
4.  點擊 **Execute** (或 Run Now) 按鈕。
5.  等待執行完成，以確保中文斷詞與替換詞庫生效。

*(註：基本的 Table 結構會由 Backend 啟動時自動建立，不需手動跑 create_tables.sql)*

---

## 3. Backend 部署 (dashboard-backend)

*   **來源**: GitHub Repository
*   **Service Name**: 建議改為 `backend`

### Settings 設定 (Build 區塊)
*   **Root Directory (根目錄)**: `.` (一個小數點，代表 Repo 根目錄)
    *   *原因*: 需要讀取根目錄下的 `text_analysis` 資料夾。
*   **Build Method**: `Docker`
*   **Dockerfile Path**: `dashboard/backend/Dockerfile.backend`

### Networking 設定
*   **Port**: `8000` (如果預設抓不到，請手動新增)
*   **Domain**: 點選 **Generate Domain** 或綁定 Zeabur 子網域 (例如 `youtube-analyzer-api.zeabur.app`)。
    *   *請記下這個網址，前端變數會用到。*

### Variables (環境變數)
| 變數名稱 | 範例值 / 說明 | 必填 |
| :--- | :--- | :--- |
| `DATABASE_URL` | `${POSTGRES_CONNECTION_STRING}` (Zeabur PG 連線字串) | ✅ |
| `GEMINI_API_KEY` | `AIza...` (Google Gemini API Key) | ✅ |
| `APP_ENV` | `prod` | ✅ |
| `APP_WORKERS` | `2` (或 4，根據方案資源調整) | ✅ |
| `ENABLE_ETL_SCHEDULER` | `true` | ✅ |
| `TEXT_ANALYSIS_DIR` | `/app/text_analysis` (固定值) | ✅ |
| `ADMIN_PASSWORD` | `your_secure_password` (後端管理密碼) | 🔸 |
| `JWT_SECRET_KEY` | (產生一組隨機亂碼) | 🔸 |

---

## 4. Frontend 部署 (dashboard-frontend)

*   **來源**: GitHub Repository (同一個 Repo)
*   **Service Name**: 建議改為 `frontend`

### Settings 設定 (Build 區塊)
*   **Root Directory (根目錄)**: `dashboard/frontend`
    *   *注意*: 這裡跟後端不同，要指向前端資料夾。
*   **Build Method**: `Docker`
*   **Dockerfile Path**: `Dockerfile.frontend`
    *   *注意*: 因為 Root 已經在 `dashboard/frontend` 了，所以直接寫檔名即可。

### Networking 設定
*   **Port**: `80` (Nginx 預設)
*   **Domain**: 綁定一個公開的子網域 (例如 `youtube-analyzer-web.zeabur.app`)。這是給使用者訪問的網址。

### Variables (環境變數)
| 變數名稱 | 範例值 / 說明 | 必填 |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | `https://youtube-analyzer-api.zeabur.app` (Backend 的完整網址) | ✅ |

*注意：`VITE_API_BASE_URL` 必須包含 `https://`，且**不能**有尾隨斜線。修改此變數後需 **Redeploy** 才會生效。*

---

## 5. Collector 部署 (本地運作)

1.  修改本地 `.env` 檔，將 `DATABASE_URL` 換成 Zeabur 的連線字串。
2.  啟動 Collector：
    ```bash
    docker-compose up -d collector
    # 或
    python collector/main.py
    ```
這樣 Collector 會爬取資料，並寫入雲端資料庫。

---

## 常見問題排除 (Troubleshooting)

1.  **Backend 連不到資料庫**
    *   錯誤訊息: `sqlalchemy.exc.NoSuchModuleError: Can't load plugin: sqlalchemy.dialects:https`
    *   解法: 檢查 `DATABASE_URL` 是否以 `https://` 開頭，請改為 `postgresql://`。

2.  **Frontend 出現 405 Method Not Allowed**
    *   原因: `VITE_API_BASE_URL` 沒填好，導致請求打回前端自己的 Nginx。
    *   解法: 確保變數有加 `https://` 且是指向 Backend 網域。
