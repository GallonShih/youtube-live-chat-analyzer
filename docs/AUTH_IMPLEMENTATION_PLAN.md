# 訪客/管理員角色分離實作計畫

## 概述

實作前端訪客與管理員角色分離機制，並在後端添加 JWT 認證保護 API 端點。

### 目標
- 預設進入網站是訪客身份
- 可切換為管理員（需輸入密碼）
- 訪客無法存取 Admin 頁面
- 訪客在 Dashboard 頁面只能選擇/本地修改詞彙清單，無法更新/另存/刪除
- 訪客在 Trends 頁面無法新增詞彙組

---

## 階段一：後端認證機制

### Task 1.1：環境配置

**檔案：** `dashboard/backend/.env.example`

新增環境變數：
```env
# Authentication
ADMIN_PASSWORD=your_secure_password_here
JWT_SECRET_KEY=your_jwt_secret_key_here
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=15
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7
```

---

### Task 1.2：安裝依賴套件

**檔案：** `dashboard/backend/requirements.txt`

新增：
```
python-jose[cryptography]==3.3.0
```

---

### Task 1.3：建立認證配置模組

**新建檔案：** `dashboard/backend/app/core/auth_config.py`

```python
from pydantic_settings import BaseSettings
from functools import lru_cache

class AuthSettings(BaseSettings):
    admin_password: str = "admin123"
    jwt_secret_key: str = "your-secret-key-change-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    class Config:
        env_prefix = ""
        case_sensitive = False

@lru_cache()
def get_auth_settings() -> AuthSettings:
    return AuthSettings()
```

---

### Task 1.4：建立安全模組

**新建檔案：** `dashboard/backend/app/core/security.py`

功能：
- `create_access_token(data: dict)` - 建立 access token
- `create_refresh_token(data: dict)` - 建立 refresh token
- `verify_access_token(token: str)` - 驗證 access token
- `decode_token(token: str)` - 解碼 token
- `TokenError` - 自定義例外

---

### Task 1.5：建立依賴注入模組

**新建檔案：** `dashboard/backend/app/core/dependencies.py`

功能：
- `get_current_user(authorization: str)` - 從 header 取得當前使用者
- `require_admin(authorization: str)` - 要求管理員權限的依賴

---

### Task 1.6：建立認證路由

**新建檔案：** `dashboard/backend/app/routers/auth.py`

端點：
| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/auth/login` | 登入取得 tokens |
| POST | `/api/auth/refresh` | 刷新 access token |
| GET | `/api/auth/me` | 取得當前使用者資訊 |
| POST | `/api/auth/logout` | 登出（前端清除 token） |

---

### Task 1.7：註冊認證路由

**檔案：** `dashboard/backend/main.py`

新增：
```python
from app.routers import auth
app.include_router(auth.router)
```

---

## 階段二：保護後端 API 端點

### Task 2.1：保護 word_trends.py

**檔案：** `dashboard/backend/app/routers/word_trends.py`

需保護端點（添加 `dependencies=[Depends(require_admin)]`）：
- `POST /api/word-trends/groups` - 新增詞彙組
- `PUT /api/word-trends/groups/{group_id}` - 更新詞彙組
- `DELETE /api/word-trends/groups/{group_id}` - 刪除詞彙組

---

### Task 2.2：保護 exclusion_wordlist.py

**檔案：** `dashboard/backend/app/routers/exclusion_wordlist.py`

需保護端點：
- `POST /api/exclusion-wordlists` - 新增
- `PUT /api/exclusion-wordlists/{id}` - 更新
- `DELETE /api/exclusion-wordlists/{id}` - 刪除

---

### Task 2.3：保護 replacement_wordlist.py

**檔案：** `dashboard/backend/app/routers/replacement_wordlist.py`

需保護端點：
- `POST /api/replacement-wordlists` - 新增
- `PUT /api/replacement-wordlists/{id}` - 更新
- `DELETE /api/replacement-wordlists/{id}` - 刪除

---

### Task 2.4：保護 admin_words.py

**檔案：** `dashboard/backend/app/routers/admin_words.py`

需保護端點（共 12 個）：
- `POST /approve-replace-word/{word_id}`
- `POST /approve-special-word/{word_id}`
- `POST /reject-replace-word/{word_id}`
- `POST /reject-special-word/{word_id}`
- `POST /batch-approve-replace-words`
- `POST /batch-reject-replace-words`
- `POST /clear-pending-replace-words`
- `POST /batch-approve-special-words`
- `POST /batch-reject-special-words`
- `POST /clear-pending-special-words`
- `POST /add-replace-word`
- `POST /add-special-word`

**不需保護：**
- `POST /validate-replace-word` - 驗證用
- `POST /validate-special-word` - 驗證用

---

### Task 2.5：保護 admin_currency.py

**檔案：** `dashboard/backend/app/routers/admin_currency.py`

需保護端點：
- `POST /api/admin/currency-rates`

---

### Task 2.6：保護 admin_settings.py

**檔案：** `dashboard/backend/app/routers/admin_settings.py`

需保護端點：
- `POST /api/admin/settings`
- `DELETE /api/admin/settings/{key}`

---

### Task 2.7：保護 etl_jobs.py

**檔案：** `dashboard/backend/app/routers/etl_jobs.py`

需保護端點：
- `POST /api/admin/etl/jobs/{job_id}/trigger`
- `POST /api/admin/etl/jobs/{job_id}/pause`
- `POST /api/admin/etl/jobs/{job_id}/resume`
- `PUT /api/admin/etl/settings/{key}`

---

### Task 2.8：保護 prompt_templates.py

**檔案：** `dashboard/backend/app/routers/prompt_templates.py`

需保護端點：
- `POST /api/admin/etl/prompt-templates`
- `PUT /api/admin/etl/prompt-templates/{template_id}`
- `DELETE /api/admin/etl/prompt-templates/{template_id}`
- `POST /api/admin/etl/prompt-templates/{template_id}/activate`

---

## 階段三：後端測試

### Task 3.1：更新測試 Fixtures

**檔案：** `dashboard/backend/tests/conftest.py`

新增 fixtures：
```python
@pytest.fixture
def admin_token():
    """Generate a valid admin JWT token for testing."""
    from app.core.security import create_access_token
    return create_access_token({"role": "admin"})

