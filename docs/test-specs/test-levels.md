---
type: test-design-levels
last_updated: 2026-03-12
---

# 測試層級策略

> 本文件定義 CDMP MVP 各測試層級的覆蓋策略、責任邊界與執行方式。

---

## 1. Unit Tests — 單元測試

### 1.1 Auth 模組

| 測試目標 | 風險依據 | 覆蓋重點 |
|---------|---------|---------|
| 密碼雜湊與比對（bcrypt） | NFR-001.3 — 密碼安全性為 P0 | 驗證 cost factor >= 10、明文不儲存 |
| JWT Token 產生與解析 | NFR-001.1 — Token 管理為核心安全機制 | Payload 欄位驗證、過期時間計算（8h / 30d） |
| Token Blocklist 查詢 | F003 — 登出後舊 Token 必須被拒絕 | Blocklist 命中/未命中、過期記錄清理 |
| 密碼重設 Token 驗證 | F009 — Token 有效期 24h、一次性使用 | 過期判斷、已使用判斷、無效 Token |

### 1.2 Account 模組

| 測試目標 | 風險依據 | 覆蓋重點 |
|---------|---------|---------|
| Email 正規化（toLowerCase） | F004 AC-2 — 大小寫不敏感唯一性 | 各種大小寫混合輸入轉換 |
| 帳號狀態轉換 | F007 — active ↔ disabled | 合法轉換、自我停用阻擋 |
| 最後 Admin 保護邏輯 | F008 AC-2 — 系統必須保留至少一位 Admin | Admin 計數查詢、邊界情況（恰好 1 位） |
| 欄位驗證（name / email / password / role） | F004 AC-3 — 各欄位驗證規則 | 必填、長度、格式、列舉值 |

### 1.3 Datasource 模組

| 測試目標 | 風險依據 | 覆蓋重點 |
|---------|---------|---------|
| AES-256 加密／解密 | NFR-001.4 — 憑證靜態加密 | 加密後不可讀、解密還原正確 |
| 名稱唯一性檢查（排除軟刪除） | F011 AC-2 — 名稱唯一 | 同名未刪除記錄阻擋、同名已刪除記錄允許 |
| 狀態重置邏輯 | F013 BR-4 — 編輯後 status 重設為 unknown | 編輯觸發狀態重置 |
| 預設 Port 對應 | F011 BR-5 — MySQL=3306 / PostgreSQL=5432 / SQL Server=1433 | 各類型預設值 |
| 軟刪除過濾 | F014 BR-3 — 查詢排除 deleted_at IS NOT NULL | 軟刪除記錄不出現在查詢結果 |

### 1.4 Scheduler 模組

| 測試目標 | 風險依據 | 覆蓋重點 |
|---------|---------|---------|
| 健康檢查排程邏輯 | F016 AC-3 — 每 30 分鐘自動檢查 | 排程觸發、排除已刪除資料來源 |
| 連續失敗計算 | F016 AC-6 — 連續 >= 2 次失敗觸發警示 | 計數邏輯、恢復後重置 |
| 歷史紀錄清理 | OQ-10 — 保留 90 天 | 超過 90 天記錄被清理 |

### 1.5 Shared Infra（共用基礎設施）

| 測試目標 | 風險依據 | 覆蓋重點 |
|---------|---------|---------|
| Input Sanitization | OWASP — XSS / SQL Injection 防護 | 惡意輸入被消毒 |
| 分頁參數解析 | F005 / F012 — page / limit 參數 | 預設值、邊界值、無效值 |
| 錯誤回應格式化 | error-handling.md — 標準錯誤格式 | JSON 結構、欄位驗證 details 格式 |

---

## 2. Integration Tests — 整合測試

### 2.1 API 端點整合測試

每個 API 端點需驗證完整的請求→中介層→業務邏輯→資料庫→回應流程。

| 端點 | 方法 | 相關 Feature | 驗證重點 |
|------|------|-------------|---------|
| `/api/auth/login` | POST | F001, F002 | 成功登入（Admin/User）、無效憑證、帳號停用、Rate Limiting |
| `/api/auth/logout` | POST | F003 | Token 失效、Blocklist 寫入 |
| `/api/auth/forgot-password` | POST | F009 | Email 存在/不存在一致回應、Token 產生 |
| `/api/auth/reset-password` | POST | F009 | Token 驗證、密碼更新、Session 失效 |
| `/api/accounts` | POST | F004 | 帳號建立、Email 重複、欄位驗證 |
| `/api/accounts` | GET | F005 | 分頁、搜尋、篩選、排序 |
| `/api/accounts/:id` | PUT | F006 | 帳號更新、Email 唯一性、404 |
| `/api/accounts/:id/status` | PATCH | F007 | 停用/啟用、自我停用阻擋、Token 失效 |
| `/api/accounts/:id/role` | PATCH | F008 | 角色變更、最後 Admin 保護 |
| `/api/accounts/:id/reset-password` | POST | F010 | 密碼重設、自我重設阻擋 |
| `/api/datasources` | POST | F011 | 建立資料來源、名稱重複、密碼加密 |
| `/api/datasources` | GET | F012 | 分頁、搜尋、篩選、排除軟刪除 |
| `/api/datasources/:id` | GET | F013 | 單筆查詢、密碼不回傳 |
| `/api/datasources/:id` | PUT | F013 | 更新、密碼處理、狀態重置 |
| `/api/datasources/:id` | DELETE | F014 | 軟刪除、已刪除再刪除 404 |
| `/api/datasources/:id/test` | POST | F015 | 連線測試成功/失敗/逾時 |
| `/api/datasources/dashboard` | GET | F016 | 摘要統計、資料正確性 |
| `/api/datasources/:id/metrics` | GET | F016 | 效能指標、時間範圍篩選 |
| `/api/datasources/alerts` | GET | F016 | 警示清單、排序 |