@pytest.fixture
def admin_headers(admin_token):
    """Provide Authorization headers with admin token."""
    return {"Authorization": f"Bearer {admin_token}"}

@pytest.fixture
def admin_client(db, admin_headers):
    """Provide authenticated test client with admin token."""
    test_client = TestClient(app)
    test_client.headers.update(admin_headers)
    return test_client
```

---

### Task 3.2：建立認證測試

**新建檔案：** `dashboard/backend/tests/test_auth.py`

測試案例：
- `TestAuthLogin`
  - `test_login_success` - 正確密碼登入成功
  - `test_login_wrong_password` - 錯誤密碼登入失敗
  - `test_login_empty_password` - 空密碼登入失敗

- `TestAuthRefresh`
  - `test_refresh_token_success` - 刷新 token 成功
  - `test_refresh_with_invalid_token` - 無效 token 刷新失敗
  - `test_refresh_with_access_token` - 用 access token 刷新失敗

- `TestAuthMe`
  - `test_me_authenticated` - 已認證取得使用者資訊
  - `test_me_unauthenticated` - 未認證回傳訪客

- `TestProtectedEndpoints`
  - `test_protected_endpoint_without_auth` - 無認證存取保護端點回傳 401
  - `test_protected_endpoint_with_auth` - 有認證存取保護端點成功
  - `test_read_endpoint_without_auth` - GET 端點不需認證

---

### Task 3.3：更新現有測試

需要更新使用受保護端點的測試檔案，使用 `admin_client` 或 `admin_headers`：

- `tests/test_word_trends.py`
- `tests/test_exclusion_wordlist.py`
- `tests/test_replacement_wordlist.py`
- `tests/test_admin_words.py`
- `tests/test_admin_settings.py`
- `tests/test_etl_jobs.py`
- `tests/test_prompt_templates.py`

---

## 階段四：前端認證整合

### Task 4.1：更新 AuthContext

**檔案：** `dashboard/frontend/src/contexts/AuthContext.jsx`

更新內容：
- 移除硬編碼密碼
- 新增 `accessToken` 狀態
- 新增 `refreshToken` 處理
- `login()` 改為呼叫後端 `/api/auth/login`
- `logout()` 改為呼叫後端 `/api/auth/logout`
- 新增 `refreshAccessToken()` 方法
- 新增 `getAuthHeaders()` 方法
- 啟動時驗證 token 有效性

---

### Task 4.2：更新 Navigation

**檔案：** `dashboard/frontend/src/components/common/Navigation.jsx`

更新內容：
- `handleLogin()` 改為 async
- 新增 `isSubmitting` 狀態
- 登入按鈕顯示 loading 狀態
- 錯誤處理改善

---

### Task 4.3：建立 API 攔截器（可選）

**新建檔案：** `dashboard/frontend/src/utils/api.js`

功能：
- 統一處理 API 請求
- 自動附加 Authorization header
- 401 錯誤時自動刷新 token
- token 刷新失敗時自動登出

---

## 實作順序建議

```
階段一 (後端認證機制)
├── Task 1.1 → Task 1.2 → Task 1.3 → Task 1.4 → Task 1.5 → Task 1.6 → Task 1.7

階段二 (保護 API)
├── Task 2.1 ~ 2.8 (可並行)

階段三 (後端測試)
├── Task 3.1 → Task 3.2 → Task 3.3

階段四 (前端整合)
├── Task 4.1 → Task 4.2 → Task 4.3
```

---

## 預估時間

| 階段 | 預估時間 |
|------|----------|
| 階段一：後端認證機制 | 1-2 小時 |
| 階段二：保護 API 端點 | 30 分鐘 |
| 階段三：後端測試 | 1 小時 |
| 階段四：前端整合 | 1-2 小時 |
| **總計** | **3.5-5.5 小時** |

---

## 注意事項

1. **安全性**
   - 生產環境務必設定強密碼
   - JWT_SECRET_KEY 必須使用隨機生成的長字串
   - 不要將 `.env` 提交到版本控制

2. **向後相容**
   - GET 端點不需認證，確保訪客可瀏覽
   - 前端需優雅處理 401 錯誤

3. **測試**
   - 所有現有測試需使用 `admin_client` fixture
   - 新增無認證情況的測試確保回傳 401

4. **部署**
   - 更新 Docker 環境變數配置
   - 更新 CI/CD 環境變數