### 2.2 中介層整合測試

| 中介層 | 驗證重點 |
|--------|---------|
| JWT 驗證 | 有效 Token 放行、過期 Token 拒絕（401）、無效簽章拒絕、Blocklist Token 拒絕 |
| RBAC | Admin 端點 — Admin Token 放行 / User Token 拒絕（403）；公開端點（login / forgot-password）— 無 Token 放行 |
| Rate Limiting | 登入端點 5 次/分鐘/IP；超過回傳 429 |
| CORS | 允許的 Origin 放行、非允許的 Origin 拒絕 |
| Input Sanitization | XSS payload 被清理、SQL Injection 被阻擋 |

---

## 3. System / E2E Tests — 端對端測試

### 對應 UI 原型頁面的完整瀏覽器流程

| 流程 | 涵蓋 Feature | 關鍵驗證點 |
|------|-------------|-----------|
| Admin 登入 → 管理後台首頁 | F001 | 表單提交、JWT 取得、頁面導向 |
| User 登入 → 說明頁面 | F002 | 角色區分導向、Admin 路由阻擋 |
| 登出 → 登入頁面 | F003 | Session 清除、返回鍵阻擋 |
| 建立帳號 → 帳號清單 | F004, F005 | 表單填寫、清單更新 |
| 帳號清單搜尋篩選 | F005 | 搜尋、角色篩選、狀態篩選、分頁 |
| 編輯帳號 | F006 | 表單預填、儲存、清單更新 |
| 停用/啟用帳號 | F007 | 確認對話框、狀態變更、視覺標記 |
| 角色變更 | F008 | 確認對話框、最後 Admin 保護 |
| 忘記密碼 → 重設密碼 → 登入 | F009 | Email 發送、連結點擊、密碼更新 |
| Admin 重設密碼 | F010 | 對話框、密碼規則驗證 |
| 新增資料來源 → 清單 | F011, F012 | 表單填寫、預設 Port、清單更新 |
| 編輯資料來源 | F013 | 預填表單、密碼處理、狀態重置 |
| 刪除資料來源 | F014 | 確認對話框、清單移除 |
| 測試連線 | F015 | 測試中狀態、結果顯示、狀態更新 |
| 儀表板瀏覽 | F016 | 摘要統計、圖表渲染、警示清單 |

---

## 4. Non-Functional Tests — 非功能測試

### 4.1 效能測試

| 測試項目 | NFR | 閾值 | 驗證方法 |
|---------|-----|------|---------|
| API 回應時間（CRUD） | NFR-002.1 | p95 < 500ms | 負載測試工具對各端點發送請求，量測 p95 |
| 並發使用者 | NFR-002.2 | 100 人並發，回應時間 <= 2x 基準值 | 100 並發使用者模擬，比較單一使用者基準值 |
| 連線測試逾時 | NFR-002.3 | 10 秒內回傳結果 | 對不可達主機發起連線測試，驗證 10 秒逾時 |
| 儀表板載入 | NFR-002.4 | < 2 秒（50 個資料來源） | 50 個資料來源環境下量測初始渲染時間 |
| 清單分頁效能 | NFR-002.5 | < 500ms（1,000 筆資料） | 1,000 筆帳號/資料來源下量測分頁 API 回應時間 |

### 4.2 安全性測試

| 測試項目 | NFR | 驗證方法 |
|---------|-----|---------|
| JWT Token 管理 | NFR-001.1 | 驗證閒置 8h 後 Token 失效、登出後舊 Token 被拒絕、「記住我」Token 30 天有效 |
| RBAC 強制執行 | NFR-001.2 | User 角色逐一測試每個 Admin 端點 → 預期全部回傳 403；記錄日誌驗證 |
| 密碼安全性 | NFR-001.3 | 資料庫直接查詢 password_hash — 驗證為 bcrypt 格式、cost factor >= 10；日誌掃描 — 驗證無明文密碼 |
| 憑證保護 | NFR-001.4 | API 回應檢查 — 密碼欄位為遮罩（`****`）或不存在；日誌掃描 — 驗證無憑證明文 |
| 傳輸安全 | NFR-001.5 | TLS 掃描 — 驗證 TLS 1.2+；HTTP 請求 — 驗證被拒絕或重導至 HTTPS |

### 4.3 可觀測性測試

| 測試項目 | 驗證方法 |
|---------|---------|
| 日誌遮罩敏感欄位 | 觸發密碼相關操作 → 檢查日誌檔 → 驗證無密碼明文、無資料庫連線密碼 |
| 未授權存取日誌 | User 嘗試存取 Admin 端點 → 驗證日誌包含 userId、端點、時間戳記 |
| 稽核日誌完整性 | 帳號停用/密碼重設/資料來源刪除 → 驗證 audit log 記錄存在且不含敏感值 |

---

## 測試執行建議

### CI Pipeline 分層

| 階段 | 測試類型 | 預估時間 | 觸發條件 |
|------|---------|---------|---------|
| Pre-commit | Lint + 靜態分析 | < 30s | 每次 commit |
| Unit | 單元測試 | < 2min | 每次 push |
| Integration | API 整合測試 | < 5min | 每次 push |
| E2E | 瀏覽器端對端測試 | < 15min | PR merge 前 |
| NFR | 效能 + 安全性 | < 30min | Release 前 / 週期性 |
