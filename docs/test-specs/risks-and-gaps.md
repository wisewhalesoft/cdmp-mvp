---
type: test-design-risks
last_updated: 2026-08-13
---

# 風險與缺口

> 本文件記錄 CDMP MVP 測試設計過程中識別的不可測需求、模糊需求、架構限制、整合依賴與待決問題。

---

## 1. 不可測或模糊的需求

### 1.1 Token Blocklist Fail-Open / Fail-Closed 行為

- **來源**：F003（登出）、NFR-001.1
- **問題**：規格未定義 Token Blocklist 服務不可用時的行為。若 Blocklist 查詢失敗：
  - Fail-Open：允許請求通過（安全風險 — 已登出的 Token 仍可使用）
  - Fail-Closed：拒絕所有請求（可用性風險 — 全站停擺）
- **影響**：無法設計 Blocklist 故障場景的預期結果
- **建議**：架構師需決定 fail-open 或 fail-closed 策略

### 1.2 Email 重試機制

- **來源**：F009（自助式密碼重設）
- **問題**：規格未定義 Email 發送失敗時的重試策略。是否需要：
  - 自動重試？次數與間隔？
  - 使用者可見的重試按鈕？
  - 失敗記錄至 audit log？
- **影響**：無法設計 Email 暫時性失敗的完整測試場景
- **建議**：MVP 可暫不實作自動重試，僅回傳 SYSTEM_EMAIL_SEND_FAILED

### 1.3 Refresh Token 具體流程

- **來源**：OQ-1 決議（Refresh Token + 短效 Access Token）
- **問題**：決議了使用 Refresh Token 架構，但以下細節未定義：
  - Access Token 有效期？（建議 15 分鐘）
  - Refresh Token 端點路徑？
  - Refresh Token 儲存位置（HttpOnly Cookie 或 localStorage）？
  - Refresh Token 被撤銷後的前端行為？
- **影響**：無法設計完整的 Token 刷新與撤銷測試場景
- **建議**：架構師需補充 Refresh Token 實作規格

### 1.4 帳號停用後的前端即時反應

- **來源**：F007 AC-1
- **問題**：帳號停用後「若該使用者目前在線則被強制登出」，但未定義：
  - 前端如何得知被停用？（Polling 或 WebSocket 或下次 API 請求？）
  - 使用者看到的畫面為何？（直接跳轉登入頁？顯示停用訊息？）
- **影響**：E2E 測試無法驗證即時強制登出的 UX 流程
- **建議**：依據現有架構，最可能的實作是「下次 API 請求時回傳 401，前端導向登入頁」

---

## 2. 缺少的驗收標準

### 2.1 帳號清單預設排序規則

- **來源**：F005 BR-1
- **問題**：BR-1 定義「預設排序為 created_at DESC」，但未定義：
  - 是否支援使用者切換排序欄位？
  - 是否支援 ASC / DESC 切換？
  - API 是否接受 sort 參數？
- **影響**：測試僅能驗證預設排序，無法測試排序切換
- **建議**：MVP 僅支援預設排序即可，排序功能延後

### 2.2 Dashboard 警示 API 端點定義

- **來源**：F016 AC-6
- **問題**：`GET /api/datasources/alerts` 端點的回應已定義，但：
  - 警示是否需要手動確認（acknowledge）機制？
  - 是否需要 Email/通知推送？
  - 警示歷史紀錄是否保留？
- **影響**：測試範圍限於「警示清單查詢」，無法測試警示互動功能
- **建議**：MVP 僅提供查詢功能，acknowledge 與通知延後

### 2.3 角色變更後 Token 行為

- **來源**：F008 BR-4
- **問題**：BR-4 定義「角色變更於 Token 下次刷新或使用者重新登入後生效」，但：
  - 若使用者當前持有 Admin Token，被降級為 User 後：
    - 在 Token 刷新前，是否仍可存取 Admin 端點？
    - 前端是否需要主動觸發 Token 刷新？
- **影響**：無法精確定義角色變更後的過渡期行為測試
- **建議**：根據安全性考量，角色變更後應使舊 Token 失效

---

## 3. 影響測試的架構限制

### 3.1 Scheduler 多實例重複執行

- **來源**：F016 BR-2（每 30 分鐘健康檢查排程）
- **問題**：若後端部署多個實例，每個實例都啟動排程，可能導致：
  - 同一時間對同一資料來源執行多次健康檢查
  - 重複的 health log 記錄
  - 不必要的目標資料庫負載
- **影響**：效能測試結果可能受排程重複執行干擾
- **建議**：使用分散式鎖（如 Database Lock 或 Redis Lock）確保單一執行

### 3.2 AES-256 加密金鑰輪替測試

- **來源**：OQ-4（加密金鑰使用環境變數）
- **問題**：規格未定義金鑰輪替流程：
  - 輪替期間如何處理舊金鑰加密的密碼？
  - 是否需要重新加密所有現有記錄？
- **影響**：無法設計金鑰輪替的測試場景
- **建議**：MVP 可暫不支援金鑰輪替，延後至 Phase 2

### 3.3 JWT Secret 多 Secret 驗證

- **來源**：OQ-11（支援多 Secret 並行驗證）
- **問題**：已決議支援多 Secret，但具體實作未定義：
  - Secret 列表的管理方式？
  - 舊 Secret 的退役策略？
- **影響**：可設計基本的「新/舊 Secret 皆可驗證」測試，但無法驗證完整輪替流程
- **建議**：測試覆蓋「雙 Secret 並行驗證」場景即可

---

## 4. 需要 Mock / Stub 的整合點

| 整合點 | Mock 原因 | 建議 Mock 方式 | 影響的 Feature |
|--------|---------|---------------|---------------|
| MySQL 資料庫 | 測試環境不一定有 MySQL 實例 | Driver Mock 或 Test Container | F015, F016 |
| PostgreSQL 資料庫 | 測試環境不一定有 PostgreSQL 實例 | Driver Mock 或 Test Container | F015, F016 |
| SQL Server 資料庫 | 測試環境不一定有 SQL Server 實例 | Driver Mock 或 Test Container | F015, F016 |
| SMTP / SendGrid | Email 服務不應在測試中實際發送 | Mock Email Service | F009 |
| System Clock | Token 過期測試需快轉時間 | Clock Mock / Fake Clock | F001, F002, F003, F009 |

**詳細 Mock 策略**：請參閱 [test-data-strategy.md](test-data-strategy.md#6-mock-策略)。

---

## 5. 待決問題

### AQ-1：Access Token 儲存位置（高優先級）

- **來源**：F001、F002
- **問題**：JWT Token 儲存在 localStorage、sessionStorage 或 HttpOnly Cookie？
- **測試影響**：
  - localStorage → E2E 測試需操作 localStorage
  - HttpOnly Cookie → E2E 測試無法直接讀取 Cookie
  - 安全性測試需驗證 XSS 無法竊取 Token（Cookie > localStorage）
- **狀態**：待架構師決定
- **建議**：從安全性角度，建議 HttpOnly Cookie

### AQ-2：Token Blocklist 實作方式

- **來源**：F003、data-model.md
- **問題**：OQ-1 決議使用 Refresh Token + 短效 Access Token，但 Token Blocklist 是否仍需要？
  - 若 Access Token 有效期很短（如 15 分鐘），是否可以不維護 Blocklist？
  - 登出時僅撤銷 Refresh Token 是否足夠？
- **測試影響**：決定是否需要 Blocklist 查詢相關的測試場景
- **狀態**：待架構師確認
- **建議**：短效 Access Token + 撤銷 Refresh Token 即可，不需 Blocklist

### AQ-3：密碼重設 Email 內容範本

- **來源**：F009
- **問題**：Email 內容與格式未定義（主旨、正文、重設連結 URL 格式）
- **測試影響**：無法驗證 Email 內容的正確性
- **狀態**：待產品確認
- **建議**：最低需定義重設連結的 URL 格式（如 `{baseUrl}/reset-password?token={token}`）

### AQ-4：API 版本前綴

- **來源**：OQ-13
- **問題**：已決議預留 `/api/v1/` 前綴，但目前所有 Feature 規格的端點路徑為 `/api/`（無版本號）
- **測試影響**：端點路徑不確定，影響所有 API 測試
- **狀態**：待架構師統一
- **建議**：測試設計中使用相對路徑，允許 base path 可配置

### AQ-5：Refresh All 並行上限

- **來源**：F016 AC-7
- **問題**：「Refresh All」平行測試所有資料來源，但未定義：
  - 最大並行連線數？（若有 50 個資料來源，同時開 50 個連線是否合理？）
  - 是否需要 throttle 機制？
- **測試影響**：無法設計並行上限相關的測試
- **狀態**：待架構師決定
- **建議**：設定合理的並行上限（如 10），超過的排隊執行

### AQ-6：Optimistic Locking 實作方式

- **來源**：F006 BR-7、F013
- **問題**：規格建議使用 Optimistic Locking，但未定義：
  - 使用 version 欄位或 updated_at 比對？
  - 衝突時的 HTTP 狀態碼（409 已定義，但 error code 未指定）
- **測試影響**：可設計基本的並發編輯衝突場景
- **狀態**：待架構師確認具體方式

---

## 6. 風險等級摘要

| 風險等級 | 項目 | 說明 |
|---------|------|------|
| **高** | Refresh Token 流程未定義（1.3） | 影響所有驗證相關測試的完整性 |
| **高** | Access Token 儲存位置未定（AQ-1） | 影響安全性測試策略 |
| **中** | Token Blocklist Fail 行為未定（1.1） | 影響故障場景測試 |
| **中** | Scheduler 多實例重複執行（3.1） | 影響 F016 測試的可靠性 |
| **中** | 角色變更後 Token 行為（2.3） | 影響 F008 安全性測試 |
| **低** | Email 重試機制（1.2） | MVP 可暫不處理 |
| **低** | AES 金鑰輪替（3.2） | MVP 不需要 |
| **低** | 帳號清單排序切換（2.1） | MVP 僅需預設排序 |

---

---

## E04 資料擷取模組風險（F017–F025）

> 以下 6 項風險已於規劃階段獲得核准解決方案，解決方案已整合至對應 Feature 測試設計文件。

### E04-RISK-001：排程計時器控制（Clock Control）

- **來源**：F023（排程自動執行）
- **問題**：排程引擎依賴真實時間，無法在測試中精確控制觸發時機，導致測試不穩定或執行速度過慢
- **已核准解決方案**：設計 `scanAndExecute(fakeNow: Date)` 方法，透過 injectable time 參數取代真實時鐘。測試直接呼叫此方法並傳入特定時間點，無需等待真實計時器，完全消除時間相依性
- **影響 Feature**：F023
- **風險等級**：已解決

### E04-RISK-002：非同步執行結果同步（Async Execution Sync）

- **來源**：F021（立即執行／重新執行）
- **問題**：擷取任務採非同步執行（202 Accepted 立即回傳），測試無法確定何時查詢最終狀態，若使用固定 sleep 則不穩定且慢
- **已核准解決方案**：建立純測試工具函式 `waitForTaskStatus(taskId, expectedStatus, timeoutMs=5000)`，以 300ms interval polling ExtractionTask 狀態，達到預期狀態後立即繼續。不需修改任何 production code
- **影響 Feature**：F021
- **風險等級**：已解決

### E04-RISK-003：時區造成測試不穩定（Timezone Flaky）

- **來源**：F018（今日統計）、F024（儀表板今日統計）
- **問題**：「今日成功 / 今日失敗」以 UTC+8（Asia/Taipei）時區計算，若測試種子資料使用固定日期字串，可能在不同時區 CI 環境中計算結果不同，導致測試時好時壞
- **已核准解決方案**：種子資料日期改用 `todayInTaipei()` 工廠函式動態產生，確保相對於當前台北時間。CI 環境設定環境變數 `TZ=Asia/Taipei`
- **影響 Feature**：F018、F024
- **風險等級**：已解決

### E04-RISK-004：無效 range 參數的測試行為未定義

- **來源**：F024（擷取監控儀表板，趨勢圖 range 參數）
- **問題**：原始 F024 規格允許 range 為 7d / 14d / 30d，但未定義傳入非法值（如 60d 或任意字串）時的回應行為，導致無法設計對應的負向測試
- **已核准解決方案（規格補充）**：F024 規格補充：使用 `@IsIn(['7d','14d','30d'])` 白名單驗證。傳入任何不在清單中的 range 值，回傳 HTTP 422，錯誤碼 `VALIDATION_ERROR`。測試場景 TS-F024-009 已依此設計
- **影響 Feature**：F024
- **風險等級**：已解決

### E04-RISK-005：DB 不可用時排程日誌驗證方式

- **來源**：F023（排程掃描期間 DB 不可用）
- **問題**：排程引擎掃描時若 DB 不可用，規格要求「記錄錯誤至日誌」，但無額外的 audit log 系統，且無法透過 API 查詢系統日誌
- **已核准解決方案**：MVP 使用 `Logger.error` 記錄錯誤（NestJS 內建 Logger）。測試使用 `jest.spyOn(Logger, 'error')` 監聽確認被呼叫。無需額外 audit log 系統
- **影響 Feature**：F023
- **風險等級**：已解決

### E04-RISK-006：排程觸發的 ExtractionLog.createdBy 歸屬不明

- **來源**：F023（排程觸發）、F022（日誌查看）
- **問題**：排程自動觸發時，ExtractionLog.created_by 應記錄誰？規格提到「系統帳號或建立者」，但未精確定義，導致測試無法驗證此欄位
- **已核准解決方案（規格補充）**：F023 規格補充：排程觸發時，ExtractionLog.created_by 使用 `task.createdBy`（即該任務建立者的 User ID）。`triggered_by = 'schedule'` 欄位已足以區分排程觸發與手動觸發，無需另設系統帳號。測試場景 TS-F023-002 已依此設計
- **影響 Feature**：F023、F022
- **風險等級**：已解決

---

## Raw Data 落地需求風險（F017 v1.1、F019 v1.1、F021 v1.1、F022 v1.1、F026 v1.0）

> 以下風險來自 2026-03-18 的需求更新（raw data 實際資料落地功能）。

### RAW-RISK-001：動態 DDL 測試環境複雜度高

- **來源**：F021 BR-9（首次執行自動建立 raw data 表）
- **問題**：raw data 表需在 AppDB 動態建立，且結構來自外部 DB 的 `INFORMATION_SCHEMA`。這要求測試環境同時具備「外部來源 DB」與「AppDB」兩個資料庫實例，且需具備 DDL 執行權限（CREATE TABLE、DROP TABLE）。若使用 Transaction Rollback 隔離策略，動態建立的 raw data 表無法在事務中回滾（DDL 是 auto-commit 操作）
- **影響**：F021 TS-F021-011 ~ TS-F021-016；測試執行後 AppDB 中會遺留 raw data 表，可能干擾後續測試
- **建議解決方案**：
  1. 使用雙 Test Container（外部 DB + AppDB）；每個測試套件結束後使用 `DROP TABLE IF EXISTS raw_{task_id_short}` 清理
  2. 每個 F021 raw data 落地測試使用不同的新建任務（確保唯一的 task_id，避免表名衝突）
  3. 不使用 Transaction Rollback 隔離，改用 Database Reset（每套件前重置 AppDB 種子資料）
- **風險等級**：中

### RAW-RISK-002：批次寫入中途失敗的測試難以重現

- **來源**：F021 邊界情況（批次寫入中途連線中斷）
- **問題**：TS-F021-018 需要模擬「第 2 批次寫入時 DB 連線中斷」的場景，但控制外部 DB 連線在特定批次失敗的技術手段複雜：
  - 需要 DB 層面的注入機制（如 DB Proxy 或 Fault Injection）
  - 若使用 Driver Mock，已寫入批次的「保留」行為無法真實驗證
- **影響**：TS-F021-018 的自動化難度高；可能只能做半自動測試
- **建議解決方案**：將 TS-F021-018 設計為「使用 DB Driver Mock，設定第 2 次批次 INSERT 時拋出 ConnectionError；透過 Test Double 驗證 error 被正確處理，extracted_count 停在 1,000」的 Integration 測試。真實批次斷線場景列入手動驗收測試
- **風險等級**：中

### RAW-RISK-003：F026 百萬筆效能測試資料準備成本

- **來源**：F026 效能需求（百萬筆分頁 < 2 秒 / < 5 秒）
- **問題**：TS-F026-PERF-001 ~ PERF-003 需要在 AppDB 建立含 1,000,000 筆資料的 raw data 表。每次 CI 動態建立此資料集耗時過長（PostgreSQL INSERT 百萬筆約需數分鐘），不適合納入 CI Pipeline
- **影響**：效能測試無法自動化，需手動在 QA 環境執行；CI Pipeline 只能跑功能正確性測試
- **建議解決方案**：
  1. 在 QA 環境預先建立效能測試 DB，一次性插入 1,000,000 筆資料（使用 PostgreSQL `generate_series`），持久保存
  2. 效能測試 CI Job 獨立配置，手動觸發（不在 PR 時自動執行）
  3. 在 test-data-strategy.md 第 8.4 節中記錄資料建立腳本
- **風險等級**：中

### RAW-RISK-004：來源表欄位名稱 sanitize 的邊界定義模糊

- **來源**：data-model.md#raw-data-table（欄位名稱安全性）
- **問題**：規格說明「從來源表讀取的欄位名稱需經過 sanitize 處理（僅允許字母、數字、底線）」，但未定義：
  - 含空格的欄位名稱（如 `first name`）：是否替換為 `first_name` 或跳過此欄位？
  - 以數字開頭的欄位名稱（如 `2nd_value`）：是否允許？
  - 含 Unicode 字符的欄位名稱（如中文欄位名）：是否允許？
  - sanitize 失敗時的行為：整個任務 failed？僅跳過該欄位？
- **影響**：TS-F021-SEC-002 的「預期結果」無法精確定義；實作可能與測試預期不符
- **建議**：架構師需補充 sanitize 規則細節；建議方案：含非法字元的欄位名稱 → 以 `col_{index}` 替換（而非跳過）；任務不因此 failed，但 ExtractionLog 記錄 warning
- **風險等級**：高（需在實作前確認，否則 SEC-002 測試場景設計有誤）

### RAW-RISK-005：來源表結構變更重建行為缺少完整定義

- **來源**：F021 邊界情況、F019 BR-6
- **問題**：「來源表結構與現有 raw data 表不匹配時，系統嘗試 DROP + 重建」，但未定義：
  - 觸發條件：任何欄位新增/刪除/型別變更均觸發？還是僅欄位刪除觸發？
  - 重建前是否備份舊資料？（規格暗示不備份，但未明確）
  - DROP 後重建 DDL 失敗的回滾策略：表已 DROP 但新表建立失敗時，raw data 表消失，F026 會回傳 EXTRACTION_RAW_TABLE_NOT_FOUND
- **影響**：TS-F021-015 的觸發條件和預期結果可能不完整；F026 的空狀態場景需考慮「重建失敗後表消失」的 edge case
- **建議**：Architecture 需補充結構不匹配的偵測機制（建議 hash 欄位結構）與重建失敗時的 fallback（保留舊表 + 任務標記 failed，而非 DROP 後失敗）
- **風險等級**：高（影響測試場景設計及 F026 的錯誤處理覆蓋）

### RAW-RISK-006：F026 API 的 `sortBy` 欄位存在注入風險（待確認）

- **來源**：F026 AC-4（欄位排序）
- **問題**：`GET /raw-data?sortBy=field_name` 的 `sortBy` 參數值被用於動態 SQL `ORDER BY` 子句。若實作時直接將 `sortBy` 值拼接進 SQL，可能產生 ORDER BY 注入風險（例：`sortBy=1; DROP TABLE --`）
- **影響**：若未妥善驗證，F026 可能成為 SQL Injection 入口；測試需覆蓋 `sortBy` 注入向量
- **建議解決方案**：
  1. `sortBy` 值應與 `columns`（回應中的合法欄位清單）比對白名單驗證，僅允許已知欄位名稱
  2. 不符合白名單的 `sortBy` 值回傳 HTTP 422，VALIDATION_ERROR
  3. 在 TS-F026 新增 Security 測試：`sortBy=1; DROP TABLE --` → 預期 HTTP 422 或 ORDER BY 被安全處理
- **待決事項**：需確認實作是否採用白名單驗證（優先）或參數化 ORDER BY（僅部分 ORM 支援）
- **風險等級**：高（安全性問題，需在實作前確認）

---

## 連鎖下拉選單需求風險（F017 v1.2、F019 v1.2）

> 以下風險來自 2026-03-18 的需求更新（`sourceTable` 單一欄位 → `sourceSchema` + `sourceTable` 連鎖下拉選單）。

### SCHEMA-RISK-001：外部 DB 連線不穩定對 Schema / Table 載入的影響

- **來源**：F017 AC-8、F019 AC-8（連線失敗時行為）
- **問題**：連線測試（`GET /datasources/:id/schemas`）依賴外部資料庫可用性，但外部 DB 可能因各種原因不可達（逾時、防火牆、認證失敗等）：
  - 若連線持續不穩定，Admin 將無法完成新建或編輯任務的表單（BR-11 明確不提供手動輸入 fallback）
  - 503 錯誤的使用者指引（「請至資料來源設定頁面確認連線設定」）是否能有效引導 Admin 解決問題，尚未驗證
  - 測試環境中「外部 DB 連線失敗」的 stub 策略需確認：是 Mock Datasource Service 層的方法？還是 Mock HTTP 層的回應？
- **影響**：TS-F017-015、TS-F017-016、TS-F019-FE-005 測試的可靠性，需確保「連線失敗場景」可在 CI 中穩定重現
- **建議解決方案**：
  1. Integration 測試：使用 DS_PG_DISCONNECTED 搭配 Test Container，讓 PG container 不啟動或 stub Datasource Service 的 `getSchemas()` 方法拋出 Error
  2. 前端測試：stub GET /datasources/:id/schemas 直接回傳 HTTP 503
  3. 確認 Datasource Service 的 connection timeout 值：若預設逾時過長（如 30 秒），測試會慢；建議在測試環境中注入短逾時（如 2 秒）
- **風險等級**：中

### SCHEMA-RISK-002：不同資料庫類型的 Schema 概念差異影響下拉行為

- **來源**：F017 BR-8、BR-10；架構規格 AD-E04-10
- **問題**：MySQL、PostgreSQL、SQL Server 對「schema」的概念不同：
  - MySQL：`GET /schemas` 回傳 database 列表（無 schema 概念）
  - PostgreSQL：`GET /schemas` 回傳 schema 列表（public, analytics 等）
  - SQL Server：`GET /schemas` 回傳 schema 列表（dbo, sys 等）
  - 若 MySQL 回傳的是「database 名稱」，前端下拉顯示的是「資料庫」而非「schema」，但標籤仍寫「schema」，可能造成 Admin 混淆
  - 各 DB 類型的 `INFORMATION_SCHEMA`（系統 schema）是否應過濾，規格未定義
- **影響**：前端 Schema 下拉的 Label（「Schema」或「Database」？）可能需依 Datasource.type 動態變更；若不區分，可能降低可用性
- **建議解決方案**：
  1. MVP 階段前端統一顯示「Schema」標籤，不依 DB 類型動態切換（簡化實作）
  2. 後端過濾系統 schema（`information_schema`、`pg_catalog`、`performance_schema` 等），僅回傳使用者建立的 schema/database
  3. 在 test-data-strategy.md 第 9.1 節中記錄各 DB 類型的 Mock 回應範例
- **待決事項（需向架構師確認）**：
  - 系統 schema/database 是否過濾？過濾哪些？
  - MySQL 的 `GET /schemas` 是否回傳 database 列表？還是空陣列？
- **風險等級**：中（影響前端顯示與測試資料設計）

### SCHEMA-RISK-003：F019 編輯表單初始化並行 API 請求的錯誤處理邊界

- **來源**：F019 AC-5（編輯表單開啟時同步呼叫兩個 API）
- **問題**：編輯表單開啟時並行呼叫 `GET /schemas` 與 `GET /schemas/:schema/tables`（AC-5 要求「同步呼叫」）。若兩個請求其中一個失敗：
  - 若 GET /schemas 失敗：schema 與 table 下拉均無法預選
  - 若 GET /schemas 成功但 GET /tables 失敗：schema 可預選，但 table 下拉停用
  - 上述兩種失敗情境下，表單的 UI 狀態與使用者引導訊息，規格僅描述「顯示錯誤訊息，schema 與 table 下拉停用」，未區分兩種失敗情境
- **影響**：TS-F019-FE-005 僅涵蓋「schema 載入失敗」場景；「tables 載入失敗但 schemas 載入成功」的複合場景需補充
- **建議解決方案**：
  1. 新增 F019 前端測試場景：GET /schemas 成功（回傳 ["public"]）但 GET /tables 失敗（503）→ 驗證 schema 下拉預選 "public"，table 下拉停用並顯示錯誤
  2. 由 UX 確認：兩個 API 失敗時是否顯示同一條錯誤訊息，還是分別顯示
- **風險等級**：低（邊界情況，MVP 可簡化處理）

### SCHEMA-RISK-004：sourceSchema 欄位為空字串的語義問題

- **來源**：F017 BR-9（`sourceSchema` 視資料庫類型而定，可為空）
- **問題**：API 接受 `sourceSchema` 為選填，可省略或傳空字串。但儲存時「省略」與「空字串」的語義不同：
  - 省略 → null（資料庫不需要 schema 前綴，如 MySQL 直接存取 table）
  - 空字串 `""` → 是驗證錯誤？還是等同 null？
  - F021 執行時，若 `sourceSchema = null` 應如何組合 SQL？（直接 `"table_name"` 而非 `"null"."table_name"`）
- **影響**：TS-F017-006（sourceSchema 省略場景）的預期結果不明確；F021 執行時的 SQL 組合格式需包含 null 場景
- **建議解決方案**：
  1. 後端統一：空字串 `""` 轉換儲存為 `null`（避免「空字串 schema」的無效狀態）
  2. F021 執行邏輯：若 `sourceSchema = null`，SQL 僅使用 `"sourceTable"`；若非 null，使用 `"sourceSchema"."sourceTable"`
  3. 在 test-data-strategy.md 新增 sourceSchema="" 邊界測試值（目前 2.6 節已初步標注「需確認」）
- **風險等級**：低（需在實作前確認，影響 1~2 個測試場景的預期結果）

---

## E05 ETL Pipeline 管理模組風險（F027–F036）

> 以下 8 項風險來自 2026-03-20 的 E05 測試設計過程，整合各 Feature test spec 中 Risks and Notes 提出的問題。

### E05-RISK-001：F029 視覺化編輯器 Transform 節點測試範圍（部分已解決）

- **來源**：F029 AC-7（Transform 節點 JSONB 儲存與還原）
- **問題**：規格定義 13 種 Transform 節點，若每種均設計獨立的 JSONB 結構驗證場景，將產生大量重複且維護成本高的測試。
- **2026-03-31 更新**：Lookup 節點因 US-042 AC-7a~7d 雙輸入重設計，已從採樣策略提升至**獨立覆蓋**（TS-F029-032~037，含前端 E2E 與 Integration 場景；F043 TS-F043-045~058 涵蓋後端 LookupExecutor）。採樣策略調整為：Merge（TS-F029-019）、Filter（TS-F029-020）、Masking（TS-F029-021）+ Lookup（TS-F029-037）。
- **目前狀態**：仍採樣策略，其餘 9 種節點（FieldMapping、Format、Conditional、NullHandler、TypeCast、Deduplicate、String、Aggregate、DerivedColumn）僅依規格文件確認結構。
- **影響**：9 種未採樣節點的 JSONB 結構若與規格定義不符，可能在實作層未被測試發現
- **建議**：①維持採樣策略，要求開發者在 code review 時比對規格；②若日後規格有變動，需將受影響節點加入採樣測試集
- **風險等級**：低（採樣策略已有效降低風險；Lookup 缺口已填補）

### E05-RISK-002：F029 循環連線定義不明確

- **來源**：F029 AC-4 / BR-5（禁止逆向循環連線）
- **問題**：規格描述「禁止逆向循環連線」，但未精確定義「循環」的偵測範圍：
  - 直接循環（A→B, B→A）：規格有 TS-F029-013 明確覆蓋
  - 間接循環（A→B, B→C, C→A）：規格未提及，後端連線驗證邏輯是否包含間接循環未定義
- **影響**：若後端僅驗證直接循環（相鄰節點）而非完整 DAG 拓撲，間接循環可能被接受，導致 ETL 執行時進入無限迴圈
- **建議**：向 Architecture 確認連線驗證演算法是否支援完整 DAG 拓撲分析（非僅相鄰節點比對）；若是，補充間接循環場景（如 3 個節點相互連線）至 F029 測試設計
- **風險等級**：中（影響執行時穩定性）

### E05-RISK-003：F030 processed_count 更新粒度與 execution_count 的排除範圍

- **來源**：F030 BR-7（測試執行不計入 processed_count）
- **問題**：規格明確說明 `is_test_run=true` 的日誌不計入 `EtlPipeline.processed_count`，但未說明：
  - `EtlPipeline.execution_count` 是否也排除測試執行？（规格無此欄位定義）
  - `processed_count` 是在每個節點執行後累加，還是在 Load 節點完成後才更新？
  - 若 Pipeline 執行失敗，已處理的記錄數是否計入 `processed_count`？
- **影響**：TS-F030-008 僅驗證「processed_count 不增加」，但若 execution_count 行為不同，可能漏測
- **建議**：向 Product 確認 execution_count 是否排除測試執行；向 Architecture 確認 processed_count 的更新時機（建議：僅在 status=completed 時更新，失敗不更新）
- **風險等級**：低（功能上不影響核心邏輯，但可能導致統計數字不一致）

### E05-RISK-004：F031 排程引擎同步可測性（Scheduler Engine Testability）

- **來源**：F031 AC-1/AC-2（停用/啟用時排程引擎行為）
- **問題**：F031 規格要求停用時移除排程任務（removeJob）、啟用時重新註冊（addJob/registerJob），但排程引擎（如 Bull、node-cron、NestJS Schedule）不一定支援測試注入（spy/mock）。若排程引擎是全域單例或無法在測試環境替換，TS-F031-002 / TS-F031-004 / TS-F031-006 將無法自動化驗證。
- **影響**：相關場景可能只能驗證 DB 狀態（enabled/status 欄位），無法驗證排程引擎是否實際被呼叫
- **建議**：Architecture 在設計 Pipeline 啟用/停用服務時，將排程引擎依賴設計為可注入的 interface（Dependency Injection）；若無法注入，TS-F031-002/004/006 退為手動整合測試，並補充至 risks-and-gaps.md
- **風險等級**：中（影響 3 個測試場景的自動化可行性）

### E05-RISK-005：F033 Diff API 路由優先順序衝突

- **來源**：F033 AC-3（Diff 比對）
- **問題**：`GET /api/v1/etl/pipelines/:id/versions/diff` 與 `GET /api/v1/etl/pipelines/:id/versions/:versionId` 使用相同的路由前綴。若路由器按定義順序匹配，`"diff"` 字串可能被解析為 versionId（UUID），導致路由到錯誤的 handler，回傳 `PIPELINE_VERSION_NOT_FOUND`（404）而非 Diff 結果。
- **影響**：若路由優先順序錯誤，F033 Diff 端點（TS-F033-006 ~ TS-F033-010）全部失敗，且錯誤訊息為「版本不存在」而非路由問題，難以排查
- **建議**：① 靜態路由（`/diff`）必須在動態路由（`/:versionId`）之前定義；② 實作層驗證路由順序，加入測試備注；③ 若使用 NestJS，Controller 中確保 `@Get('diff')` 裝飾器優先於 `@Get(':versionId')`
- **風險等級**：中（實作層問題，需在 code review 中確認，但測試本身能夠揭露此問題）

### E05-RISK-006：E05 效能閾值未在 NFR 規格中明確定義

- **來源**：test-levels.md E05 NFR Tests（效能閾值）
- **問題**：F035 BR-7 定義「儀表板需在 2 秒內完成載入（50 個 Pipeline 基準）」，但其他 E05 效能需求未在 NFR 規格中明確定義：
  - Pipeline 列表 API（GET /pipelines）的 P95 閾值
  - 排程掃描（scanAndExecute）的執行時間上限
  - 版本 Diff 計算的回應時間上限
  - 大量版本（如 100 個版本）的版本清單查詢效能
- **影響**：無法設計可量測的 NFR 測試場景；test-levels.md 中的效能閾值（列表 P95 < 500ms、排程掃描 < 5 秒）為假設值，非規格定義
- **建議**：請 Architecture / Product 補充 E05 效能需求至 nfr.md；測試設計將依補充後的規格修訂
- **風險等級**：中（NFR 閾值缺失導致效能測試無法量化驗收）

### E05-RISK-007：F036 目標表 ETL 追蹤欄位自動填充的環境依賴

- **來源**：F036 AC-5（ETL 追蹤欄位自動填充）
- **問題**：TS-F036-018 / TS-F036-019 為跨模組 E2E 級測試，需要：
  ① Pipeline 已有合法的已發布版本（含 Load 節點，目標表為 customer_core）
  ② 完整的 ETL 執行環境（外部來源 DB + AppDB + Pipeline 執行引擎）
  ③ 目標表（customer_core）已由 migration 建立
  若任一條件不滿足，這兩個場景無法自動化執行。另外，`data_source` 欄位 nullable=true（AC-5 說「由系統自動填充」），但若 Datasource 名稱未設定，填充值可能為 null，與規格描述矛盾。
- **影響**：TS-F036-018/019 可能只能在完整整合環境中手動執行；`data_source` 欄位的行為需向 Arch 確認
- **建議**：① 先以 Unit Test 驗證 Load 節點注入追蹤欄位的邏輯；再以整合測試驗證完整 Pipeline 執行；② 向 Arch 確認：Datasource.name 為 null 時，data_source 填充 null 還是空字串？
- **風險等級**：中（影響 2 個跨模組場景的可測性）

### E05-RISK-008：F032 / F031 待確認的規格缺口

- **來源**：F032 Risks and Notes；F031 Risks and Notes
- **問題**：以下兩項規格缺口需向 Architecture 確認後才能完成測試場景設計：

  **F032：**
  1. `GET /api/v1/etl/pipelines/:id/logs` 在 Pipeline 已軟刪除時，BR-5 說日誌保留（應回 200），但錯誤碼表定義「不存在或已刪除」回傳 404。規格矛盾，目前 TS-F032-015 以 BR-5 精神（200）為假設，若確認為 404 則需修正
  2. `GET /api/v1/etl/logs/:logId` 的 404 錯誤碼未定義：應為 PIPELINE_LOG_NOT_FOUND（新增）還是複用 PIPELINE_NOT_FOUND？目前 TS-F032-018 預期結果留空待確認
  3. `nodeLogs` 陣列排列順序：依 definition 節點順序，還是依實際執行起始時間？目前 TS-F032-006 假設按執行順序，若不同需調整

  **F031：**
  1. 規格未定義 `running` 狀態 Pipeline 的後端 toggle 防護（前端按鈕停用，但後端是否也拒絕？）
  2. `draft → disabled`（對 draft Pipeline 送出 enabled=false）是否允許？規格未明確

- **影響**：F032 TS-F032-015、TS-F032-018 的預期結果不完整；F031 可能缺少 1~2 個後端防護場景
- **建議**：向 Architecture 確認上述 5 個問題，更新對應測試場景的預期結果
- **風險等級**：中（規格缺口直接影響 5 個測試場景的正確性）

---

## F036 US-049 修訂風險（2026-03-25 新增）

> 以下 5 項風險來自 2026-03-25 US-049「目標表 Domain-Oriented 規劃」重大修訂（目標表由 4 個改為 1 個），更新自 F036-test.md v2.0 的風險章節。

### F036-RISK-001：customer_core 欄位總數已確認為 85 — 已解決

- **來源**：US-049 目標表定義（A~H 分類欄位加總）
- **問題**：原規格標注「約 45 欄位」與實際不符。
- **決議（2026-04-01）**：A~H 分類加總為 85 欄（6+13+10+10+12+14+15+5），以 `target-table-schemas.ts` 為準。TS-F036-003、TS-F036-004、TS-F036-039 預期值已更新為 85。
- **風險等級**：~~中~~ → 已解決

### F036-RISK-002：ETL 轉換規則測試依賴 US-042 與 US-030

- **來源**：US-049 ETL 轉換規則（代碼描述、衝突解決）
- **問題**：
  - **代碼描述轉換**（TS-F036-026/027）：`_desc` 欄位由 US-030 代碼對照表填入。若 US-030 尚未完成，測試時代碼對照表不存在，無法驗證 `_desc` 欄位的正確性
  - **衝突解決**（TS-F036-028/029）：US-049 明確標注「於 US-042 處理」，實際衝突解決邏輯的程式碼位置尚未確認（可能在 US-042 的 Load 節點執行器，或是共用 ETL 服務）
- **影響**：TS-F036-026/027 在 US-030 完成前需以 stub 代碼對照表；TS-F036-028/029 在 US-042 完成前無法執行完整整合測試
- **建議**：①代碼描述測試：在測試環境注入靜態 stub 對照表（e.g., `educationCode["03"] = "大學"`）；②衝突解決測試：向 Architecture 確認邏輯實作位置後，補充對應 Unit Test 或整合測試的設置方式
- **風險等級**：中（影響 4 個測試場景，需等待依賴功能完成）

### F036-RISK-003：佔位電話值的精確定義需確認

- **來源**：US-049 ETL 轉換規則（電話合併：佔位值→NULL）
- **問題**：規格定義佔位值為「如 `00-0000000000`」，「如」暗示可能有其他佔位格式。實際來源資料中是否存在其他佔位值（如全零但格式不同 `0-000000000`、`000-00000000`、空字串等）未定義。若只過濾 `00-0000000000` 精確匹配，其他格式的佔位值將被寫入目標表，造成髒資料。
- **影響**：TS-F036-019/020 的佔位值輸入僅覆蓋 `00+0000000000`，若實際資料有其他佔位格式，測試覆蓋不足
- **建議**：向業務單位確認 ZZIP / MLMC 中電話佔位值的完整清單；將確認後的清單納入 test-data-strategy.md 電話測試資料表
- **風險等級**：中（影響 ETL 資料品質，建議在 UAT 前確認）

### F036-RISK-004：Phase 2/3 表在 Phase 1 不應存在的測試假設 — 已解決

- **來源**：US-049 Phase 擴展規劃；TS-F036-013
- **問題**：TS-F036-013 假設 Phase 1 migration 不建立 `customer_interaction`、`customer_financial`、`customer_service` 三個表。若 Architecture 決定 Phase 1 migration 預先建立所有 4 個表（為未來 Phase 2/3 預留），TS-F036-013 設計的「Phase 2/3 表回 404」場景的前提將失效，且 TS-F036-001（`data.length === 1`）也會失敗。
- **影響**：TS-F036-001 與 TS-F036-013 的正確性取決於 migration 策略
- **決議（2026-03-25）**：Phase 1 migration 只建立 `customer_core` 一張表。TS-F036-001（`data.length === 1`）與 TS-F036-013（Phase 2/3 表回 404）的測試預期值正確，無需調整。
- **風險等級**：~~高~~ → 已解決

### F036-RISK-005：前端欄位對應介面拖曳功能的自動化可測性

- **來源**：US-049 AC-4（欄位對應介面支援拖曳）；TS-F036-033
- **問題**：拖曳（Drag and Drop）操作在自動化測試框架（如 Playwright、Cypress）中的模擬行為與真實使用者拖曳存在差異（觸發事件順序、dataTransfer 物件等）。若拖曳事件實作不標準（如使用自訂 drag 事件而非 HTML5 Drag API），測試框架的 drag-and-drop helper 可能無效。
- **影響**：TS-F036-033（拖曳一對一對應）在 CI 自動化環境中可能不穩定或失敗；可能需要降為手動 E2E 測試
- **建議**：①優先驗證「下拉選單對應」路徑（TS-F036-034），該路徑自動化更穩定；②若拖曳為主要互動方式，需在實作時確認使用 HTML5 原生 Drag API（方便測試框架模擬），並在 test-levels.md 中標注拖曳場景為「手動 E2E 備選」
- **風險等級**：低（替代路徑已覆蓋，拖曳可退為手動測試）

---

## F039 節點欄位變化 Badge + Tooltip 風險

### F039-RISK-001：merge 節點左/右輸入識別方式未定義（阻斷性）

- **來源**：F039 Badge 規格（`左 N + 右 M → K`）、TS-F039-005、TS-F039-017、TS-F039-035
- **問題**：`computeNodeOutputColumns` 在 merge 節點需要區分「左側輸入」與「右側輸入」，以計算各自的欄位數。區分方式可能為：
  - 依 Handle ID（`left-input` / `right-input`）——需要 edges 攜帶 `targetHandle` 屬性
  - 依 edges 陣列中的連接順序——但陣列順序不保證穩定
  - 依節點資料中另存的 `leftSourceId` / `rightSourceId` 欄位
  目前現有的 `pipeline-node.tsx` 定義了 `id="left-input"` 與 `id="right-input"` 兩個 Handle，但規格未確認 edges 是否攜帶 `targetHandle`。
- **影響**：若 merge 節點左/右識別方式錯誤，`左 N + 右 M` 的計數會對調，導致 Badge 文字正確但語意錯誤；TS-F039-005 與 TS-F039-017 無法精確定義期望值
- **建議**：確認 React Flow 的 edge `targetHandle` 欄位在儲存定義時是否被保留；若是，以 `targetHandle === 'left-input'` 區分；若否，需在節點資料中儲存 `leftNodeId` / `rightNodeId`
- **風險等級**：高（阻斷 merge 相關測試場景最終化）

### F039-RISK-002：dropUnmapped=false 時 field_mapping 的欄位重命名行為未定義

- **來源**：TS-F039-003、TS-F039-015（OQ-F039-001 / OQ-F039-002）
- **問題**：規格定義「`dropUnmapped=false` 時透傳」，但未說明：
  - 已設定 mapping 的欄位是否從 `sourceColumn` 改名為 `targetColumn`？
  - 若改名，Badge 文字應顯示 `5 → 5（改名）` 或仍顯示 `5 → 5（-0）`？
  - 若不改名，`targetColumn` 的用途為何？
- **影響**：TS-F039-003 與 TS-F039-015 的預期輸出無法確定
- **建議**：與前端開發確認 `dropUnmapped=false` 的語意，建議明確定義：「`false` = 透傳，mapping 僅作為欄位重命名提示，`sourceColumn` 改名為 `targetColumn`，未設定 mapping 的欄位保持原名」
- **風險等級**：中（影響 2 個測試場景，不阻斷主要路徑）

### F039-RISK-003：Tooltip 邊界定位在 JSDOM 環境無法測試

- **來源**：TS-F039-039（OQ-F039-003）
- **問題**：JSDOM 的 `getBoundingClientRect()` 固定回傳全為 0 的物件，導致邊界定位邏輯（防止 tooltip 超出視窗）在單元/整合測試中無法透過實際計算驗證
- **影響**：TS-F039-039 無法以標準方式驗證 tooltip 不超出視窗邊界
- **建議**：將邊界定位邏輯提取為純函式 `clampToViewport(rect, viewportWidth, viewportHeight)`，直接以單元測試驗證數學計算；元件整合測試以 `vi.spyOn(element, 'getBoundingClientRect')` mock 座標驗證元件行為
- **風險等級**：低（替代測試路徑清晰可行）

### F039-RISK-004：computeNodeOutputColumns 快取策略影響 API 呼叫次數驗證

- **來源**：TS-F039-021（OQ-F039-005）
- **問題**：若 `computeNodeOutputColumns` 實作快取（同一 nodeId 的計算結果快取），則在測試中驗證「`getRawTableColumns` 僅被呼叫 1 次」是有意義的；但若無快取，則在遞迴圖中同一 extract 節點可能被多次計算，測試中的呼叫次數斷言需隨之調整
- **影響**：TS-F039-021 的「getRawTableColumns 僅被呼叫 1 次」斷言可能在無快取情境下誤判為失敗
- **建議**：在實作 `computeNodeOutputColumns` 時確認是否加入 memoization；若加入，測試可驗證 API 呼叫次數；若不加入，則移除此斷言，改為只驗證回傳結果正確
- **風險等級**：低（不影響功能正確性，僅影響測試斷言精確度）

---

## 更新紀錄

| 日期 | 變更內容 | 負責人 |
|------|---------|--------|
| 2026-03-12 | 初版建立，彙整 16 個 Feature 測試設計過程中的風險與缺口 | Test Designer Agent |
| 2026-03-18 | 新增 E04 資料擷取模組 6 項風險（E04-RISK-001 至 E04-RISK-006），均已獲核准解決方案 | Test Designer Agent |
| 2026-03-18 | 新增 raw data 落地需求 6 項風險（RAW-RISK-001 至 RAW-RISK-006）；RAW-RISK-004/005/006 為高風險，需於實作前確認 | Test Designer Agent |
| 2026-03-18 | 新增連鎖下拉選單需求 4 項風險（SCHEMA-RISK-001 至 SCHEMA-RISK-004）；SCHEMA-RISK-001/002 為中風險，001 影響 CI 穩定性，002 影響前端顯示設計 | Test Designer Agent |
| 2026-03-20 | 新增 E05 ETL Pipeline 管理模組 8 項風險（E05-RISK-001 至 E05-RISK-008）；整合自 F027~F036 各 test spec 的 Risks and Notes | Test Designer Agent |
| 2026-03-25 | 新增 F036 US-049 修訂風險 5 項（F036-RISK-001 至 F036-RISK-005）；因應目標表由 4 個改為 1 個的重大規格變更；F036-RISK-004 為高風險（migration 策略假設）需向 Architecture 確認 | Test Designer Agent |
| 2026-03-27 | 新增 F039 節點欄位變化 Badge + Tooltip 4 項風險（F039-RISK-001 至 F039-RISK-004）；F039-RISK-001（merge 左右識別）為高風險，阻斷 merge 相關場景最終化 | Test Designer Agent |
| 2026-03-31 | 新增 Lookup 節點雙輸入重設計測試場景（F029 TS-F029-032~037，F043 TS-F043-045~058）；更新 E05-RISK-001（Lookup 已從採樣策略提升至獨立覆蓋）；新增 LOOKUP-RISK-001~003 | Test Designer Agent |

---

## Lookup 節點雙輸入重設計風險（F029 / F043 / US-042 / US-058）

> 以下 3 項風險來自 2026-03-31 新增 Lookup 節點雙輸入測試設計過程。

### LOOKUP-RISK-001：lookup-input 連線的視覺樣式規格未定義量測基準

- **來源**：TS-F029-033（AC-7b）
- **問題**：規格說明 lookup-input 連線「以對照來源的視覺樣式建立，如虛線或不同顏色」，但未具體指定：①虛線的 CSS 樣式值（如 `strokeDasharray`）；②顏色值（hex 或 token）；③前端驗證方法（Canvas 截圖比對、DOM className 或 CSS variable）
- **影響**：TS-F029-033 的「視覺樣式不同」斷言無法自動化驗證，只能以人工視覺確認或截圖比對工具（如 Percy）實施
- **建議**：向 Architecture/UI 確認 lookup-input edge 的具體視覺規格（className 或 React Flow edgeType），測試改為驗證 DOM className 或 data attribute 而非像素比對
- **風險等級**：低（不影響功能正確性，僅影響自動化覆蓋）

### LOOKUP-RISK-002：向下相容模式 noMatchStrategy 在雙輸入模式下的行為未定義

- **來源**：TS-F043-054 / F043 Section 4.8 規格
- **問題**：規格明確說明雙輸入模式忽略 `noMatchStrategy`（AC-18 / US-058 AC-1），但節點設定 JSONB 中 `noMatchStrategy` 欄位仍存在（向下相容欄位）。如果節點設定同時含有 `noMatchStrategy` 與 `lookup-input` 連線，驗證應：①雙輸入模式強制 LEFT JOIN 語意（所有無匹配列補 null，等同 noMatchStrategy='null'）；②或以 noMatchStrategy 決定行為
- **影響**：若 LookupExecutor 實作未明確忽略 noMatchStrategy，雙輸入模式的行為可能受舊欄位影響，造成不一致結果
- **建議**：TS-F043-054 已設計驗證雙輸入模式完全忽略 DB 查詢，但無法間接驗證 noMatchStrategy 被忽略；建議補充測試：雙輸入模式下設定 noMatchStrategy='skip_row'，驗證無匹配列**仍然保留**（不被跳過）
- **風險等級**：中（設計意圖清晰但實作容易遺漏忽略邏輯）

### LOOKUP-RISK-003：扇出場景（TS-F043-058）依賴 F042 ExecutionEngine 框架完成

- **來源**：TS-F043-058（扇出場景 — 同一 Extract 接多個 Filter 各接不同 Lookup 節點）
- **問題**：TS-F043-058 為整合測試，需要 F042 ExecutionEngine 的拓撲排序、`collectInputs(edge.targetHandle ?? 'default')`、節點狀態回寫均已正確實作，才能有效驗證扇出場景
- **影響**：若 F042 尚未完成，TS-F043-058 無法執行；扇出時 `inputs['lookup-input']` 的路由正確性只能在整合層驗證，單元測試無法覆蓋
- **建議**：①F043 TDD 時先跳過 TS-F043-058，以 TS-F043-045~057 單元測試完成 LookupExecutor 實作；②F042 完成後再補充 TS-F043-058 整合測試；③確認 US-058 Technical Notes 描述的 `collectInputs()` 路由邏輯（`edge.targetHandle ?? 'default'`）已在 F042 測試中覆蓋（TS-F042-xxx 系列）
- **風險等級**：低（有明確的實作與測試順序，非阻斷性風險）

---

## E07 M08 Whitelist-Driven 重構測試風險（2026-05-20 新增）

> 以下 TEST-RISK 項目對應 F050 v2.1 / F051 v2.1 / F076 v1.5 / F068-deprecated 測試設計所識別的風險。
> 覆蓋 GAP-LIST §A~K 中未能完全確定的測試前提。

### TEST-RISK-001：_backfill_empty 標記的實作位置不明確

- **來源**：OQ-TEST-002 解答 / MT-M2-003 / IT-M01-016
- **問題**：`_backfill_empty = true` 的具體儲存位置（獨立 DB 欄位 vs condition_payload metadata vs 其他）在規格中未明確定義。測試設計假設存在可查詢的標記欄位，但實際欄位名稱待 architecture-spec §18.2.12 補充。
- **影響**：IT-M01-016 Step 2 的「查詢 _backfill_empty 標記」驗證步驟需在實作確定後補充具體 SQL
- **建議**：Phase 5 TDD Developer 在 M2 migration 設計時確認欄位名稱，並回報更新 MT-M2-003 / IT-M01-016 預期結果
- **風險等級**：中（影響 2 個場景的具體驗證語句，但不影響整體語意）

---

### TEST-RISK-002：Stage 1 生成 SQL 的攔截方式未確定

- **來源**：IT-M01-009、IT-M01-010、IT-M01-011、IT-M01-012
- **問題**：Stage 1 動態 SQL 生成後，測試無法直接斷言 SQL 字串。驗證需透過：①攔截 ORM query builder log；②查詢 DB 結果（間接驗證）；③在 Service 層注入 SQL spy
- **影響**：若採用間接驗證（查詢結果），測試資料設計複雜度高；若採用 SQL spy，需 Architecture 確認 test seam 位置
- **建議**：優先採用「查詢 staging 結果」間接驗證（確認篩選後 ob_pool_data 筆數符合 SQL 邏輯）；test seam（QueryBuilder spy）作為 Unit 補充
- **風險等級**：中（影響 4 個整合場景的驗證機制，需 Phase 5 決策）

---

### TEST-RISK-003：prod_kind 交集唯一性衝突的確切錯誤碼待確認

- **來源**：IT-M01-018 / TS-F050-013~016
- **問題**：architecture-spec §18.8 定義 prod_kind 交集唯一性規則，但 error-handling.md v1.15 中未見對應錯誤碼。IT-M01-018 斷言「error_code 含 prod_kind 衝突語意」但無法指定確切錯誤碼。
- **影響**：測試 assertion 不完整（只驗 HTTP 409，不驗確切 error_code 字串）
- **建議**：向 Architecture / Product Analyst 確認錯誤碼定義（建議 `PROD_KIND_INTERSECTION_CONFLICT` 或類似）；確認後更新 IT-M01-018 + TS-F050-013
- **風險等級**：中（影響 error contract 驗證完整性）

---

### TEST-RISK-004：M5 migration 測試只能在 staging/CI 執行，不可自動化於 prod

- **來源**：MT-M5-001~006 / AD-E07-18 §18.4.5（M5 高風險）
- **問題**：M5 DELETE ob_code_df 為不可逆操作。自動化測試若不小心在 prod 環境執行，將永久刪除生產資料。
- **影響**：MT-M5-002~006 需要明確的環境隔離機制（如 `NODE_ENV=test` + DB connection guard）
- **建議**：①在 migration test runner 加入環境檢查（reject prod connection string）；②M5 tests 加 `@skip('prod')` 標記；③ CI pipeline 使用獨立 staging Test Container（不連接 prod DB）
- **風險等級**：高（誤執行可能導致生產資料永久損失）

---

### TEST-RISK-005 ✅ Resolved（2026-05-21 v2）：spec_tp 52 筆 / TBL_ID='12'

- **來源**：TS-F076-003 / MT-M3-001
- **問題**（歷史）：`reference/DumpData/OBMCODEDF_20260505.csv` 中 SPEC_TP 對應的 TBL_ID 經歷兩次筆誤更正：v1 寫 `TBL_ID='09'`（實際為 best_case Y/N flag，2 筆）；v1.1 改為 `TBL_ID='02'`（實際為 PROD_KIND 3 筆 / 汽車・機車・一般商品三大類）。
- **解決**（v2 / 2026-05-21）：實際 SPEC_TP 在 `TBL_ID='12'`，共 **52 筆**（含本牌 / 他牌 / 重車 等品牌前綴細分；典型代碼 `01='本牌/新車'` / `11='他牌/新車'` / `42='重車_新車'` / `48='3C通訊家電'` / `99='其他'`）。option_value 取 TBL_CD、option_label 取 TBL_DESC1。MT-M3-001 / TS-F076-003 assertion 已更新為 `count = 52`。m283 v2 hardcoded 52 筆完整清單。
- **風險等級**：✅ 已解除（v2 落地後 assertion 與實際 dump 一致）

---

### TEST-RISK-006：caseyear wildcard 語意（99）的 Stage 1 SQL 生成邊界尚待 Architecture 確認

- **來源**：IT-M01-013、IT-M01-014 / OQ-TEST-001 解答
- **問題**：OQ-TEST-001 解答確認 values 含 99 → 不加 year_cnt 條件。但未確認：①若 values=['99'] 且無其他 categorical 條件，Stage 1 是否生成完全無 WHERE 的 SQL（可能全表掃描）；②values=['99','0'] 時是否正確跳過（而非只跳過 99 的部分）
- **影響**：IT-M01-013/014 的 SQL 攔截驗證需確認「完全無 year_cnt 條件」vs「year_cnt IS NULL 條件」的差異
- **建議**：Architecture 確認 Stage 1 SQL 生成邏輯：caseyear=99 wildcard 時完全省略 year_cnt JOIN/WHERE 子句，而非生成 `year_cnt IS NULL`；若邊界未定義，IT-M01-013 將成為 Architecture 決策的 regression guard
- **風險等級**：中（影響全表掃描效能風險評估）

---

## F100 Stage 2~4 SQL 下推 + v2 真實計分引擎 P3 風險與待決（AD-E07-28 P3）

> 完整風險矩陣（RISK-F100-001~010）見 [features/F100-test.md](features/F100-test.md) §十一。本節僅彙整需 Product / Architecture / tdd 釐清之 **open question**（4 項）與最高優先風險。

### RISK-F100-001（高）：oracle 取錯 → 升級補上的正確分被判 fail

- **問題**：P3 把計分由 v1 簡化版升級為 v2 真實版（customer_core 欄位 v1 回 `''` 不計分 → v2 LEFT JOIN 補上）。若沿用 P1/P2 慣例「跑現行 JS 當 golden oracle」，凡有 customer_core 計分欄位之案件，v1 oracle 會少算該欄權重 → SQL 正確補上反被判 fail。
- **處置**：oracle = 依計分卡規則 + customer_core 屬性**手算之預期值**（F100-test §一矩陣，寫死數字、人複核）。EQ 矩陣每案標 (a) 升級差異 / (b) 下推等價；僅 (b) 案件可對 v1 JS 比對。**禁止以「跑 v1 JS」當 (a) 案件 oracle。**
- **風險等級**：高（取錯 oracle 會讓正確實作全紅，或誤判假綠）

### OQ-F100-T1（待 Architecture / spec 確認）：P3 transaction 範圍未定義

- **問題**：F100 AC-7 只說「可中斷邊界為 list↔list / Stage↔Stage」「冪等延續 F099」，**未明確定義 P3 是否把 Stage 1~4 收進單一 transaction**（失敗即全回滾 vs 各 stage 獨立提交）。呼應 P2 follow-up F-1。
- **影響**：IDEM-003「任一 stage 失敗 → 全 run 0 列 / 回到前狀態」之 rollback 斷言無法確定預期；現 blocked。
- **建議**：spec/AD 明確定義 transaction 邊界後啟用 IDEM-003；現以 IDEM-001（冪等清理）+ IDEM-002（list 邊界）為基準。
- **風險等級**：中（影響失敗回復行為之可測性）

### OQ-F100-T2（待 spec 確認）：score=NULL 時 tier_level 走 fallback 或 NULL

- **問題**：spec 未逐字明列「score=NULL（無 active version）時 tier_level 是否走 `ob_tier.card_level IS NULL` fallback（得 T3）或為 NULL」。現行 JS（L469 `score !== null` 才查 level；L481~483 對 `cardLevel===null` 一律命中 fallback）推導出「score=NULL → tier=T3」。
- **影響**：LEVTIER-004 之 tier 預期值（T3 vs NULL）取決於此；與 LEVTIER-003（score 有值落 level 區間外 → tier fallback T3）構成關鍵 NULL 分歧。
- **建議**：tdd 實作前與 spec 確認並鎖定；本案以現行 JS 推導（T3）為基準。
- **風險等級**：高（NULL 語意混淆會讓 tier 全錯）

### OQ-F100-T3（待 tdd 確認）：customer_core entity / 表尚未存在

- **問題**：P3 LEFT JOIN customer_core 之 entity 在 `apps/api/src/database/entities/` **目前不存在**（僅 data-model.md / F036 定義目標表）。
- **影響**：CJOIN 群組無從 join；P3 前置 blocker。
- **建議**：tdd 須先確認 customer_core 表於月名單分派 PG 庫存在且可 join；缺則先補 entity / 確認 F036 ETL 已產出。
- **風險等級**：高（P3 LEFT JOIN 前置硬性依賴）

### OQ-F100-T4（tdd 交接項，非 blocker）：customer_core 計分欄位精確映射

- **問題**：CUS_SEX / AGE 等 customer_core 計分欄位之精確欄位映射（architecture-spec.md §3.10 對照表）test-designer 無法獨立確定（A-1 載「由 tdd 對齊」）。
- **處置**：F100-test §一矩陣之 customer_core 欄位名 / 分數為**測試確定性 seed**（非生產真值）；tdd 對齊 §3.10 表後同步調整 seed 欄位名，預期數字邏輯不變。
- **風險等級**：低（交接項，不阻擋測試設計）

### RISK-F100-003（高）：st4_exchange 取整誤用 ROUND/FLOOR

- **問題**：legacy SP 用 `ROUND(×0.1)`，現行 JS / spec AC-5 用 `Math.ceil(×0.1)` + 保底 1。OQ-F100-01 裁定對齊 JS（CEIL），下推 SQL 須用 `CEIL`；若誤用 `ROUND`/`FLOOR`，11 件時得 1（應 2）。
- **處置**：EXCH-006（11→2）/ EXCH-004（保底 1）；oracle = `Math.max(1, Math.ceil(n*0.1))`。
- **風險等級**：高（交換數量錯 → 分派結果偏差）

---

## MSSQL 全面遷移 P1a 風險與待決問題（AD-E07-38，2026-07-07 新增）

> 完整測試設計見 [infrastructure/AD-E07-38-P1a-test.md](infrastructure/AD-E07-38-P1a-test.md)。P1（P1a/P1b/P1c）依 AD §3 D-7 裁定跳過 spec-writer——純底層儲存/驅動置換，無新業務行為。本節彙整 P1a 範圍內識別之風險與待決項；P1b/P1c 之風險另由各自測試設計文件記錄。

### R-MSSQL-P1A-01（中）：MSSQL 測試環境無 test-only port/DB 分離，恐污染 dev 資料

- **問題**：既有 PostgreSQL 測試慣例（`docker-compose.test.yml` 之 `postgres-test`）以獨立 port（5433）與獨立 DB（`cdmp_test`）與 dev 用 PostgreSQL（5432/`cdmp`）分離。但現行 `docker-compose.yml` 之 `mssql`/`mssql-init` 服務（P0 已建立）僅建立**單一** `CDMP` 資料庫於 port 1433，供本機 dev smoke 測試使用，**無**對應之 `mssql-test`/獨立 test DB 服務。
- **影響**：若 P1a 之 `.mssql.spec.ts` 直接對此唯一 `CDMP` 資料庫執行 `synchronize:true`（建表/清表），恐與開發者手動操作驗證的資料互相污染；且 CI 若共用同一容器，多次測試執行/並行執行時亦有 race 風險。
- **建議**：比照 `postgres-test` 慣例，於 `docker-compose.test.yml` 新增 `mssql-test` 服務（獨立 port，如 14330）+ 獨立 DB（如 `CDMP_TEST`），或至少於 `mssql-init.sql` 增加建立第二個測試專用資料庫；此決策超出 test-designer 職責範圍（屬 DevOps/CI 基礎設施），已於 `infrastructure/AD-E07-38-P1a-test.md` §零標註，留待 tdd-implementation 落地時與 DevOps 確認。
- **風險等級**：中（P1a 單機驗證尚可接受風險自負，但進入 CI 常態化執行前須解決，否則测试不可重複執行/不可並行）

### R-MSSQL-P1A-02（低，待裁）：未知 `DB_TYPE` 值之隱式 fallback 行為未經明確裁定

- **問題**：AD-E07-38 §3 D-1 之三分支重構 pseudocode，最終仍以無條件 `return {type:'postgres',...}` 作為未匹配 `sqlite`/`mssql` 時的隱式 fallback（註解「過渡期保留至 Phase 6 cutover 才移除」），並非顯式 exhaustive 判斷或主動拋錯。
- **影響**：若使用者將 `DB_TYPE` 誤打成其他字串（如 `'mssq'`），系統會靜默落入 postgres 分支而非提示設定錯誤，可能造成除錯困難（連線目標與預期不符卻無錯誤訊息）。
- **建議**：TS-MSSQL-P1A-REG-003 已設計為「記錄現況」而非斷言此為正確行為；是否需改為顯式 `throw` 或增加設定驗證，留待 tdd-implementation 或後續 AD 修訂裁定，非 P1a 阻擋項。
- **風險等級**：低（現況為既有程式碼既已存在的隱式 fallback 模式之延伸，非本次新增之回歸風險）

### R-MSSQL-P1A-03（低，僅文件可讀性）：AD-E07-38 之 Agent Loading Guide 章節編號與實際標題編號不符

- **問題**：AD-E07-38 開頭 Agent Loading Guide 表寫「Test Designer 需載入 §3、§6（P1a/b/c 切片與 DoD）、§7（不變式）、§8（測試邊界）」，但實際文件標題為 `## 3. 架構決策彙總（D-1~D-7）`（P1a/b/c DoD 其實是 §3 內的 D-6 子節，非獨立 §6）、`## 5. 不變式`（非 §7）、`## 6. 測試邊界`（非 §8）；文件本身無 §8 標題。
- **影響**：僅影響依號碼定位章節的閱讀效率，不影響內容正確性——test-designer 已直接通讀全文並依實際標題內容產出測試設計，未依錯位號碼漏讀或誤讀任何段落。
- **建議**：建議 system-architect 於下次修訂 AD-E07-38 時同步修正 Agent Loading Guide 表之章節號；不阻擋 P1a/P1b/P1c 任何測試設計或實作工作。
- **風險等級**：低（純文件一致性問題）

### OQ-MSSQL-P1A-01（待 tdd-implementation 實測後定案）：`uuidColumnType`/`longTextColumnType` 兩個新 helper 是否需要新增

- **問題**：AD §3 D-1 明確標註「不可假設」——裸 `type:'uuid'` 是否被 mssql driver 正確映射 `uniqueidentifier`、裸 `type:'text'` 是否誤落已棄用之原生 `TEXT` 型別（而非 `nvarchar(max)`），兩者皆須以真實 MSSQL 容器驗證後才能定案，不可憑文件推斷。
- **影響**：若判定需要，`uuidColumnType` 影響 18 處／14 檔（P1b 範圍）、`longTextColumnType` 影響 17 處／13 檔（P1b 範圍）之逐檔改寫工作量；若判定不需要，可簡化 P1b 設計、略過該部分改寫。
- **建議**：P1a 測試設計已提供 TS-MSSQL-P1A-TYPE-001（uuid 探測，使用既有 production `User.id`）與 TYPE-002（text 探測，使用測試專屬合成 probe 表）兩個探測案例，並於 TYPE-007 設計決策關卡；tdd-implementation 執行後應將結論記錄於 implementation-log，供 P1b test-designer 直接引用，不重新探測。
- **風險等級**：中（影響 P1b 工作量估計與測試設計範圍，但有明確探測方法可解，非阻擋性模糊需求）

---

## MSSQL 全面遷移 P1b1 風險與待決問題（AD-E07-39，2026-07-07 新增）

> 完整測試設計見 [infrastructure/AD-E07-39-P1b1-test.md](infrastructure/AD-E07-39-P1b1-test.md)。銜接 P1a（已完成，30 場景），同樣跳過 spec-writer。本節僅記錄 P1b1 範圍內新識別之風險；P1b2/P1b3/P1c 之風險留待各自測試設計文件記錄。

### R-MSSQL-P1B1-01（中，待 CHI 群組實測後定案）：F-4 varchar→nvarchar 若判定需要，為本次 P1 全範圍最大單一不確定工作量

- **問題**：AD §4.4／§10.1 明確標註「實驗先行，不預先假設結果」——若 `TS-MSSQL-P1B1-CHI-001~004` 判定 varchar 中文編碼不符（mojibake），將觸發全庫 varchar→nvarchar 系統性轉換，波及面預估遠大於本輪 47 處 uuid/text/boolean/timestamp 轉換總和（`ob_pool_data`/`ob_pool_data_list` 等寬表單表可達百餘欄）。
- **影響**：若觸發，P1b1 原定範圍（本文件 43 場景）將不足以涵蓋新增工作，需要獨立一輪測試設計（本文件 CHI-DECISION-001 已標出後續測試設計方向，但未實際撰寫）；且若 dev DB 既有資料已在錯誤編碼下寫入，可能需要重新 ETL 抽取而非單純 `ALTER COLUMN`。
- **建議**：`TS-MSSQL-P1B1-CHI-DECISION-001` 已設計決策關卡，兩種結果皆有明確後續行動；tdd-implementation 應**優先執行 CHI 群組**（不依賴其他群組），儘早取得結論以利範圍估算，避免其餘工作進行過半才發現需要大幅擴大範圍。
- **風險等級**：中（有明確探測方法可解，但若觸發則工作量影響為本次 P1 最大，需及早排程因應）

### R-MSSQL-P1B1-02（低，實作評估項）：全 37 表 `synchronize:true` 於 CI 環境之執行時間未經實測，P1a 之 60000ms timeout 未必足夠

- **問題**：P1a 全域 `vi.setConfig({ testTimeout: 60000 })` 僅實測涵蓋 4 表 synchronize；P1b1 全 37 表（含索引、FK、複合鍵）之 synchronize 耗時預期明顯更長，若沿用同一 timeout 未經驗證，可能在 CI 資源競爭下產生 `feedback_pg_spec_parallel_timeout` 教訓所述之偽陽性逾時失敗。
- **建議**：tdd-implementation 落地時應為 P1b1 `.mssql.spec.ts` 之 `beforeAll` 單獨設定更高 timeout（如 120000ms），而非沿用 P1a 全域設定值，見 `infrastructure/AD-E07-39-P1b1-test.md` §零.3。
- **風險等級**：低（純執行環境調校，非邏輯正確性風險）

### R-MSSQL-P1B1-03（低，測試套件自我一致性）：P1a 既有案例 `TS-MSSQL-P1A-CRUD-003b` 因 B1 欄位改名將產生遺留矛盾

- **問題**：`mssql-p1a.mssql.spec.ts` 現有案例斷言 `token_blocklist.token`（2048 字元 nvarchar PK）因 900-byte 索引鍵上限而 INSERT 失敗；B1 完成後該欄位已改名為 `token_hash`（`binary(32)`），此案例若原封不動保留將因參照不存在的欄位而編譯/執行失敗。
- **建議**：`TS-MSSQL-P1B1-REG-003` 已設計處置方案（建議移除並以 `HASH-005` 取代其驗證意圖）；提醒 tdd-implementation 於 B1 落地當下同步處理，避免兩份 `.mssql.spec.ts` 檔案（P1a／P1b1）出現互相矛盾或編譯失敗的殘留案例。
- **風險等級**：低（有明確處置方案，純執行順序提醒）

### OQ-MSSQL-P1B1-01（非阻擋，供未來排程）：`ob-levelcard-version.card_type` 型別不一致（`text` vs 其餘 entity 之 `varchar(5)`）是否本輪一併修正

- **問題**：AD §4.5 順手觀察——`ob-levelcard-version.entity.ts` 之 `card_type` 欄位為既有 PG 版本就存在的型別不一致（語意上是短碼，卻用 `text`），非本次遷移引入。P1b1 套用 `longTextColumnType` 後會變成 `nvarchar(MAX)`，語意浪費但不影響正確性。
- **建議**：AD 已明確列為「非必須」，本文件之 `TS-MSSQL-P1B1-TYPE-003`（longText 矩陣驗證）僅驗證其符合 helper 轉換後的型別正確性，不額外要求改為 `varchar(5)`；若未來排程修正，屬獨立技術債清理項，非 P1b1 範圍。
- **風險等級**：低（非阻擋，明確排除於本輪範圍外）

---

## MSSQL 全面遷移 P1b2 風險與待決問題（AD-E07-39，2026-07-07 新增）

### R-MSSQL-P1B2-01（中，權限約束已查證，非假設）：`cdmp` login 無 `CREATE DATABASE` 權限，parity harness 必須採 schema 隔離而非獨立資料庫

- **問題**：查證 `docker/mssql-init.sql`，`cdmp` login 於 `CDMP`／`CDMP_TEST` 兩個資料庫皆僅被加入資料庫層級 `db_owner` 角色，未獲任何伺服器層級角色（`dbcreator`/`sysadmin`）或 `CREATE ANY DATABASE` 權限。`db_owner` 角色成員資格不隱含 `CREATE DATABASE` 權限。
- **影響**：若 tdd-implementation 直覺採用「建立兩個獨立測試資料庫分別跑 synchronize 與 baseline migration 再比對」的方案，將於真實 MSSQL 容器因權限不足直接失敗（`CREATE DATABASE permission denied`），且此錯誤在本機開發環境不易第一時間聯想到權限問題（容易誤判為連線設定錯誤）。
- **建議**：`infrastructure/AD-E07-39-P1b2-test.md` §零已明確設計為同一 `CDMP_TEST` 資料庫內以 schema 區隔（Path A=`p1b2_sync` 新建 schema／Path B=`dbo` 直接使用資料庫預設 schema），此設計利用「手寫 migration 之 raw SQL 不受 TypeORM `schema` 連線選項改寫、落於連線 session 的 default schema」之特性，恰好不需要任何額外權限即可達成，且與 prod 真實部署路徑（同樣落於 `dbo`）完全一致，非退而求其次的近似方案。
- **風險等級**：中（若不遵循此設計、誤用獨立資料庫方案，會在 tdd-implementation 階段才發現權限問題，浪費一輪實作嘗試）

### R-MSSQL-P1B2-02（中，測試設計品質風險）：Parity comparator 若未經敏感度驗證，「diff 為空」的結論不可信

- **問題**：`INFORMATION_SCHEMA.COLUMNS`/`sys.indexes`/`sys.check_constraints` 兩路徑「diff 為空」的斷言，其可信度完全取決於 comparator 本身是否具備真實的差異偵測能力。一個實作有誤、永遠回傳空陣列的 comparator，會讓所有 PARITY 案例「全部通過」，但完全沒有驗證到任何實質內容。
- **建議**：`TS-MSSQL-P1B2-PARITY-008`（comparator 自我一致性：同源比對必為空）與 `TS-MSSQL-P1B2-PARITY-009`（🔴 comparator 敏感度：人工注入合成差異必須被偵測到非空 diff）已設計為必要的「測試工具本身的測試」，提醒 tdd-implementation **不可省略**此二案例，且應優先於其餘 PARITY 案例確認 comparator 邏輯正確，避免後續案例的「綠燈」建立在不可信的基礎上。
- **風險等級**：中（若省略，後續所有 parity 相關結論的可信度存疑，但不阻擋開發，屬測試設計品質提醒）

### R-MSSQL-P1B2-03（低，環境紀律約定，非程式碼強制）：`dbo` schema 保留慣例依賴人工紀律，CI 平行執行時有交叉污染風險

- **問題**：本輪設計要求 `CDMP_TEST.dbo` 由 P1b2 測試套件獨佔使用（因 baseline migration 的 raw SQL 天然落於 `dbo`），此為約定俗成的紀律（`beforeAll` 前置守門 + `afterAll` 清理），並非資料庫層級的存取控制強制。若未來 CI 將多支 `.mssql.spec.ts` 平行執行於同一 `CDMP_TEST` 資料庫，且新增另一支同樣使用 `dbo` 的測試檔，將產生交叉污染。
- **建議**：目前既有 P1a／P1b1 套件皆已養成「raw SQL 一律明確 schema 前綴」的習慣，不使用 `dbo`，故現況無風險；提醒 DevOps/CI owner 未來新增 MSSQL 測試檔案時遵循此約定，或考慮於 CI pipeline 層級強制 `.mssql.spec.ts` 序列執行（比照既有 F098~F109 `.pg.spec.ts` 序列執行慣例，見 `feedback_pg_spec_parallel_timeout`）。
- **風險等級**：低（現況無實際污染，僅為未來擴充時的提醒）

### OQ-MSSQL-P1B2-01（非阻擋，供 tdd-implementation 裁量）：`down()` migration round-trip（`STATIC-004`）是否本輪納入

- **問題**：AD-E07-39 §8 P1b2 DoD 僅要求「baseline migration 建表成功」與「parity diff 為空」，未明文要求 `down()` 逆向遷移的正確性。`TS-MSSQL-P1B2-STATIC-004` 屬本文件基於 TypeORM migration 標準 up/down 契約額外建議之案例，非 AD 硬性要求。
- **建議**：tdd-implementation 可視工作量權衡是否本輪納入；若延後，應明確記錄為技術債（例如「baseline migration 目前僅驗證 up() 路徑，down() 未經測試」），避免日後需要 revert 時才發現 down() 邏輯有缺陷。
- **風險等級**：低（非阻擋，已於測試設計中明確標註為「建議項，非 AD 硬性 DoD」）

---

## MSSQL 全面遷移 P1b3 風險與待決問題（AD-E07-39，2026-07-07 新增）

### R-MSSQL-P1B3-01（🔴 高，DoD 範圍衝突，決策關卡）：`roles`/`pooldata_field_whitelist`/`pooldata_field_option` 三表資料來源不在 P1b1/P1b2/P1b3 任一輪改動範圍內

- **問題**：AD-E07-39 §8 P1b3 DoD #2 原文要求「參考資料筆數與 PG 版本一致（roles、users、datasource 空殼、whitelist/option、計分卡表、etl_pipelines、extraction_tasks）」。實際逐檔查證後發現：`roles`（admin/user 2 筆）與 `pooldata_field_whitelist`/`pooldata_field_option`（17/186 筆）之資料現況唯一來源為 **PG-only** 之 `apps/api/src/database/migrations/1711360000001-BaselineReferenceData.ts`（`INSERT INTO public.roles (...) VALUES (...) ON CONFLICT (role_code) DO NOTHING` 等 PG 專屬語法），該檔案：(a) 不在 P1b1（entity 型別轉換）範圍；(b) 不在 P1b2（MSSQL baseline migration，經查證僅含 36 `CREATE TABLE` + index + FK，零 `INSERT`）範圍；(c) 不在 P1b3 三支腳本（`seed.ts`/`seed-datasource.ts`/`prod-data-seed.ts`，皆不觸及這三張表）範圍。
- **影響**：即使 P1b3 三支腳本完美改寫、`npm run bootstrap` 對 MSSQL 全流程零錯誤跑通，`roles`/`pooldata_field_whitelist`/`pooldata_field_option` 三表在 MSSQL 側仍會是 **0 筆**，與 DoD #2 文字要求的「筆數與 PG 版本一致」直接矛盾。若 tdd-implementation 未察覺此落差，可能誤判 DoD #2 已達成（因三支腳本改寫本身可以毫無錯誤地完成）。
- **建議**：測試設計已將此落差顯性化為 `TS-MSSQL-P1B3-COUNT-011`／`TS-MSSQL-P1B3-COUNT-012` 兩個「決策關卡」案例（探測性質，預期結果為 0 筆並記錄根因，而非直接判定失敗或强行通過）。需人類（system-architect 或 product owner）decide 其中一條路徑：(a) P1b3 收尾階段新增第四支腳本（例如 `seed-reference-data.ts`）專門移植這三表資料，改寫為可攜 SQL；(b) 追溯修改 P1b2 之 MSSQL baseline migration，於 `up()` 追加這三表的 `INSERT`（需另評估是否違反「P1b2 已 commit 完成」之既定狀態，可能需要新的 migration 檔案而非修改既有檔案）；(c) 明確記錄為已知技術債，DoD #2 範圍縮減為僅六類已驗證表（users/datasource/計分卡 6 表/etl_pipelines/extraction_tasks），另開後續任務處理 roles/whitelist/option。
- **風險等級**：高（直接影響 DoD #2 是否可判定「已達成」；若不處理，MSSQL 上任何依賴 `roles`/`pooldata_field_whitelist`/`pooldata_field_option` 的功能於全新 MSSQL 部署皆無法運作——`roles` 表為空表示系統連基本的 admin/user 角色都不存在，嚴重度高於 whitelist/option）

### R-MSSQL-P1B3-02（中，測試設計品質風險，最高風險轉換站點）：`ob_levelcard_score` 之 NULL 自然鍵分量（`IS NOT DISTINCT FROM`）若轉換有誤，冪等性會在單一表悄然失效

- **問題**：`prod-data-seed.ts` 之 `reconcileTable` 泛用引擎以 `${col} IS NOT DISTINCT FROM $${params.length}` 實作自然鍵存在性判斷（NULL-safe），供六張計分卡表共用。實測 `ob-levelcard-score.json`（449 筆真實生產種子資料）中 **212 筆 `level1=NULL`**、214 筆 `level2_s=NULL`——是全部六表中唯一大量依賴此 NULL-safe 語意的表。若 tdd-implementation 轉換時誤用裸 `=` 取代（`IS NOT DISTINCT FROM` 在 MSSQL 確實不受支援於部分版本，容易被直覺地簡化為 `=`），SQL 標準語意下 `NULL = NULL` 為 unknown（非 true），會導致這 212+214 筆列每次重跑 `data-seed`/`bootstrap` 皆被誤判為「不存在」而重複 INSERT。
- **影響**：此 bug 只會在含 NULL 自然鍵分量的表上出現；其餘 5 張計分卡表（`ob_card_type`/`ob_levelcard_version`/`ob_levelcard_level`/`ob_tier`，其鍵欄位皆非 NULL）與 `ob_levelcard_column` 之 `status` 值欄比對不受影響，會表面正常通過測試，掩蓋 `ob_levelcard_score` 單一表的冪等性失效，且該失效需累積跑第二次 bootstrap 才會被列數異常揭露（第一次全插無法區分正確與錯誤實作）。
- **建議**：`TS-MSSQL-P1B3-SITE-005`（NULL-safe 自然鍵比對）與 `TS-MSSQL-P1B3-IDEM-001`（六表總列數重跑後不變）為必要防線，缺一不可——前者定位問題所在表，後者提供整體冪等性的量化證據。建議轉換方向優先考慮標準 SQL 可攜寫法 `(col = @p OR (col IS NULL AND @p IS NULL))`，三 driver（PG/sqlite/MSSQL）皆可攜、不需 driver-conditional 分支，且行為與 PG 原生 `IS NOT DISTINCT FROM` 完全等價。
- **風險等級**：中高（有明確測試案例防線，但若被跳過，此為典型「測試覆蓋率數字看起來足夠、實際遺漏最關鍵資料表」之陷阱）

### R-MSSQL-P1B3-03（中，Harness 設計限制，升級自 R-MSSQL-P1B2-03）：raw SQL seed 腳本無法透過 TypeORM `schema` 選項隔離，P1b3 與 P1b2 之 `dbo` 獨佔假設產生現實衝突

- **問題**：P1b2 之兩路徑 harness（`p1b2_sync` schema／`dbo`）之所以可行，是因為 Path A 走 TypeORM `synchronize()`（DDL 由 TypeORM 依 `schema` 連線選項動態加前綴）。P1b3 三支腳本的 SQL 全為未加前綴的裸表名字串（`qr.query('... FROM ob_card_type', ...)`），TypeORM 的 `schema` 選項**不會**改寫這類字串——SQL Server 對裸表名一律依登入使用者的 `DEFAULT_SCHEMA` 屬性解析（`cdmp` login 為 `dbo`，且 SQL Server 無等價 Postgres `SET search_path` 之連線期動態覆寫機制）。故 P1b3 之 ALIAS/SITE/BOOT/COUNT/IDEM 五群組**必定**落在 `dbo`，與 P1b2 既有「`dbo` 由其測試套件獨佔保留」的假設直接衝突。
- **影響**：`R-MSSQL-P1B2-03`（該項原評「低風險：現況無實際污染，僅為未來擴充提醒」）在 P1b3 出現後從「理論風險」轉為「現實存在的執行順序需求」——若 vitest 依預設 file-parallelism 平行執行 `mssql-p1b2.mssql.spec.ts` 與 `mssql-p1b3.mssql.spec.ts`，兩者會在同一 `dbo` 同時建表/寫入資料，產生物件已存在錯誤或資料錯亂，且各自「執行前斷言 dbo 為空」的檢查無法攔截平行啟動時間窗內的競爭情況。
- **建議**：新增序列化執行 lane（例如 `npm run test:mssql:serial`，以 `--no-file-parallelism` 或等價 vitest 設定涵蓋全部 `*.mssql.spec.ts`），比照既有 `.pg.spec.ts` 之 F098~F109 序列執行慣例（`feedback_pg_spec_parallel_timeout`）。此為 CI/DevOps 層級的執行順序約定，非測試程式碼本身能防禦（`beforeAll` 之「斷言 dbo 為空」僅能攔截「已髒污」的情況，無法攔截「同時啟動」的競爭情況）。
- **風險等級**：中（若未落地序列化執行，CI 平行跑 MSSQL 測試套件時會產生難以重現的間歇性失敗，且錯誤訊息不易直接聯想到「兩個測試檔案搶同一個 dbo」）

### OQ-MSSQL-P1B3-01（非阻擋，供 tdd-implementation 裁量）：`NOW()`/`IS NOT DISTINCT FROM` 轉換方向——可攜寫法 vs driver-conditional 分支

- **問題**：AD-E07-39 §7 及本文件皆建議「盡量收斂、不製造新分岔」（沿用 B1 token_blocklist 三 driver 統一改 hash 的設計哲學），故 `NOW()`（可改為 JS `new Date()` 綁定參數，三 driver 皆可攜）與 `IS NOT DISTINCT FROM`（可改為 `(col = @p OR (col IS NULL AND @p IS NULL))`，三 driver 皆可攜）理論上都存在不需要 driver-conditional 分支的可攜寫法，但 AD 本身未對 P1b3 這兩處明確裁定「必須可攜」或「允許 driver 分支」。
- **建議**：測試設計已將對應案例（`SITE-004`/`SITE-005`/`SITE-006`/`SITE-007`）設計為行為驗證（檢查資料是否正確寫入/比對是否正確），不綁定特定 SQL 語法字面值，故不論 tdd-implementation 選擇可攜寫法或 driver-conditional 分支，測試都能驗證正確性；但 `TS-MSSQL-P1B3-REG-002`（既有 PG reconcile spec 不回歸）若選擇可攜寫法，需確保 PG 端行為未受影響；若選擇 driver-conditional 分支，需確保未違反本專案既定的「不製造新分岔」設計哲學（僅供留意，非阻擋）。
- **風險等級**：低（不阻擋，測試設計已具容錯彈性）

### OQ-MSSQL-P1B3-02（非阻擋）：`qr.query()` 對 UPDATE 語句於 mssql driver 之回傳形狀未經驗證

- **問題**：`prod-data-seed.ts` 兩處（`labelUpdated += res[1] ?? 0`、`updated += res[1] ?? 0`）依賴 PG driver 對 `qr.query()` 執行 UPDATE 語句時回傳 `[rows, affectedCount]` tuple 之慣例。TypeORM mssql driver（tedious）之回傳形狀本專案未曾驗證，可能非相同 tuple 形狀。
- **影響**：若形狀不同，`res[1]` 恆為 `undefined`（`?? 0` 已防禦不拋錯），僅導致 log 訊息可能恆顯示「0 列修復」即使實際 UPDATE 已成功——純觀測性/除錯體驗落差，不影響功能正確性（UPDATE 本身是否成功由 SITE-007/SITE-008 之資料狀態斷言驗證，不依賴此回傳值）。
- **建議**：`TS-MSSQL-P1B3-PROBE-001` 已設計為探測型案例記錄實際結果；若確認回傳形狀不同，可選擇性改用 `queryRunner.query(sql, params, true)`（TypeORM 部分版本支援 `useStructuredResult` 參數取得統一形狀）或直接改為對受影響列數不敏感的 log 訊息設計，非阻擋，可延後處理。
- **風險等級**：低（非阻擋，純觀測性落差）

---

## MSSQL 全面遷移 P1c 風險與待決問題（AD-E07-38，2026-07-07 新增，P1 最後一片）

### R-MSSQL-P1C-01（高，決策關卡，直接影響 LOCK 群組其餘案例是否可行）：`DECLARE @lockResult INT; EXEC @lockResult = sp_getapplock ...; SELECT @lockResult` 多陳述式批次能否經 TypeORM `manager.query()` 正確取得回傳碼，本專案未曾驗證

- **問題**：AD §3 D-5 之 T-SQL 對應表示範 `EXEC @lockResult = sp_getapplock ...`，此為 T-SQL 之 OUTPUT-style 呼叫慣例，需搭配 `DECLARE`/`SELECT` 包裝成多陳述式批次才能透過 TypeORM 通用的 `manager.query(sql, params)` 取得回傳碼（TypeORM 本身無原生機制直接讀取 stored procedure 的 RETURN 值）。此包裝方式在本專案（含既有 P1a~P1b3 之 MSSQL 測試）從未使用過，其回傳形狀（例如是否確實為 `[{ lockResult: 0 }]`）未經實測。
- **影響**：若此包裝方式行不通（例如 tedious driver 對多陳述式批次的結果集合併行為與預期不同），`personnel-ratio.service.ts` 之 mssql 分支將無法用單純 SQL 字串取得鎖定結果，需改用 `mssql` npm 套件的 `Request.output()` 機制繞過 TypeORM 通用 `.query()`，這會是比純 SQL 字串轉換更大幅度的程式碼改動（引入套件特定 API，脫離現行「一律走 `manager.query()`」的慣例）。
- **建議**：`TS-MSSQL-P1C-LOCK-001` 已設計為前提探測案例，置於 LOCK 群組最前面（其餘 LOCK-002~012 案例之斷言方式依賴此案例的實測結果）；tdd-implementation 應優先執行此案例，儘早確認包裝方式可行性，避免後續案例基於錯誤假設設計/實作。
- **風險等級**：高（若不可行，直接影響 P1c DoD #2 之實作路徑選擇，且發現時機若拖到後期會造成部分已完成程式碼需重寫）

### R-MSSQL-P1C-02（🔴 高，MUST-FIX，現行程式碼真實缺口，非假設性風險）：`personnel-ratio.service.ts` 現行 `isPostgres()` 為二元 gate，`DB_TYPE='mssql'` 在未修改的現行程式碼下會被誤判與 `sqlite` 同路徑「完全跳過鎖」

- **問題**：test-designer 查證 `personnel-ratio.service.ts:565-568`：`isPostgres()` 僅回傳 `dbType==='postgres'||'postgresql'||'pg'`；`tryAutoAdvance` [4a] 現行結構為 `if (this.isPostgres()) { ...走鎖... }`，**無 else 分支**。這代表 `DB_TYPE='mssql'` 目前會被 `isPostgres()` 判為 `false`，與 `sqlite` 落入同一條「完全跳過鎖」路徑，而非呼叫 `sp_getapplock`。
- **影響**：若 tdd-implementation 僅新增一段 `sp_getapplock` 呼叫程式碼，卻未同步把這個二元 gate 改為三分支（`postgres`→advisory lock／`mssql`→`sp_getapplock`／其餘→no-op），新增的 `sp_getapplock` 程式碼會是**永遠不會被觸發的死碼**，`I-MSSQL-LOCK-01` 在 MSSQL 上形同未落地，且不會有任何測試失敗提示此問題（除非測試明確斷言分支確實被呼叫，而非僅驗證最終回傳值形狀）。
- **建議**：`TS-MSSQL-P1C-DISPATCH-001` 已設計為刻意針對「目標狀態」斷言（spy `mgr.query` 呼叫參數含 `sp_getapplock` 字串），對現行未修改程式碼**預期為紅燈**，作為守門測試；tdd-implementation 完成三分支改寫後此案例應轉綠燈。
- **風險等級**：高（若遺漏，P1c 核心目標——MSSQL 上的鎖保護——完全不生效，且此類「新增程式碼但忘記接線」的缺陷極難在 code review 中肉眼發現）

### OQ-MSSQL-P1C-01（決策關卡，AD 文字本身之未驗證宣稱，不預設答案）：`@LockOwner='Transaction'` 前置條件未處於顯式交易時之真實 MSSQL 行為

- **問題**：AD §3 D-5 聲稱「`@LockOwner='Transaction'` 要求呼叫當下必須已在顯式交易內...否則 `sp_getapplock` 直接報錯（可視為額外安全網）」，但此描述在本 AD 內**未標註為已查證事實**，且 test-designer 對 SQL Server 官方文件之 `sp_getapplock` 行為（`@LockOwner='Transaction'` 於隱含單陳述式交易下的實際釋放時機）並無十足把握確認其為報錯而非靜默降級。
- **影響**：若真實行為是「未報錯，僅隱含單陳述式交易結束後立即釋放鎖」而非「直接報錯」，則 `I-MSSQL-LOCK-01` 這個不變式**完全不受資料庫保護**，純粹依賴呼叫端（`tryAutoAdvance`）自律遵守「必須在 `dataSource.transaction()` 內呼叫」的約定；若未來有人在重構時不慎在交易外呼叫此方法，鎖會在單一陳述式後就失去保護效果，且不會有任何錯誤或警告提示，形成難以察覺的併發安全性回歸。
- **建議**：`TS-MSSQL-P1C-LOCK-009` 已設計為探測型決策關卡案例，記錄真實結果並依兩種分支給出後續行動（若報錯→資料庫已提供保護，可不額外處理；若未報錯→`TS-MSSQL-P1C-LOCK-010` 要求新增程式碼層防禦性斷言，如檢查 `queryRunner.isTransactionActive`）；tdd-implementation 應在此案例實測後於 implementation-log 記錄結論，供未來重構此段程式碼者參考，避免重新踩雷。
- **風險等級**：中（若判定為「未報錯」分支且未補防禦性斷言，屬於潛伏性風險，日常運作不會觸發，但一旦觸發後果是併發安全性完全失效且無錯誤提示）

### OQ-MSSQL-P1C-02（低，範圍認知落差，不阻擋 P1c）：`customer_core` 為 PG-only 表，站點 1 之 Pattern B 轉換無法在 MSSQL 上做真正的「資料列等價性」驗證

- **問題**：AD §3 D-5 之站點清單將站點 1（`customer_core` `ANY($1)`）與站點 2（`ob_arreturndf_min_cap` `ANY($1)`）並列，以相同的「低難度，改用 `IN(:...arr)`」描述帶過，未提及兩者之來源表在 MSSQL 遷移範圍內的地位完全不同——`customer_core` 為 AD-E07-37 已裁定之 PG-only 表（無 entity、不在 P1b 全 37 entity baseline、不在 MSSQL baseline migration），而 `ob_arreturndf_min_cap` 已隨 P1b 完整遷移至 MSSQL。
- **影響**：站點 1 的具名參數轉換本身可以完全正確，但因來源表不存在，MSSQL 上永遠只能驗證到「錯誤路徑」（invalid object name），無法像站點 2 一樣驗證「資料列內容/筆數等價」；若 tdd-implementation 或未來讀者未留意此差異，可能誤以為兩站點驗收標準應該相同，或誤判站點 1 測試「覆蓋不足」。
- **建議**：`TS-MSSQL-P1C-PARAM-003` 已明確區分「表不存在錯誤」與「SQL 語法/參數繫結錯誤」兩種失敗模式，僅要求前者、拒絕後者；本文件與 test-index.md 特殊注意段落已記錄此落差，供 tdd-implementation 與未來 Phase 3/4（customer_core 若日後決定遷移至 MSSQL 時）參考。
- **風險等級**：低（不阻擋，測試設計已具備正確的區分邏輯，僅為文件認知落差記錄）

---

## MSSQL 全面遷移 P2a 風險與待決問題（AD-E07-40，2026-07-07 新增，P2 首片）

### R-MSSQL-P2A-01（🔴 高，已查證非假設，本輪最關鍵發現）：TypeORM mssql `DataSourceOptions.pool.max` 預設值為 1，未顯式設定「必然」導致併發 harness 退化為序列化，非僅「可能」

- **問題**：直接查證 `node_modules/typeorm/driver/sqlserver/SqlServerConnectionOptions.d.ts`（`pool?: { max?: number (default=1); ... }`），確認 TypeORM mssql driver 之連線池上限**預設僅 1 條連線**。AD-E07-40 §6.2 原文措辭「若未設定足夠的 pool size，K 個請求**可能**被連線池排隊、變相序列化執行」在本專案的真實情況遠比「可能」更嚴重——任何未明確覆寫 `pool.max` 的 `DataSource`，其 K 個併發 `claimNext()` 呼叫**保證**被序列化（連線池僅 1 條連線可用）。
- **影響**：若 tdd-implementation 未注意到此預設值細節，即使記得「要設 pool.max」也可能誤判「不設定也還好，反正是預設值不是 0」，實際上預設值本身就是最嚴重的退化情境；且若沿用專案內其他既有 `.mssql.spec.ts`（P1a/P1b1/P1b2/P1b3/P1c）目前使用的 `DataSource`（皆未特別設定 `pool.max`，因這些套件從未做過併發測試，沿用預設 1 完全無害），若 CONC 群組不慎重用了那些既有的共用 helper `DataSource` 建構函式而未加上 `pool.max` 覆寫，會直接產生假陽性綠燈且無任何提示。
- **建議**：`TS-MSSQL-P2A-CONC-001`（前置守門，配置斷言）+ `TS-MSSQL-P2A-CONC-006`（🔴 決策關卡，故意以預設 `pool.max=1` 重跑計數斷言證明其無鑑別力，逼出必須依賴 `CONC-004` 時間戳證據的結論）已設計為兩道防線；tdd-implementation 建構 CONC 群組專屬 `DataSource` 時**不可**沿用既有 `.mssql.spec.ts` 之共用 helper 而不覆寫 `pool`，且程式碼註解須明確引用 `I-MSSQL-QUEUE-TEST-CONCURRENCY-01`。
- **風險等級**：高（若遺漏，P2a 全計畫最關鍵的「佇列併發正確性」驗證會是建立在無效基礎上的假陽性綠燈，且此類問題極難在 code review 肉眼發現，只有專門設計的反證案例如 CONC-006 才能揭露）

### R-MSSQL-P2A-02（中，comparator 適用邊界，非既有工具缺陷）：既有 `schema-parity.ts` 索引比對器（`diffIndexSets`/`IndexRecord`）不含 `has_filter`/`filter_definition`，不可直接套用於 `queue_job` 之 filtered vs 一般索引比對

- **問題**：`queue_job` 之 Path A（synchronize，entity `@Index` 產生之一般索引）與 Path B（baseline migration 手寫之 filtered index）**同名**（`idx_queue_job_pending`/`idx_queue_job_active_expiry`）但**欄位組成刻意不同**（見 AD §1：Path A 之 `idx_queue_job_pending`=(queue_name,state)，Path B 之同名索引=(queue_name,created_at) WHERE state='created'）。P1b2 為 36 表「應完全一致」情境設計的 `diffIndexSets`/`IndexRecord` 型別不含 `has_filter`/`filter_definition` 欄位，且比對 key 含欄位組成——若 tdd-implementation 直覺沿用 P1b2 的「`isEmptyComparison(diffIndexSets(...))` 應為 true」模式套用於 queue_job 索引，會得到充滿雜訊、且無法真正捕捉 filtered 屬性差異的誤導性結果。
- **影響**：若未察覺此差異，可能誤判索引比對「有差異就是 bug」而嘗試「修正」成兩路徑完全一致（違背 AD §1 的刻意設計——Path A 為 dev-only 產物，Path B 才是 prod 真實部署的 filtered index，兩者本來就不該相同）；或反過來誤用一個不含 `has_filter` 欄位的比較邏輯，即使 Path B 的 filtered 屬性錯誤（如漏寫 `WHERE` 子句、變成一般索引）也不會被任何測試發現。
- **建議**：`TS-MSSQL-P2A-SCHEMA-010`（決策關卡，文件化守門，程式碼註解引用）已明確要求改用 `TS-MSSQL-P2A-SCHEMA-011`/`SCHEMA-012` 兩組獨立、各自明確斷言欄位組成 + `has_filter` + `filter_definition` 的案例，不對索引集合套用「diff 應為空」判定；若未來其他表也出現「Path A 一般索引／Path B filtered index」的兩軌設計模式，應複用本輪的「獨立斷言」手法而非擴充 `schema-parity.ts` 既有比較器（該比較器的既有語意——兩路徑應完全一致——與 filtered index 場景的設計意圖根本衝突，不宜勉強擴充）。
- **風險等級**：中（若遺漏，索引正確性驗證存在盲區；不影響本輪其餘 SCHEMA/CONC/操作性群組之有效性）

### R-MSSQL-P2A-03（低，範圍缺口記錄，非阻擋）：queue_job baseline migration 之結構驗證改用獨立 `p2a_baseline` schema，未驗證其正確疊加進 `dbo` 既有 36 表 migration 鏈

- **問題**：P1b2/P1b3 之 Path B（baseline migration 驗證）刻意使用 `dbo`（因手寫 migration 之 raw SQL 表名無法被 TypeORM `schema` 選項重新導向，落在連線 session 預設 schema，與 prod 真實部署路徑完全一致）。P2a 為避免與 P1b2/P1b3 既有的「`dbo` 全套 36 表 baseline 建置/清空」流程範圍重疊，改用獨立 `p2a_baseline` schema 程式化呼叫新 queue_job migration 之 `up()`，此法完整驗證了 migration 檔案本身的欄位/filtered index 正確性，但**未驗證**「這支新 migration 檔實際疊加進 `dbo` 既有完整 migration 鏈（P1b baseline + P1b3 reference data）之後，`npm run migration:run` 是否仍能無錯誤地依序執行到底」。
- **影響**：若新 queue_job migration 檔本身有 timestamp 排序錯誤、或與既有鏈某處產生非預期互動（低機率，因新 migration 為 glob 自動載入、不需手動註冊陣列，不同於 P1b1 的 `ALL_ENTITIES` 手動陣列類問題），現有測試設計不會捕捉到；此類問題最終仍會在真正對 `dbo` 執行完整 `npm run migration:run` 時（例如 P2c 整合測試、或實際部署前的 CI 驗證）才會被發現。
- **建議**：非阻擋 P2a，可選擇性由 P2c（或部署前置檢查）追加一次「對已含 P1b baseline + P1b3 reference data 的 `dbo` 疊加執行完整 `npm run migration:run`，確認 queue_job migration 正確接在鏈尾且零錯誤」的字面 CLI 案例（比照 P1b2 BASELINE-001 之呼叫方式）；tdd-implementation 若有餘裕亦可在 P2a 階段順手補上，非強制。
- **風險等級**：低（新 migration 為 glob 自動載入而非手動陣列註冊，出錯機率遠低於已發生過問題的類似場景；且此驗證與 P2a 核心目標——單表結構正確性 + 併發正確性——正交，延後不影響 P2a DoD 本身可否判定達成）

---

## MSSQL 全面遷移 P2b 風險與待決問題（AD-E07-40，2026-07-07 新增，P2 第二片）

### R-MSSQL-P2B-01（🔴 高，本輪最重要發現，與 P1c DISPATCH-001 同型陷阱重演）：`RunQueueProducer.send`/`cancel`／`RunQueueConsumer.onModuleInit` 三處現行程式碼皆為「`this.boss` 是否為 `null`」二元 gate，`DB_TYPE='mssql'` 環境下 `this.boss` 必然為 `null`，與現行 sqlite 測試環境訊號完全相同

- **問題**：直接查證三處現行程式碼——`producer.send()`＝`if (!this.boss) { throw new Error(...) }`；`producer.cancel()`＝`if (!this.boss) return;`；`consumer.onModuleInit()`＝`if (!this.boss) { logger.warn(...); return; }`——皆是「`boss` 是否為 `null`」之二元判斷，無 else if 分支。而 pg-boss 本就不支援 MSSQL，`createPgBoss()` 對非 postgres 環境一律回傳 `null`，故 `DB_TYPE='mssql'` 下 `this.boss` **必然為 null**，與現行測試環境（sqlite，未 override）判斷 `boss` 為 `null` 時的訊號**完全相同、無法區分**。
- **影響**：若 tdd-implementation 只在三處程式碼「內部」新增 mssql 分支邏輯（例如加一段 `if (dbType==='mssql') {...}`）卻未同步把既有二元 gate 本身改為三分支判斷順序，新增的 mssql 分支程式碼可能被放在既有 `if (!this.boss)` 判斷「之後」而變成永遠不會執行到的死碼——mssql 環境下 `send()` 會誤拋出「pg-boss 實例未提供」錯誤（觸發現行防呆訊息，而非真正呼叫 `mssqlQueue.send`）、`cancel()` 會誤靜默 no-op、`onModuleInit()` 會誤 warn+return 完全不啟動輪詢（worker 永遠不消費任何 job，且僅一行 warn log，非常難以察覺，直到有人發現月名單分派卡在 pending 才會回頭排查）。此為 `AD-E07-38-P1c` 之 `DISPATCH-001`（`isPostgres()` 二元 gate 陷阱）在自建佇列子系統的同型態重演，證明此類陷阱在本專案「新增第 N 個 driver 分支」場景具有一定的重複發生率，值得列為通用施工檢查項。
- **建議**：`infrastructure/AD-E07-40-P2b-test.md` 之 `DISPATCH-001~003`（🔴 MUST-FIX）已針對「目標狀態」設計 spy 斷言（驗證呼叫了哪個依賴，而非僅驗證最終回傳值），對現行未修改程式碼刻意設計為紅燈，逼 tdd-implementation 確實把三處二元 gate 改為三分支（先判斷 mssql、再判斷 boss 是否存在，最後才是現行防呆分支）；`DISPATCH-005` 同時守住「未知/sqlite 環境不可被誤判為 mssql」之反向邊界。
- **風險等級**：高（若遺漏，mssql 環境下月名單分派觸發/取消/消費三大功能皆可能靜默失效，且現行程式碼結構下沒有任何自然的執行期錯誤會提示此問題——`onModuleInit` 分支尤其危險，僅記一行 warn log）

### R-MSSQL-P2B-02（🔴 高，test-designer 查證出之 AD 文件本身缺口，非既有程式碼問題）：AD §4.2 檔案改動清單僅列 `assignment-worker.module.ts` 加入 `MssqlQueueService`，未列 `assignment.module.ts`，但 `RunQueueProducer`（mssql 分支之直接依賴）依現行結構註冊於 API 程序

- **問題**：AD-E07-40 §4.2「檔案改動清單」明確只列一處 provider 註冊改動：「`assignment-worker.module.ts` | `providers` 加入 `MssqlQueueService`」。然而查證既有 `f098-static-guards.spec.ts` 之 `TS-F098-WORKER-004`（已鎖定驗證多輪未變）：`RunQueueProducer` 是註冊在 **`assignment.module.ts`**（API 程序），而非 `assignment-worker.module.ts`（worker 程序）；`RunQueueConsumer`/`OrphanReaper` 才是 worker-only。`RunQueueProducer.send()`/`cancel()` 之 mssql 分支需要呼叫 `MssqlQueueService` 的方法，但 AD 文件的檔案改動清單完全沒有提到 API 程序（`assignment.module.ts`）也需要能取得這個依賴。
- **影響**：若 tdd-implementation 字面依照 AD §4.2 清單只改 `assignment-worker.module.ts`，`assignment.module.ts`（API 程序）不會有 `MssqlQueueService` 可注入——`RunQueueProducer` 建構時若採用強制依賴注入（非 `@Optional()`），API 程序啟動會直接因缺少 provider 而崩潰；若採用 `@Optional()` 寬鬆處理，則會在 `DB_TYPE='mssql'` 環境下呼叫 `send()`/`cancel()` 時因該依賴為 `undefined` 而拋出執行期錯誤或靜默失效——不論哪種情形，使用者透過 API 觸發月名單分派（`POST /api/v1/assignment/runs`）這個最基本的操作在 mssql 環境下會直接故障，且問題根源（AD 文件本身遺漏）不容易在 code review 時被發現，因為改動者很自然地會「依 AD 清單逐項核對」而非額外檢查清單本身是否完整。
- **建議**：`infrastructure/AD-E07-40-P2b-test.md` 之 `DISPATCH-006`（🔴 MUST-FIX，新增，非 P2a 涵蓋範圍）已設計為靜態守門，直接掃描 `assignment.module.ts` 之 `providers`/`imports` 是否含 `MssqlQueueService`；此案例對「僅依 AD §4.2 字面清單實作」之版本預期為紅燈。建議 system-architect 於下次修訂 AD-E07-40 時於 §4.2 補上此行（`assignment.module.ts | providers 加入 MssqlQueueService（供 API 程序之 RunQueueProducer mssql 分支使用）`），避免未來 P2c 或其他讀者重新踩雷。
- **風險等級**：高（阻擋性——若未修正，mssql 環境下 API 程序的月名單分派觸發功能直接故障，屬 P2b DoD #3「端對端」案例會自然揭露此問題，但若 tdd-implementation 未跑 E2E 群組、只跑 unit 群組就自認完成，可能會被遺漏；DISPATCH-006 提供更早、更便宜的靜態守門防線）

### R-MSSQL-P2B-03（中，實作細節陷阱，非既有測試/AD 缺陷）：pg-boss 路徑 `job.data` 為已解析物件，mssql 路徑 `claimed.payload`（P2a 已驗證）為原始 JSON 字串，`processPayload` 共用重構時容易漏做 `JSON.parse`

- **問題**：P2a 已驗證 `MssqlQueueService.claimNext()` 回傳之 `payload` 欄位型別為 **`string`**（`queue_job.payload` 欄位存的是 `JSON.stringify(RunJobPayload)`，見 AD-E07-40-P2a-impl.md 與 `TS-MSSQL-P2A-CLAIM-006`）；而 pg-boss 的 `job.data` 是 pg-boss 套件本身已完成 JSON 解析後的物件。`processPayload(jobId, payload)` 若設計為統一接受「已解析物件」形狀（`{runId, ym}`），mssql 路徑的呼叫端（`pollOnce`）**必須**在呼叫 `processPayload` 之前額外執行一次 `JSON.parse(claimed.payload)`，這是 pg-boss 與 mssql 兩條路徑轉接層之間唯一的資料形狀落差，容易在專注於「兩路徑呼叫同一函式」（I-MSSQL-QUEUE-PAYLOAD-UNITY-01）這個大方向時被忽略這個小細節。
- **影響**：若漏做 `JSON.parse`，`processPayload` 收到的 `payload` 參數會是原始字串而非物件，後續 `payload.runId`/`payload.ym` 存取皆為 `undefined`——由於 `processPayload` 內部對 `runId`/`ym` 缺失已有既有防禦邏輯（既有 F098「job payload 不完整」分支：記 log、視為已處理、不拋例外），此 bug 不會讓程序崩潰或拋出明顯錯誤，而是**每一個 mssql 環境下的月名單分派 job 都會被靜默判定為「payload 不完整」並直接略過**，不執行任何 pipeline——是一個會被輕易誤判為「測試通過但功能完全不動」的隱蔽性 bug。
- **建議**：`infrastructure/AD-E07-40-P2b-test.md` 之 `PAYLOAD-008`（🔴）已針對此設計專屬案例，明確以字串形式的 fake `claimed.payload` 驅動 `pollOnce()`，斷言 `processPayload` 收到的是**已還原之物件**而非原始字串。
- **風險等級**：中（若遺漏，功能性影響嚴重——mssql 環境下月名單分派完全不執行——但因表現為「安靜略過」而非崩潰，較難在偶然的手動測試中被發現，屬於需要專屬自動化案例才能可靠捕捉的類型）

---

## MSSQL 全面遷移 P2c 風險與待決問題（AD-E07-40，2026-07-07 新增，P2 最後一片）

### R-MSSQL-P2C-01（中，測試技巧不對稱，非既有程式碼缺陷）：`MssqlQueueService.expireSweep()` 無 injectable `now` 參數，與 `OrphanReaper.reap(now)` 之注入時鐘機制不對稱

- **問題**：P2a 已定案 `expireSweep()` 簽章為 `async expireSweep(): Promise<void>`（`mssql-queue.service.ts:113`），完全不接受任何時間參數，逾時判定一律以 DB 端 `SYSUTCDATETIME()` 為準；而 `OrphanReaper.reap(now: Date = new Date())` 允許呼叫端傳入固定時間直接控制「是否逾時」之判定。P2c 任務指示原文期待「比照 `OrphanReaper.reap(now)` 既有的『注入時鐘』測試慣例」設計 sweep 定時掃描測試，但此慣例**無法直接套用**於 `expireSweep()` 本身。
- **影響**：若 tdd-implementation 或未來維護者誤以為兩者可用同一套 harness 工具（例如嘗試呼叫 `expireSweep(fixedNow)` 傳入參數），會直接因型別不符而編譯失敗；若改為嘗試以 mock 系統時鐘（如 `vi.setSystemTime()`）控制 DB 端 `SYSUTCDATETIME()` 判定，則完全無效（DB 端時鐘不受 Node.js 進程時鐘 mock 影響），可能導致測試設計者誤判「時間控制機制失效」而錯誤地引入真實 `sleep`，拖慢測試套件。
- **建議**：`infrastructure/AD-E07-40-P2c-test.md` §0.3 已明確記錄此不對稱性，RECOVERY 群組統一採 P2a `SWEEP-001` 已驗證之技術——`claimNext()` 後以獨立 SQL `UPDATE ... SET expire_at = DATEADD(SECOND,-N,expire_at)` 直接竄改種子列，避免真實等待。
- **風險等級**：中（純測試設計/技巧層級風險，不影響產品邏輯正確性，但若未及早澄清可能導致下游浪費時間嘗試不可行的 harness 設計，或誤引入真實 sleep 拖慢 CI）

### R-MSSQL-P2C-02（🔴 高，AD 明文授權但需 process 紀律配合）：expire sweep 掛載機制未定案（AD §4.3 明確交 tdd-implementation 依現行風格擇一），若未於 impl log 記錄選擇，未來讀者/下游測試無從得知實際掛載於何處

- **問題**：AD-E07-40 §4.3 原文明確列出兩種掛載方案且不強制擇一：「搭 `OrphanReaper` 既有 `reaperIntervalMs` 定時器一起跑」或「讓 `MssqlQueueService` 自行內部啟動 timer」。這是 system-architect 刻意授權的實作彈性（非遺漏），但也意味著測試設計無法像 P2a/P2b 那樣針對具體 class/method 命名做靜態鎖定守門。
- **影響**：若 tdd-implementation 選定方案後未在 impl log 明確記錄（比照既有 P2b impl log 之 AD-1~AD-4 編號慣例），未來任何需要理解「sweep 何時被觸發」的維護者（含 P2c 之後的 F067 業務驗收、任何排查「殭屍 job 為何未被清理」的 on-call 工程師）需要重新讀程式碼追蹤，缺乏文件錨點；若日後有第二輪重構想要「把兩層回收合併成單一機制」，也需要先知道目前的真實掛載點在哪。
- **建議**：`infrastructure/AD-E07-40-P2c-test.md` 之 `MOUNT-001`（🔴 決策關卡）已明確要求 tdd-implementation 於 `AD-E07-40-P2c-impl.md` 之 Architectural Decisions 段落記錄選擇（建議編號 AD-5，接續 P2b 之 AD-1~AD-4）；MOUNT 群組其餘案例（002~006）皆設計為黑盒 spy 驗證，不因掛載點選擇不同而需要重寫測試。
- **風險等級**：高（若未記錄，不是功能性缺陷，但會累積成長期可維護性負債；由於是「文件紀律」而非「自動化可偵測」的風險，唯一防線是流程要求，故評為高——單純依賴良好意願不足以保證落實）

### R-MSSQL-P2C-03（低，現況記錄，非阻擋）：`docker-compose.yml` `worker:` service 現行**零個** `RUN_QUEUE_*` 環境變數（不僅 `RUN_QUEUE_POLL_INTERVAL_MS` 缺席）

- **問題**：test-designer 直接 grep 查證 `docker-compose.yml`，確認 `worker:` service 之 `environment:` 區塊目前**完全沒有**任何 `RUN_QUEUE_*` 開頭之環境變數——不僅 AD §7 DoD #4 明文要求的 `RUN_QUEUE_POLL_INTERVAL_MS` 缺席，`RunQueueTuning` 其餘 4 個既存欄位（`jobExpireInSeconds`/`reaperIntervalMs`/`orphanThresholdMs`/`cancelPollIntervalMs`，各自皆已在程式碼層支援對應 `process.env.RUN_QUEUE_*` 覆蓋）亦全數未曝露於 compose，prod 部署目前完全依賴程式碼內建之預設值（4 小時 job expire、60 秒 reaper 週期、4 小時 orphan 閾值、0ms cancel poll、2000ms consumer poll）。
- **影響**：若未來需要調整任一佇列參數（例如 AD §9.1 提及之「量測後可能需調整 `pollIntervalMs` 預設值」），目前唯一手段是修改程式碼常數並重新部署映像，而非透過 compose/env 熱調整，運維彈性受限。此非本輪功能缺陷，但為部署一致性缺口。
- **建議**：`infrastructure/AD-E07-40-P2c-test.md` 之 `STATIC-001`（🔴 DoD #4）依 AD 字面範圍僅要求補上 `RUN_QUEUE_POLL_INTERVAL_MS`；`STATIC-004` 為建議性決策關卡，提醒若 P2c 掛載機制引入新的週期設定亦應一併考慮 env 化與 compose 曝露，但明確標註為非阻擋。建議另立小型維運任務（非本輪範圍）一次補齊其餘 4 個既存變數。
- **風險等級**：低（純運維彈性缺口，不影響功能正確性，且已有明確安全的程式碼內建預設值兜底）

### R-MSSQL-P2C-04（低，殘留議題延續，AD §9.2 已記錄）：兩層回收機制（佇列層 `queue_job.state`／業務層 `assignment_run.status`）無自動化一致性告警，若未來任一層邏輯出現 bug 導致兩者長期不一致，目前無監控可偵測

- **問題**：AD-E07-40 §9.2 已明文記錄此殘留議題：「若未來任一層邏輯有 bug 導致兩者不一致（如業務層已標 failed 但佇列層該筆仍卡在 active），目前設計沒有告警機制偵測此不一致」。`infrastructure/AD-E07-40-P2c-test.md` 之 `RECOVERY-004`/`005`（獨立性直接反證）與 `RECOVERY-006`（冪等終態）驗證的是「當前實作邏輯正確時兩者最終會一致」，但不構成「持續監控」——這是測試設計的固有局限（測試驗證邏輯正確性於特定時間點，非提供 runtime 監控能力）。
- **影響**：若未來重構（例如引入第三種佇列狀態、或修改 `OrphanReaper` 閾值邏輯）不慎破壞兩層一致性的隱含假設，現行測試套件會在該次修改的 CI 中捕捉到（因為 `RECOVERY` 群組會重跑），但若該修改恰好未觸發任何既有測試場景之邊界（例如新增了一個測試未涵蓋的中間狀態），則可能在 prod 累積出「業務已標記失敗但佇列殭屍列持續累積」或反向的情形，且無 runtime 告警。
- **建議**：AD §9.2 已列為 P2c 之後的**可選強化項**（非本輪阻擋），例如定期比對兩表狀態一致性的健康檢查。本文件不為此設計額外案例（超出 P2c 明確範圍），僅延續記錄，供未來排入維運看板時參考。
- **風險等級**：低（AD 本身已定性為可選強化、非阻擋；RECOVERY 群組已提供足夠的邏輯正確性驗證作為第一道防線）

### R-MSSQL-P2C-05（低，文件維護提醒，非本輪造成）：`test-index.md` 之「總合計」彙總列（82 files / 2252）與檔案頂部敘述性總數（本輪更新後為 88 files / 2320）已長期不同步

- **問題**：`test-index.md` 涵蓋率表末端存在一個字面「總合計」列（第 226 行附近，`| **總合計** | | | **82 files** | **2252** | |`），此列在 test-designer 本輪介入之前即已與檔案頂部 YAML 前後之敘述性統計數字（本輪之前為 87 files / 2295）存在顯著落差（43 個場景、5 個檔案之差），研判為過去數個版本未同步更新逐表加總所致的既有長期 drift，非本輪 P2c 新增測試設計造成。
- **影響**：純文件可讀性問題——若有讀者直接信任該「總合計」列而非頂部敘述性統計，會得到過時數字；不影響任何測試案例本身之正確性或可執行性。
- **建議**：非本輪範圍（逐表加總核對需要通讀全表 200+ 列，風險與本次任務目標不成比例），僅記錄提醒：未來若有專門的文件整理輪次，應將此列與頂部敘述性統計對齊，或考慮改為由頂部敘述性統計作為唯一權威來源、移除易漂移的重複加總列。
- **風險等級**：低（純文件維護債務，非測試設計或功能缺陷）

---

## MSSQL 全面遷移 P4a 風險與待決問題（AD-E07-41，2026-07-08 新增，P4 首片）

> 完整測試設計見 [infrastructure/AD-E07-41-P4a-test.md](infrastructure/AD-E07-41-P4a-test.md)。P4（ETL 引擎 MSSQL 化）依 AD-E07-41「是否需要 spec-writer」章節裁定跳過 spec-writer——業務轉換規則完全不變，僅置換底層執行機制。本節彙整 P4a（Handler 群組一：extract/field_mapping/derived_field/type_cast/conditional）範圍內識別之風險；P4b/c/d/e 之風險留待各自測試設計文件記錄。

### R-MSSQL-P4A-01（🔴 高，本輪查證出之最基礎未驗證前提）：全部 5 個 handler 私有 SQL 組裝方法內嵌雙引號識別碼，MSSQL BIN collation + tedious driver 是否支援雙引號分隔識別碼語法從未被驗證過

- **問題**：`extract-handler.ts`/`field-mapping-handler.ts`/`derived-field-handler.ts`/`type-cast-handler.ts`/`conditional-handler.ts` 之私有方法（`buildSourceFilterClause`/`toSql`/`resolveCaseWhenSql`/`buildCaseSql`/`resolveWhen`/`resolveValue`）**全數**大量產生 `"${col}"` 形式之雙引號識別碼字面值。AD-E07-41 全文（含 §3.2 逐 handler 改寫要點表）完全未提及識別碼引號風格是否需要轉換為方括號 `[col]`。test-designer 已 grep 本專案全部既有 `*.mssql.spec.ts`（P1a~P2c 全系列），確認**零**案例曾以原始 `queryRunner.query()` 測試過雙引號識別碼語法於本專案實際連線設定（tedious driver 之 `QUOTED_IDENTIFIER` 設定）下是否可行——既有 spike 測試（`mssql-temp-foundation.mssql.spec.ts`/`mssql-temp-foundation-spike2.mssql.spec.ts`）皆使用 `VALUES (...) AS v(id, memo)` 形式之未加引號識別碼，未觸及此問題。
- **影響**：若 MSSQL 預設設定不支援雙引號分隔識別碼，則全部 5 個 handler 產生之 SQL 100% 無法執行（每一條 `CREATE`/`SELECT` 陳述式皆含至少一個雙引號識別碼），影響範圍不僅限於 P4a，將直接擴及尚未設計測試的 P4b（merge/lookup）與 P4c（dedup/target-load，兩者現行 PG 原始碼同樣大量使用雙引號識別碼）。這是比任何個別方言轉換站點（LPAD/正則/cast）更基礎、更高優先權的風險，若未及早驗證，後續所有依賴「僅需替換外層關鍵字」假設所設計之測試與實作皆可能建立在錯誤前提上。
- **建議**：`infrastructure/AD-E07-41-P4a-test.md` 之 `QUOTE-001~003`（🔴 決策關卡）已置於文件最優先位置，要求 tdd-implementation 在展開任何 handler 改寫工作**之前**先執行此探測。若 FAIL，應立即回報 system-architect 更新 AD-E07-41（範圍將擴大至新增一個全域識別碼轉換層，影響 P4a/b/c 全部），不應由 tdd-implementation 自行決定範圍是否擴大或逕行採用權宜寫法。
- **風險等級**：高（若失敗，屬封鎖級發現且影響範圍跨越 P4a/b/c 三個子切片；若通過則零額外成本，QUOTE-003 已為兩種結果分別定義後續行動）

### R-MSSQL-P4A-02（中，AD 建議公式有誤，已由 test-designer 查證並設計 MUST-FIX 守門）：AD §3.2 建議之 LPAD→`RIGHT(REPLICATE(char,n)+col,n)` 轉換公式於輸入字串長度 ≥ n 時與 PG 語意不一致

- **問題**：PG `LPAD(string, length, fill)` 於輸入字串長度已 ≥ 目標長度時，語意為「截斷保留字串**前** length 碼」（例：`LPAD('12345',3,'0')='123'`）。AD-E07-41 §3.2 建議之 T-SQL 等價寫法 `RIGHT(REPLICATE(char,n) + col, n)` 僅正確處理輸入長度 < n 之補零情境；當輸入長度 ≥ n 時，此公式會回傳字串**後** n 碼（例：`RIGHT('000'+'12345',3)` 實際計算為 `RIGHT('00012345',3)='345'`），與 PG 語意方向相反。真實 customer_core pipeline 之唯一 `padStart` 用法為 `padStart(CUSTOM_MK, 2, '0')`（目標長度僅 2），若來源欄位 `CUSTOM_MK` 之實際資料長度曾超過 2 碼，此翻譯錯誤會導致衍生欄位值與 legacy/PG 版本不一致，且此類欄位截斷型 bug 通常不會拋出任何執行期錯誤（無語法錯誤、無型別錯誤），僅產生靜默錯誤資料，極難察覺。
- **影響**：若 tdd-implementation 逐字照抄 AD §3.2 之建議公式而未自行推導完整語意，會產出一個看似合理、單元測試若僅覆蓋「補零」情境（輸入短於目標長度）則完全無法揪出的潛藏 bug。
- **建議**：`infrastructure/AD-E07-41-P4a-test.md` 之 `DERIVED-UNIT-002`（🔴 MUST-FIX，對「逐字照抄 AD 建議公式」之實作預期為紅燈）+ `DERIVED-EQ-001`（🔴 旗艦真實案例，手算 oracle 驗證截斷方向）已設計正確公式：`CASE WHEN LEN(col) >= n THEN LEFT(col, n) ELSE RIGHT(REPLICATE(char,n) + col, n) END`。建議 system-architect 於下次修訂 AD-E07-41 §3.2 時同步修正此建議寫法，避免其餘尚未設計測試的 P4b/c/d 若有類似 padStart 使用場景時重蹈覆轍。
- **風險等級**：中（已有明確測試守門可攔截，且真實 customer_core 資料是否實際觸發此邊界〔`CUSTOM_MK` 是否曾超過 2 碼〕待 P4d 端對端以真實資料驗證，目前僅為程式碼層級之翻譯正確性風險，非已知已發生之資料錯誤）

### R-MSSQL-P4A-03（中，任務書明確點名，已設計對應守門）：`getValidationRegex` 空字串邊界之 T-SQL `LIKE` 「空匹配真值」陷阱

- **問題**：`type-cast-handler.ts` 之 `getValidationRegex` 對 DECIMAL/INTEGER 目標型別使用 PG 正則 `^-?[0-9]+$` 等，`+` 量詞要求至少 1 位數字，故空字串輸入之驗證結果為 `false`（PG `'' ~ '^-?[0-9]+$'` = `false`）。若 tdd-implementation 將此正則 naive 翻譯為 T-SQL `col NOT LIKE '%[^0-9]%'`（字元類別「不存在非數字字元」），此運算式對空字串求值為 **`TRUE`**（空字串中确实不存在任何非數字字元，`LIKE` 為空真式），若未額外補上 `LEN(col) > 0` 守門條件，會導致空字串被誤判為合法整數/小數，與 PG 版行為相反，屬於典型「正則轉字元類別」過程中容易遺漏的邊界陷阱。
- **影響**：若未攔截，空字串輸入之欄位在型別轉換階段會被賦予非預期之數值（如 `0`）而非維持 `NULL`，可能影響下游計分/篩選邏輯對「未填寫」與「填寫為 0」兩種語意的區分。
- **建議**：`infrastructure/AD-E07-41-P4a-test.md` 之 `CAST-EQ-002`（🔴 旗艦案例，任務書原文明確點名此邊界）+ `CAST-EQ-003`（DECIMAL 版）+ `CAST-EQ-005`（純負號 `-` 邊界，同類陷阱）已設計對應真實 MSSQL 驗證案例；`CAST-UNIT-003` 已完成 §5.4 要求之覆核結論——DECIMAL/INTEGER/DATE 三目標型別皆屬簡單字元類別型（無 lookahead、無 alternation），可用 `LIKE`/`SUBSTRING`/`LEN`/`CHARINDEX` 組合達成，另需留意 DATE 正則本身無 `$` 結尾錨點（僅前綴比對，`'9999-99-99'`/`'2024-01-01garbage'` 兩引擎皆應「通過格式檢查」而非被 MSSQL 版意外「改善」為真實曆法驗證，已設計 `CAST-EQ-006`/`007` 防止過度修正）。
- **風險等級**：中（已有明確測試守門可攔截，屬程式碼翻譯正確性風險而非已知已發生問題；DATE 型別於真實 customer_core pipeline 目前未被實際使用，僅 DECIMAL 為兩個 type_cast 節點之真實用法，已於文件附註中說明範圍界定）

### R-MSSQL-P4A-04（高，AD 明文授權但需 process 紀律配合，同型於既往 P2c MOUNT-001/P2b DISPATCH-006）：`##` 暫存表顯式清理呼叫之掛載位置未定案，AD 僅建議「可能位置」

- **問題**：AD-E07-41 §1.3 強制性驗證 (iii) 僅稱「`pipeline-runner.ts` 或個別 handler 於成功與失敗兩路徑皆需有顯式清理呼叫...建議統一收在 `pipeline-runner` 層級 try/finally，或各 handler 自理」——這是系統架構師刻意留給下游決定的實作彈性（AD §1.2 已明文凍結 `pipeline-runner.ts` 本身不可修改，但未言明 `node-output-store.ts` 是否同受此凍結約束）。test-designer 查證 `pipeline-runner.ts` 現行已透過 `NodeOutputStore.cleanupAll(queryRunner)` 在**成功路徑**（`:164`）與**失敗路徑**（`:158`）統一呼叫清理，但該函式現行實作為 PG 專屬 `DROP TABLE IF EXISTS "${table}"` 字面值、無 driver 分支；`node-output-store.ts` 本身不在 AD §1.2 明文列出的凍結清單（僅 `NodeDispatcher`/`node-dispatcher.ts`/`types.ts`/`pipeline-runner.ts` 四者），故理論上可視為天然、唯一已貫穿兩路徑之收斂點，但 AD 未明確指名此檔案即為建議掛載位置。
- **影響**：若 tdd-implementation 未參考此發現，逕自在 5 個 mssql handler 內各自撰寫 try/finally 清理邏輯（AD 建議的另一選項），會產生 5 份重複邏輯（違背 §3.1 建立共用 helper 之初衷精神），且若未來 P4b/c 之 handler 忘記在自己的 try/finally 內補上呼叫，會產生清理遺漏但不易被單一測試檔案發現（因為每個 handler 各自獨立測試時可能都正確，只有整條 pipeline 串接時才會暴露遺漏）。
- **建議**：`infrastructure/AD-E07-41-P4a-test.md` 之 `CLEANUP-001/002`（黑盒 spy，不預設呼叫者位置，比照既有 P2c `MOUNT-002~006` 精神）+ `CLEANUP-003`（🔴 MUST-FIX 決策記錄，要求 impl log 之 Architectural Decisions 段落明確記錄選擇）已設計為不因掛載位置選擇不同而需重寫測試；本文件並建議（非強制）優先評估 `NodeOutputStore.cleanupAll()` 分支方案，理由是該處為現成、天然、已驗證貫穿兩路徑之單一收斂點，可讓 P4b/c 之 handler 完全不需要各自關心清理邏輯。
- **風險等級**：高（同型於 P2c MOUNT-002 之「文件紀律」風險——若未記錄，非功能性缺陷，但會累積成長期可維護性負債；且本案額外疊加「若選擇各自 handler 自理，P4b/c 存在遺漏風險難以被單一 handler 測試檔案發現」之技術風險，故評為高於單純文件紀律問題）

### R-MSSQL-P4A-05（低，現況記錄，非阻擋）：`dbo` schema 獨佔保留慣例已隨 P4 系列事實上擴大適用範圍，若 CI 尚無 `.mssql.spec.ts` 序列化 lane，風險持續疊加

- **問題**：P1b2/P1b3 曾將 `dbo` 定義為「該文件套件獨佔保留 schema」，P2a/P2b/P2c 則刻意另建 `p2a_sync`/`p2a_baseline` 等專屬 schema 避開 `dbo`。P4-0（customer_core 已建於 `dbo`）與本輪 P4a（`extract-handler.ts`/`resolve-raw-table.ts` 之裸表名無法透過 TypeORM `schema` 選項重新導向，比照 P1b3 raw SQL 腳本之同類限制，必須落於 `dbo`）代表「`dbo` 獨佔保留」慣例自 P4 起已事實上延伸為「MSSQL 遷移 P4 全系列（P4-0/P4a/P4c/P4d）共用」，而非僅 P1b2/P1b3 專屬。P1b3 既有 risk（`R-MSSQL-P1B3-03`）已建議「新增序列化執行 lane（比照既有 `.pg.spec.ts` 序列慣例）涵蓋全部 `*.mssql.spec.ts`」，惟未查證此建議是否已被 CI 落實。
- **影響**：若 CI 尚未有此序列化 lane，P4a 之 EXTRACT 群組（新增 dbo 佔用）將再次疊加對同一既有風險的曝險（多個測試套件平行對 `dbo` 進行 DDL 操作可能互相干擾）。
- **建議**：本文件已透過 §0.2 之設計將 `dbo` 佔用範圍限縮至最小（僅 EXTRACT 群組，其餘 4 個 handler 完全以 `##` fixture 繞開，且 raw 表 fixture 採隨機化尾碼命名 + `afterAll` 主動清除縮短佔用時間窗），但根本解法（CI 序列化 lane）超出 test-designer 職責範圍，非本輪新問題，僅延續記錄提醒。
- **風險等級**：低（已有一定程度之範圍限縮設計降低曝險機率，且非本輪新增之根本問題，屬既有已記錄風險之疊加提醒）

### R-MSSQL-P4A-06（低，AD 表格文字範圍低估，已逐檔查證補齊，非阻擋）：AD §3.2 逐 handler 改寫要點表遺漏多個實際存在（部分為高頻使用）之轉換站點

- **問題**：test-designer 逐檔 grep 現行 5 個 PG handler 原始碼及真實 `etl-pipelines.json`（customer_core 53 節點種子資料）後，發現 AD §3.2 表格文字未列出但確實存在之站點：(a) `resolve-raw-table.ts`（`extract-handler.ts` 之直接依賴，含 `$1`/`$2`/`NULLS LAST`/`LIMIT 1` 站點）整份檔案未被提及；(b) `derived-field-handler.ts` 之 `mergePhone()` DSL 函式內嵌 `~ '^0+$'` 正則，經查證 customer_core 53 節點中實際出現 **7 次**（為該 handler 最高頻表達式，多於 AD 唯一提及的 `padStart`，僅出現 1 次）；(c) `derived-field-handler.ts` 之 `gen_random_uuid()` DSL 函式（實際使用 1 次），AD 表格完全未列（僅上層任務書文字有提及，AD 正文本身缺漏）；(d) `field-mapping-handler.ts` 之 `toSqlLiteral()` 對 boolean `defaultValue` 產生裸 `TRUE`/`FALSE` 字面值（T-SQL 不支援，同型於 P1b3 已踩雷之「裸布林字面值」），AD field_mapping 列完全未提及 `defaultValue` 轉譯邏輯本身。此為本專案 MSSQL 遷移系列第 N 次出現「AD 對 raw SQL 改寫範圍之風險評估低估實際範圍」，與 P1b3（低估 5 類站點）、P1c（低估兩站點可測性差異）同型態重演。
- **影響**：若 tdd-implementation 僅依 AD §3.2 表格文字逐項改寫，會遺漏 (a)~(d) 四處，其中 (b) `mergePhone` 正則因高頻使用（7/12 derived_field 表達式）若遺漏將導致 P4d 端對端測試大量失敗，屬於高可見度但易被表格文字遺漏的風險。
- **建議**：`infrastructure/AD-E07-41-P4a-test.md` 已將此四處逐一納入對應群組（EXTRACT-RESOLVE 子群組、DERIVED-UNIT-003/EQ-004~008、DERIVED-UNIT-005/EQ-009、FIELDMAP-UNIT-004），已足以在 P4a 階段攔截；建議 system-architect 於下次修訂 AD-E07-41 §3.2 時同步補列此四處，避免影響尚未設計測試之 P4b/c 若有類似「表格文字未窮盡私有方法內嵌轉換站點」之遺漏模式。
- **風險等級**：低（已於本輪測試設計完整補齊，不構成 P4a 阻擋；記錄用意在於提醒此為本專案 MSSQL 遷移系列之可預期重演模式，供未來子切片測試設計時優先主動 grep 覆核，而非僅信任 AD 表格文字定範圍）

---

## MSSQL 全面遷移 P4b 風險與待決問題（AD-E07-41，2026-07-08 新增，P4 第二片）

> 完整測試設計見 [infrastructure/AD-E07-41-P4b-test.md](infrastructure/AD-E07-41-P4b-test.md)。本節彙整 P4b（Handler 群組二：merge/lookup，含 `UPDATE...FROM` 重構）範圍內識別之風險；P4c/d/e 之風險留待各自測試設計文件記錄。

### R-MSSQL-P4B-01（🔴🔴 最高，本輪查證出之最基礎、保證失敗的未提及站點）：`lookup-handler.ts` 之 `ALTER TABLE ADD COLUMN IF NOT EXISTS ... TEXT` 為 T-SQL 保證語法錯誤，AD 與任務書皆完全未提及

- **問題**：`lookup-handler.ts` 於 `null`/`skip_row`/`default_value` 三種 `noMatchStrategy` 分支皆執行 `ALTER TABLE "${inputTable}" ADD COLUMN IF NOT EXISTS "${alias}" TEXT`（每個 outputColumn 一次）。T-SQL `ALTER TABLE` 新增欄位語法為 `ALTER TABLE t ADD col_name data_type`——**不接受 `COLUMN` 保留字於此位置，亦無 `IF NOT EXISTS` 子句**（PG 9.6+ 專屬語法糖，SQL Server 從未支援）。且目標型別 `TEXT` 為 SQL Server 已棄用型別，與後續 `TRIM`/字串比較操作相容性差。test-designer grep `apps/api/src/database/seeds/data/etl-pipelines.json` 確認真實 customer_core pipeline **31 個 lookup 節點、每節點恰 1 個 outputColumn**，即完整月名單分派會執行 31 次此陳述式。AD-E07-41 §3.2 lookup-handler 列僅提及「`UPDATE...FROM` 重構」「`::text`→`CAST`」「`DELETE...WHERE NOT EXISTS` 不需改」三點，**完全未提及此 `ALTER TABLE` 站點**；上層任務書同樣僅點名 `UPDATE...FROM` 重構，未提及此站點。
- **影響**：若 tdd-implementation 僅依 AD §3.2 表格文字與任務書逐項改寫，會完全遺漏此站點——這不是語意風險（如 `UPDATE...FROM` 翻譯錯誤仍可能「恰好」執行但結果錯誤），而是**保證編譯期/執行期語法錯誤**，一旦觸及即 100% 崩潰，且是本切片測試覆蓋率要求最高的 handler（lookup，31 個真實節點）之**每一次呼叫**皆會觸發的必經路徑。風險優先權高於任務書已明確點名的 `UPDATE...FROM` 重構本身。
- **建議**：`infrastructure/AD-E07-41-P4b-test.md` 已將此站點獨立立為文件最優先章節（§一 ALTERCOL，8 個案例）：`ALTERCOL-UNIT-001~003`（🔴 MUST-FIX，分別鎖定「不得含 `ADD COLUMN`」「不得含 `IF NOT EXISTS`」「型別須為 `NVARCHAR(MAX)` 非裸 `TEXT`」）+ `ALTERCOL-GATE-001`（🔴 決策關卡，欄位存在性冪等檢查之實作位置——JS 端 `getMssqlTempTableColumns` 預查 vs SQL 端條件式 `IF NOT EXISTS (SELECT...) BEGIN...END`——不預設答案，要求 impl log 明確記錄）+ `ALTERCOL-MSSQL-001~003`（真實 MSSQL 執行 + 冪等性 + 多欄位鏈式新增規模驗證）+ `ALTERCOL-TRAP-001`（陷阱佐證，手動組裝 naive SQL 對真實 MSSQL 執行證實拋錯，非假設性風險）。強烈建議 system-architect 於下次修訂 AD-E07-41 §3.2 時同步補列此站點，並建議未來若有 P4c（`target-load-handler.ts` 之兩段式 UPDATE/INSERT）等其餘 handler 若有類似「動態欄位新增」模式，優先查證是否有同型 `ADD COLUMN IF NOT EXISTS` 陷阱。
- **風險等級**：高（已有明確測試守門可完整攔截，非阻擋 P4b 本身；記錄為「高」而非「中」是因為此站點的失敗機率遠高於其餘查證站點——不需要特定邊界輸入即會觸發，只要 lookup 節點被執行就必然觸及，且完全未被 AD/任務書提及，若無 test-designer 主動 grep 查證，極可能被下游完全遺漏至 P4d 端對端測試才被發現，屆時除錯成本遠高於 P4b 階段單元測試層級)

### R-MSSQL-P4B-02（🔴 高，任務書明確點名，本輪查證出具體翻譯陷阱）：`UPDATE...FROM` 重構——PG 目標別名「就地宣告」語法為 PG 特有，逐字翻譯會拋 `Invalid object name`

- **問題**：PG `UPDATE "${inputTable}" _src SET ... FROM (${lookupSubQuery}) _lk WHERE ...` 中，`_src` 是**於 `UPDATE` 子句內就地宣告的別名**——這是 PostgreSQL 特有語法糖，UPDATE 目標不需要另外列於 `FROM` 子句。T-SQL 的 `UPDATE` 陳述式**沒有**這種「目標別名可於 SET 子句前就地宣告」的語法；若 tdd-implementation 僅替換 `::text`→`CAST` 等表面方言關鍵字、保留 `UPDATE _src SET ... FROM (subquery) _lk WHERE ...` 這個結構本身（即把 `"${inputTable}"` 換成 `##${inputTable}` 但未把它併入 `FROM`），T-SQL 會因為 `_src` 從未經任何 `FROM`/`JOIN` 宣告而在編譯期拋出 `Invalid object name '_src'` 或 `Must declare the scalar variable "_src"`。正確改寫需將 target 顯式併入 `FROM`/`JOIN`：`UPDATE _src SET ... FROM ##input AS _src JOIN (subquery) AS _lk ON <原 WHERE 條件>`。
- **影響**：此 `UPDATE...FROM` 陳述式是 `noMatchStrategy='null'` 分支（真實 customer_core 100% 使用之唯一分支）與 `skip_row` 分支共用的核心骨幹，若翻譯錯誤，31 個 lookup 節點全數崩潰，且錯誤發生在 handler 執行期（非 TypeScript 編譯期），只有跑到真實 MSSQL 連線時才會浮現。除了「目標別名未宣告」這個保證失敗的陷阱外，即使正確改寫，仍需額外驗證 JOIN 條件是否忠實對應原 `WHERE` 之 TRIM 雙邊比對邏輯（避免笛卡兒積或漏判），任務書已明確點名此風險。
- **建議**：`infrastructure/AD-E07-41-P4b-test.md` §二 UPDATEFROM（10 個案例）已設計 `UPDATEFROM-UNIT-001`（🔴 MUST-FIX，目標別名須於 FROM 宣告）+ `UPDATEFROM-TRAP-001`（🔴 陷阱佐證，手動組裝 naive SQL 對真實 MSSQL 執行證實拋錯）+ `UPDATEFROM-EQ-001`（🔴 旗艦案例，多列 lookup 來源逐列取得正確對應值，防笛卡兒積核心）+ `UPDATEFROM-EQ-003`（`lookupFilter` 誤配防禦，25/31 真實節點使用此欄位）等 6 個真實 MSSQL EQ 案例。
- **風險等級**：高（已有明確測試守門可攔截，且任務書已預先點名此風險方向，本輪查證進一步精確化「究竟會怎麼失敗」與「正確改寫的具體形狀」，降低 tdd-implementation 摸索成本）

### R-MSSQL-P4B-03（中，真實資料查證：三個分支/模式於真實 pipeline 0% 觸發，測試密度應相應調整）：`lookup-handler.ts` 之 dual-input mode、`skip_row`、`default_value` 三者於真實 customer_core pipeline 完全未被使用

- **問題**：test-designer grep `etl-pipelines.json` 之 31 個 lookup 節點設定，確認：(a) 全部 31 個節點 `data.lookupRef` 皆有值且無任何節點之上游邊連接至 `lookup-input` handle → **100% legacy mode**，dual-input mode 於真實 pipeline 0% 觸發；(b) 全部 31 個節點 `noMatchStrategy` 欄位皆為 `'null'`（或未設定、走預設）→ `skip_row`（`INNER JOIN` + `DELETE...WHERE NOT EXISTS`）與 `default_value` 兩分支 0% 觸發。
- **影響**：若測試設計對三者投入與 `null` 分支同等密度，會誤導資源分配——`null` 分支（LEFT JOIN 語意，經 `UPDATE...FROM` 重構之核心路徑）才是 P4d 端對端測試會真實驗證、且真實月名單分派會執行的路徑，理應獲得最高測試密度與最多真實 MSSQL EQ 案例；另外三者若完全不覆蓋則存在「未來若其他 pipeline 用到這些分支才第一次發現破損」之風險，但過度投入亦非高效資源分配。
- **建議**：`infrastructure/AD-E07-41-P4b-test.md` 已比照 P4a `FIELDMAP-UNIT-004`（boolean defaultValue 防禦性覆蓋）之既定精神分層——`null` 分支獲得 §二 UPDATEFROM 全部 EQ 案例 + §八 LOOKUP-EQ 之 5 個真實代表情境案例（仿真實 `lk_edu1`/`lk_hcity` 節點設定）；`skip_row`/`default_value`/dual-input 三者僅設計 UNIT 文字結構驗證 + 各保留 1~3 個真實 MSSQL 執行案例證明語法正確可執行（`SKIP-MSSQL-001~003`/`DEFAULT-MSSQL-001`/`LOOKUP-UNIT-003`），不視為 P4d 端對端可自然覆蓋之路徑。
- **風險等級**：中（非功能性缺陷，屬測試資源分配之設計決策；若未依真實資料查證盲目均攤測試密度，會在有限開發時程下錯置驗證重點於低價值路徑）

### R-MSSQL-P4B-04（中，真實資料查證，已設計旗艦案例）：真實 4 個 merge 節點 100% 為同名 key（`sameKeyName=true`）且含鏈式合併（`m2→m3`），`sameKeyName=false` 分支 0% 觸發

- **問題**：test-designer grep `etl-pipelines.json` 之 4 個 merge 節點（`m1`~`m4`）設定，確認全部 `conditions[0].leftColumn === conditions[0].rightColumn`（`CUSTO_NO`/`CUSTID`×2/`source_customer_no`），即 100% 為 `sameKeyName=true` 之 COALESCE + `_left`/`_right` 衍生欄位路徑。其中 `m2`（`CUSTID` merge）之輸出直接作為 `m3`（同樣以 `CUSTID` merge）之左輸入，形成鏈式合併——`merge-handler.ts` 現行已有「Skip upstream `_left`/`_right` key columns」之防禦邏輯（避免 `m3` 重複處理 `m2` 產生的衍生欄位而衝突），此邏輯之 mssql 版正確性（欄位清單改由 `getMssqlTempTableColumns` 取得後）**必須**在真實 MSSQL 環境下以真實對應之鏈式情境驗證，因為此類「上游衍生欄位需被跳過」的邏輯錯誤不會拋出任何語法錯誤，只會靜默產生重複/衝突欄位或錯誤覆蓋值。
- **影響**：若 mssql 版之欄位清單改由 `getMssqlTempTableColumns` 取得後，該防禦邏輯的字串比對（`col === '${leftKey}_left'`）因大小寫或欄位順序差異而失效，會在 P4d 端對端測試（真實觸及 `m2→m3`）產生難以追溯根因的欄位污染，且因是 4 個真實 merge 節點中唯二構成鏈式關係者，此風險並非邊界情況而是**必經路徑**。
- **建議**：`infrastructure/AD-E07-41-P4b-test.md` 之 `MERGE-EQ-005`（🔴 旗艦案例）已設計專門模擬 `m2→m3` 真實鏈式場景之真實 MSSQL 驗證，斷言 `m3` 輸出既不含 `m2` 殘留之 `_left`/`_right` 衍生欄位，也正確產生 `m3` 自身這一層新的 `_left`/`_right` 衍生欄位。`sameKeyName=false` 路徑（`MERGE-EQ-006`）列為防禦性覆蓋，測試密度低於此旗艦案例。
- **風險等級**：中（已有明確旗艦測試案例可攔截，非阻擋；但因是真實資料中唯二鏈式合併關係、且錯誤模式為靜默資料污染而非拋錯，風險等級不宜降至「低」）

### R-MSSQL-P4B-05（低，AD 表格文字範圍再次低估，已逐檔查證補齊，非阻擋，重演模式延續）：AD §3.2 merge/lookup 兩列之表格文字皆未提及數個實際存在之 catalog 查詢/共用依賴站點

- **問題**：延續 P4a 已記錄之「AD 逐 handler 改寫要點表遺漏站點」重演模式（`R-MSSQL-P4A-06`），本輪查證發現：(a) `merge-handler.ts` 之 `getColumns()` 現查詢 `information_schema.columns WHERE table_name=$1`，AD §3.2 merge 列僅籠統稱「`createMssqlTempTable` 包裝」，未明說此欄位內省細節須依 I-MSSQL-TEMP-METADATA-01 改用 `getMssqlTempTableColumns`；(b) `lookup-handler.ts` legacy mode 另有一處 `SELECT table_name FROM information_schema.tables WHERE table_name=$1`（驗證 raw 表存在性）之 catalog 站點，AD §3.2 lookup 列完全未提及；(c) `lookup-handler-mssql.ts` 之 legacy mode 解析理應複用 P4a 已產出並預留之 `resolveRawTableMssql`（P4a impl log 已明文標註此意圖），但 AD 本身在 P4b 範圍描述中未重申此依賴關係，存在被下游誤解為「需要重新實作」之風險。
- **影響**：(a)(b) 若被遺漏，會分別導致 merge 欄位內省失敗（違反 I-MSSQL-TEMP-METADATA-01）與 lookup 之 catalog 大小寫不符（違反 I-MSSQL-CATALOG-CASE-01）；(c) 若被誤解為需要重新實作，會產生兩份邏輯不同步的解析函式，未來 P4a 若修正 `resolveRawTableMssql` 之 bug，`lookup-handler-mssql.ts` 若使用了自己的複製版本則不會同步受益。
- **建議**：`infrastructure/AD-E07-41-P4b-test.md` 已將 (a) 納入 `MERGE-UNIT-002`、(b) 納入 `RESOLVE-003`、(c) 納入 `RESOLVE-001`（靜態守門，明確要求 import 既有函式而非重新實作），已足以在 P4b 階段攔截。建議 system-architect 於下次修訂 AD-E07-41 時，於 §3.2 表格新增一欄「共用依賴」明確標注每個 handler 對前一切片產出物的複用關係，降低此類遺漏之重演機率。
- **風險等級**：低（已於本輪測試設計完整補齊，不構成 P4b 阻擋；記錄用意與 `R-MSSQL-P4A-06` 相同，提醒此為可預期重演模式）

### R-MSSQL-P4B-06（低，現況記錄延續，非阻擋）：`dbo` schema 佔用範圍第三度擴大

- **問題**：`R-MSSQL-P4A-05` 已記錄 `dbo` 獨佔保留慣例自 P1b2/P1b3 延伸至 P4-0/P4a。本輪查證確認 `lookup-handler.ts` legacy mode（100% 真實用法）之 raw 對照表解析同樣**必須**落於 `dbo`（裸表名無法透過 TypeORM schema 選項重新導向，同 P4a EXTRACT 群組之限制），代表此慣例第三度延伸至 P4b。
- **影響**：與 `R-MSSQL-P4A-05` 相同——若 CI 尚無 `.mssql.spec.ts` 序列化 lane，P4b 之 lookup 相關真實 MSSQL 案例將再次疊加對同一既有風險的曝險。
- **建議**：`infrastructure/AD-E07-41-P4b-test.md` §0.2 已將 `dbo` 佔用範圍限縮至最小（僅 lookup legacy-mode 案例，merge 與 lookup 之防禦性分支完全以 `##` fixture 繞開），沿用 P4a 已建立之隨機化尾碼命名 + `afterAll` 主動清除設計。根本解法（CI 序列化 lane）非本輪新問題，超出 test-designer 職責範圍，僅延續記錄提醒。
- **風險等級**：低（已有範圍限縮設計降低曝險機率，屬既有已記錄風險之第三度疊加提醒，非本輪新增之根本問題）

---

## MSSQL 全面遷移 P4c 風險與待決問題（AD-E07-41，2026-07-08 新增，P4 第三片，P4 最複雜切片）

> 完整測試設計見 [infrastructure/AD-E07-41-P4c-test.md](infrastructure/AD-E07-41-P4c-test.md)。本節彙整 P4c（Handler 群組三：dedup/target-load，含 tie-breaker + customer_core UPSERT 兩段式 + target-load 三種 loadMode 全覆蓋）範圍內識別之風險；P4e 之風險留待其測試設計文件記錄，P4d 風險見下一節。

### R-MSSQL-P4C-01（🔴🔴 最高，本輪查證出之範圍擴大核心依據）：`target-load-handler.ts` 服務範圍遠超 customer_core，AD §5.1/§9 P4c DoD 完全未提及 `fullMode`/`partition_replace` 兩條真實路徑

- **問題**：test-designer grep `apps/api/src/database/seeds/data/etl-pipelines.json` 全部 6 條 pipeline（非僅 customer_core），確認 `target_load` 節點被 6 條 pipeline 共用：`ob_arreturndf_min_cap`/`ob_calendar`/`ob_emphire`/`ob_pool_data` 四者 `fullMode:true`（TRUNCATE + 批次 INSERT，含 PK 防禦性去重）；`ob_pool_data_list` 為 `loadMode:'partition_replace'`（DELETE 指定分區 + INSERT 附加分區值）；僅 customer_core 為 `fullMode:false`（AD §5.1 唯一文字描述之 UPSERT 路徑）。AD-E07-41 §5.1「Customer_core UPSERT 專節」與 §9 P4c DoD「customer_core UPSERT 兩段式陳述式測試」文字範圍完全未提及另外 5 條 pipeline 所依賴的 `fullMode`/`partition_replace` 兩條路徑，而這 3 種模式共用同一份 `target-load-handler.ts`／即將同一份 `target-load-handler-mssql.ts`。
- **影響**：`createDispatcher()` 之 `DB_TYPE` 分支於本輪（P4c）首次接線（P4a/P4b 皆決議延後），cutover 後全部 6 條 pipeline 會直接呼叫同一個 mssql 版 `TargetLoadHandler` 實例。若 tdd-implementation 僅依 AD 文字範圍實作 customer_core UPSERT 路徑，另外 5 條既有生產 pipeline（E03/E04 raw data landing 之既有機制，涉及 F017–F026 等既有 feature）會在 MSSQL 上因缺少 `fullMode`/`partition_replace` 對應邏輯而 100% 執行失敗，且 P4d（端對端測試）範圍僅限 customer_core 53 節點，**不會**觸及這 5 條 pipeline，代表此缺口在現行 P4 子切片規劃下完全沒有任何測試能於上線前攔截，只會在真實 cutover 後才暴露。
- **建議**：`infrastructure/AD-E07-41-P4c-test.md` 已主動擴大範圍，新增 §四 FULLMODE（11 案例，含 `FULLMODE-MSSQL-002` composite PK 旗艦案例仿 `ob_pool_data` 之 `orgno`+`appl_no` PK）+ §五 PARTITION（6 案例，仿 `ob_pool_data_list` 之 `data_source` 分區欄），皆以真實既有 `dbo` baseline 表（`ob_calendar`/`ob_emphire`/`ob_arreturndf_min_cap`）或合成 throwaway 表（過重之 `ob_pool_data`/`ob_pool_data_list`）驗證。強烈建議 system-architect 於下次修訂 AD-E07-41 §5/§9 時同步補列此兩條路徑之正式 DoD 描述，並評估是否需要新增一個涵蓋這 5 條既有 pipeline 之獨立端對端驗證切片（目前 P4d 範圍未涵蓋）。
- **風險等級**：高（已有明確測試守門可攔截 handler 層級之邏輯正確性，但真實 5 條生產 pipeline 之端對端驗證仍存在缺口，非 test-designer 單輪測試設計可完全填補，需 system-architect 裁示是否擴大 P4d 範圍或另開子切片）

### R-MSSQL-P4C-02（🔴🔴 高，本輪查證出之第二高風險，與 AD §4 核心設計同型但完全未被涵蓋）：`target-load-handler.ts` 內部另有兩處未記載的 `DISTINCT ON` 去重站點，語意上與 I-MSSQL-DEDUP-TIEBREAK-01 所述之 tie-breaker 風險完全同型

- **問題**：`target-load-handler.ts` 除了呼叫上游 `dedup-handler.ts` 外，自身內部**另有兩處** `DISTINCT ON`：(a) `fullMode` 路徑之 `SELECT DISTINCT ON (${pkColList}) ... ORDER BY ${pkColList}`（防禦性 PK 去重，因來源端 MSSQL schema 未必有 PK constraint）；(b) customer_core UPSERT 路徑之 `SELECT DISTINCT ON ("source_customer_no") ... ORDER BY "source_customer_no"`（PG 原始碼註解明確承認「handles collisions caused by `NULLIF(TRIM())` normalization」——即上游 `dedup-handler.ts` 之 d3 節點在 TRIM 正規化**之前**依原始字串去重，`'A12345 '` 與 `'A12345'` 當下被視為兩個不同 key 皆存活，只有到了 `target-load-handler.ts` 自身做 TRIM 正規化後才會碰撞，這是 d3 從未見過的**新**碰撞）。兩處 `ORDER BY` 皆**僅含 key 本身**，無任何次要排序鍵，與 AD §4.1 描述的 `dedup-handler.ts` 原始 PG `DISTINCT ON` 問題（僅有主鍵排序、`ctid` 才是隱性決勝依據）性質完全相同，但 AD §4/§5.1/I-MSSQL-DEDUP-TIEBREAK-01 條文字面完全未提及這兩處站點，該不變式敘述僅以「Dedup 邏輯」一詞帶過，容易讓讀者誤解為僅指 `dedup-handler.ts` 本身。
- **影響**：若 tdd-implementation 將這兩處 `DISTINCT ON` 樸素翻譯為 `ROW_NUMBER() OVER(PARTITION BY key ORDER BY key)`（無額外決定性鍵），語法上合法可執行、不會拋錯，但對同 key 值之多列，「哪一列勝出」屬未定義/查詢計畫相依行為——這正是一種**不會被單元測試的「執行成功」斷言揪出、只有比對「勝出列內容」才會發現**的靜默資料正確性風險，且 (b) 情境已由 PG 原始碼註解證實為真實會發生的資料碰撞（非理論假設）。
- **建議**：`infrastructure/AD-E07-41-P4c-test.md` 已將此發現獨立立為 §二 TLDEDUP（11 案例，緊接於 §一 DEDUP 之後）：`TLDEDUP-UNIT-001/002`（🔴🔴 MUST-FIX，兩處皆須含顯式決定性鍵）+ `TLDEDUP-GATE-001`（決策關卡，不預設具體實作但要求 impl log 記錄）+ `TLDEDUP-EQ-001`（🔴 旗艦案例，直接模擬 PG 註解描述的 TRIM 碰撞情境）+ `TLDEDUP-TRAP-001`（陷阱佐證，論證型案例，明確標注「待 tdd-impl 真庫驗證」因其非決定性本質難以於單次測試穩定重現）。強烈建議 system-architect 於下次修訂 AD-E07-41 時，將 I-MSSQL-DEDUP-TIEBREAK-01 條文字面明確擴大涵蓋此二站點，避免未來讀者依字面誤判範圍已窮盡。
- **風險等級**：高（已有明確測試守門可攔截，但因是「靜默資料正確性」而非「拋錯」型風險，若 test-designer 未主動逐檔查證，極可能被下游完全遺漏至上線後才由業務比對資料時發現，除錯成本遠高於本輪單元測試層級；(b) 情境已有 PG 原始碼註解證實為真實會發生，非假設性風險）

### R-MSSQL-P4C-03（中，本輪查證出之全新清理責任模型）：`target-load-handler.ts` 內部暫存表之清理獨立於 P4a 已建立的 `NodeOutputStore.cleanupAll()` 機制之外，屬全新責任

- **問題**：`target-load-handler.ts` 執行完畢回傳 `{ tempTable: '', rowCount }`（空字串），其內部建立的 enriched `tempTable` 與 `dedupTable`（`fullMode`/UPSERT 兩處）**從未**透過 `DataSet.tempTable` 向 `NodeOutputStore` 註冊。P4a `CLEANUP-003` 決議之 `NodeOutputStore.cleanupAll()` 機制（依 `store` 內容 + `createdTables` 累積集合清理）天生只能清理曾被註冊過的表，**不會**、也**不應該被期待**涵蓋這兩張表——這與 P4a/P4b 其餘 8 個 handler（皆透過 `DataSet.tempTable` 交由 pipeline 層級統一收斂）之清理責任模型不同，是 target-load 獨有的例外。PG 版本現行也僅於**成功路徑尾端**呼叫 `DROP TABLE IF EXISTS`，若核心 DML（`UPSERT`/`INSERT`/`DELETE`）之 `try/catch` 捕捉錯誤後 `throw`，PG 版同樣不會執行到後續清理——這在 PG 上無害（session/交易結束自動回收暫存表），但在 MSSQL `##global temp` 上完全不成立（P4-spike-2 POINT4 已實證 `##` 於連線池 `release()` 後仍殘留）。
- **影響**：若 tdd-implementation 逕自假設「只要接上 P4a 已建立的 `NodeOutputStore.cleanupAll()` 機制，全部 9 個 handler 的暫存表清理就已一致處理」，會遺漏 target-load 內部這兩張表的失敗路徑清理，導致每次 UPSERT/fullMode 失敗（如型別轉換錯誤、NOT NULL 違反）皆會在 `tempdb` 累積一組未清理的 `##` 表，長期執行下有 `tempdb` 空間洩漏風險，且此類洩漏不會被既有 `CLEANUP-003`/`CLEANUP-004` 系列測試（僅涵蓋透過 `NodeOutputStore` 註冊路徑）發現。
- **建議**：`infrastructure/AD-E07-41-P4c-test.md` 已設計 §七 CLEANUP（5 案例）：`CLEANUP-UNIT-001/002`（🔴 MUST-FIX，黑盒 spy 驗證成功路徑清理）+ `CLEANUP-GATE-001`（🔴 決策關卡，要求 impl log 明確記錄「本 handler 不依賴 pipeline 層級清理」此一與其餘 8 個 handler 不同的事實）+ `CLEANUP-MSSQL-002`（真實 MSSQL 人為觸發失敗，驗證失敗路徑清理）。
- **風險等級**：中（已有明確測試守門可攔截；風險本質為長期資源洩漏而非立即功能性失敗，不阻擋 P4c 交付，但若遺漏，問題會在生產環境長期運行後才逐漸顯現，除錯難度較高）

### R-MSSQL-P4C-04（中，AD 完全未提及之 catalog 站點 + 既有共用 helper 欄位缺口）：`getPrimaryKeyColumns()`（`fullMode` 專屬）與 `inputColumnTypes`/`varcharColumns`（`NULLIF(TRIM())` 判斷用）兩處站點，後者需要既有共用 helper 未涵蓋之欄位型別資訊

- **問題**：(a) `getPrimaryKeyColumns()` 為 `fullMode` 路徑呼叫的 catalog 查詢站點（`information_schema.table_constraints` JOIN `information_schema.key_column_usage`），AD §3.2/§5.1 完全未提及，且需正確處理 composite PK（`ob_pool_data` 之 `orgno`+`appl_no`）之 `ordinal_position` 排序。(b) `inputColumnTypes`（用於判斷 `varcharColumns` 以決定是否套用 `NULLIF(TRIM())` 正規化）需要輸入暫存表各欄位之 `data_type`，但 P4a 建立的共用 helper `getMssqlTempTableColumns` 回傳型別 `MssqlTempTableColumn { name, columnId }` **不含** `data_type`——這是 P4a/P4b 兩輪皆未出現過的需求（該兩輪 9 個 handler 中的 7 個僅需欄位名/順序），本輪為首次需要型別資訊之站點。
- **影響**：(a) 若遺漏或翻譯錯誤，`fullMode` 路徑之 composite PK 去重會產生錯誤結果或直接拋錯，影響 `ob_pool_data` 這條真實 pipeline。(b) 若簡單假設「所有欄位都套用 `NULLIF(TRIM())`」而跳過型別判斷，會對數值/日期型欄位誤套用字串函式導致型別錯誤；若 tdd-implementation 在沒有既有指引下自行決定是否修改共用 helper，可能與 P4a/P4b 已完成之 7 個既有呼叫端產生不一致的 helper 版本認知。
- **建議**：`infrastructure/AD-E07-41-P4c-test.md` 已將 (a) 納入 §四 FULLMODE 之 `FULLMODE-UNIT-001/002`，(b) 設計為 `CATALOG-GATE-001`（🔴 決策關卡：additive 擴充既有 `MssqlTempTableColumn` 型別新增 `dataType` 欄位供全部呼叫端共用，或 target-load 內另寫專屬查詢，兩案皆可接受但須 impl log 記錄選擇），並設計 `STATIC-003` 確保若選擇擴充路徑，既有欄位語意不被破壞。建議 system-architect 於下次修訂 AD-E07-41 §3.1 時考慮是否將 `dataType` 一併納入共用 helper 的正式設計範圍，減少未來子切片各自決策的認知負擔。
- **風險等級**：中（已有明確測試守門可攔截，屬程式碼翻譯正確性風險而非已知已發生問題；(a) 影響範圍明確界定於 `ob_pool_data` 一條 pipeline，(b) 為決策關卡而非阻擋項）

### R-MSSQL-P4C-05（低，現況記錄延續，非阻擋，本輪首次直接涉及真實生產表）：`dbo` schema 佔用範圍第四度擴大，且本輪首次直接對真實既有生產 baseline 表寫入測試資料

- **問題**：`R-MSSQL-P4A-05`/`R-MSSQL-P4B-06` 已記錄 `dbo` 獨佔保留慣例自 P1b2/P1b3 依序延伸至 P4-0/P4a/P4b。本輪查證確認：customer_core UPSERT EQ 案例、`fullMode` 單一 PK 代表案例（`ob_calendar`/`ob_emphire`/`ob_arreturndf_min_cap`）皆**直接使用既有真實生產 baseline 表**，而非如 P4a/P4b 一貫的合成 `##`/throwaway `dbo` fixture——這是 MSSQL 遷移系列測試首次直接對「非本輪新建」之既有真實表寫入業務性測試資料。
- **影響**：若測試案例之資料隔離/清理設計不夠精確（如誤用整表 `TRUNCATE` 而非精準刪除本案例寫入列），有風險影響同一 CI 執行週期內其他驗證這些表之既有測試套件（`mssql-p1b2`/`mssql-p1b3`/`mssql-p4-0` 系列）。經查證，該些既有套件僅驗證存在性與型別、未寫入業務資料，故 `fullMode` 案例採 `TRUNCATE`（語意本身即為全量替換）風險可控；但若 CI 尚無 `.mssql.spec.ts` 序列化 lane，仍存在多套件平行操作同一真實表的理論風險。
- **建議**：`infrastructure/AD-E07-41-P4c-test.md` §0.2 已明確設計隔離策略（客戶資料表以顯著前綴 + `afterEach` 精準刪除；`ob_calendar`/`ob_emphire`/`ob_arreturndf_min_cap` 因語意上即為 `fullMode` 全量替換且經查證非其他套件驗證資料之對象，`TRUNCATE` 安全）；`ob_pool_data`/`ob_pool_data_list` 因逾百欄過重，改用合成 throwaway 表繞開此風險。根本解法（CI 序列化 lane）非本輪新問題，超出 test-designer 職責範圍，僅延續記錄提醒。
- **風險等級**：低（已有明確隔離設計降低曝險機率；記錄用意在於提醒本輪測試首次觸及「真實既有生產表」此一性質轉變，供 tdd-implementation 執行時格外留意資料隔離的精確性）

### R-MSSQL-P4C-06（低，AD 表格文字範圍再次低估，已逐檔查證補齊，非阻擋，第三次重演）：AD §5.1 對 `target-load-handler.ts` 之描述完全聚焦於 UPSERT 陳述式本身，未提及其共用之上游/下游輔助邏輯站點

- **問題**：延續 `R-MSSQL-P4A-06`/`R-MSSQL-P4B-05` 已記錄之「AD 逐 handler 改寫要點表遺漏站點」重演模式，本輪查證發現 AD §5.1 之 customer_core UPSERT 描述僅涵蓋兩段式 `UPDATE`/`INSERT` 陳述式本身，完全未提及：(a) 上游 enriched `tempTable` 建立時之 `NULLIF(TRIM())` 正規化與系統字面值 cast（`::TIMESTAMP`/`::UUID`）；(b) ghost gate 之 `LENGTH(TRIM())`；(c) `notNullTargetCols` 之 catalog 查詢。這些站點雖然個別而言翻譯難度不高（多為既有 Pattern B/型別轉換原則之直接應用），但數量分散、容易在逐項核對 AD 文字時被遺漏。
- **影響**：若被遺漏，會分別導致寫入 customer_core 之系統時間戳記/UUID 欄位型別錯誤、ghost gate 判斷失效（過短 `source_customer_no` 未被正確排除）、NOT NULL 守門查詢語法錯誤。
- **建議**：`infrastructure/AD-E07-41-P4c-test.md` 已將 (a)(b)(c) 分別納入 §八 LITERAL、`UPSERT-UNIT-004`、§六 CATALOG，已足以在 P4c 階段攔截。建議 system-architect 於下次修訂 AD-E07-41 時，於 §3.2/§5.1 表格新增「輔助站點」欄位，明確列出每個 handler 除核心陳述式外之全部字串函式/cast/catalog 依賴，降低此類遺漏之重演機率（此為本專案 MSSQL 遷移系列第三次記錄同型態問題）。
- **風險等級**：低（已於本輪測試設計完整補齊，不構成 P4c 阻擋；記錄用意在於提醒此為可預期重演模式，供未來 P4d/P4e 或其他子切片測試設計時優先主動 grep 覆核，而非僅信任 AD 表格文字定範圍）

## MSSQL 全面遷移 P4d 風險與待決問題（AD-E07-41，2026-07-08 新增，P4 收官切片）

> 完整測試設計見 [infrastructure/AD-E07-41-P4d-test.md](infrastructure/AD-E07-41-P4d-test.md)。本節彙整 P4d（customer_core 56 節點端對端，真實 DAG 執行 + PG EQ 比對 + tie-breaker 業務級偵測）範圍內識別之風險；P4e（bulk-load raw staging 寫入端）之風險留待其測試設計文件記錄。**P4（P4a/b/c/d）至此全數完成測試設計**。

### R-MSSQL-P4D-01（🔴🔴 最高，本輪查證出之 fixture 範圍擴大核心依據）：任務書「5 來源」僅描述 extract 節點，31 個 lookup 節點另依賴 9 張獨立來源表，真實 fixture 需求為 14 張 raw 表

- **問題**：test-designer 逐一 grep `etl-pipelines.json` 全部 31 個 `lookup` 節點之 `lookupRef`/`lookupSource` 欄位，確認除 5 個 `raw_data_extract` 節點對應之 5 張 raw 表外，另有 **9 張獨立的 lookup 來源 raw 表**（`ZZIP_BAMCODE_D`×2 法人、`ZZIP_BAMPOST_M`、`MLMCODE`×3 法人、`MLSTDINDUMF`×3 法人），任務書「5 來源 2 ZZIP+3 MLMC」與初始理解僅涵蓋 extract 節點，完全未提及這 9 張表。
- **影響**：若 fixture 僅依任務書字面建 5 張表，31 個 lookup 節點（56 節點中占比最高，55%）會因來源表不存在而 100% 拋 `Invalid object name`，pipeline 無法端對端跑通，P4d 核心 DoD（§三 E2E-RUN）完全無法達成。
- **建議**：`infrastructure/AD-E07-41-P4d-test.md` §0.3 已將全部 14 張 raw 表（含各自欄位需求之衍生原則）納入 Harness 設計，並設計 `GATE-001`/`GATE-003` 決策關卡要求 tdd-implementation 以程式化方式（非人工臆測）從 `etl-pipelines.json` 逐節點掃描產生欄位/值域清單。
- **風險等級**：高（已有明確測試守門與 Harness 設計可攔截；若 tdd-implementation 未仔細閱讀 §0.3 而僅依任務書原始描述構造 fixture，會在 P4d 執行第一時間即發現大量節點失敗，除錯成本雖不低但訊號明確，不會靜默通過）

### R-MSSQL-P4D-02（🔴🔴 高，本輪查證出之 dry-run 假陽性陷阱）：`target-load-handler(-mssql).ts` 於 `isTestRun===true` 時完全跳過寫入，但 `nodeLogs` 仍顯示「成功」，E2E harness 若誤用極易產生具欺騙性的假陽性

- **問題**：`target-load-handler.ts`/`target-load-handler-mssql.ts` 皆有 `if (context.isTestRun) return { tempTable: '', rowCount: input.rowCount }` 分支——`EtlPipelineExecutionService.triggerTest()`（對應 UI「測試執行」功能）會將 `EtlPipelineLog.is_test_run` 設為 `true` 並透傳至 `PipelineRunnerConfig.isTestRun`。若 E2E harness 誤用 `triggerTest` 而非 `triggerExecute`（兩者 API 外觀高度相似，命名容易混淆），或於 §0.2 方案乙手動建構 `PipelineRunnerConfig` 時遺漏顯式設定 `isTestRun: false`，pipeline 會回報全部 56 節點 `completed` 且 `outputRowCount` 顯示與正常執行相同的數字，但 `customer_core` 實際上一列也未寫入。
- **影響**：若 P4d 測試僅依賴 `nodeLogs` 斷言（如 §三 E2E-RUN-001 若僅檢查 `status==='completed'` 而不直接查詢 `customer_core` 實際列數），會在此陷阱下產生「全綠但功能完全未驗證」的最危險型態假陽性——比測試失敗更難被發現，因為表面訊號一切正常。
- **建議**：`infrastructure/AD-E07-41-P4d-test.md` 已設計三層防線：(a) §三 `E2E-RUN-004`/`007` 直接查詢 `customer_core` 實際列數與 `nodeLogs.outputRowCount` 交叉核對，不僅信任 nodeLogs；(b) §四 `ISTESTRUN-001`（靜態守門）+ `ISTESTRUN-002`（🔴🔴 陷阱佐證對照組，刻意以 `isTestRun=true` 跑一次證明陷阱真實存在）；(c) §十三 `STATIC-003`（原始碼靜態 grep，確認全部 DoD 核心測試檔皆顯式 `isTestRun: false`）。三層防線分別作用於「執行期資料驗證」「執行期陷阱佐證」「原始碼靜態掃描」，任一層被繞過仍有其餘兩層攔截。
- **風險等級**：高（已有三層明確測試守門可攔截；此類「表面成功、實際未執行」陷阱之根本影響已透過本文件之逐檔查證於測試設計階段提前發現並設計防線，未待 tdd-implementation 階段才意外踩雷）

### R-MSSQL-P4D-03（🔴 高，依本專案內真實先例設計，非臆測）：PG 對照側（EQ-PG 群組）之可達性不可預設，5433 於前一切片（P4a）實測時確實不可達

- **問題**：P4a impl log（`AD-E07-41-P4a-impl.md` 偏差段落 `EXTRACT-RESOLVE DUAL-DB`）明確記錄「CDMP_TEST 實測缺 `extraction_tasks`/`datasources` baseline」且「唯一可達 PG 為 dev DB（5432），5433 不可達，不可注入測試列污染 dev」，最終該輪 PG 對照側完全跳過。這是本專案 MSSQL 遷移系列**已發生過**的真實環境限制，非假設性風險。
- **影響**：若任務書「PG 5433/dev 5432 可達」之措辭被誤讀為「兩者擇一皆可用於寫入測試資料」，可能導致 tdd-implementation 誤用 dev DB（5432）進行 P4d EQ-PG 群組之寫入測試，污染開發資料庫；若嚴格要求 EQ-PG 群組必須執行才算 P4d 完成，則在 5433 不可達的環境下 P4d 會被不必要地阻擋（即使 MSSQL-only 端對端已完全驗證通過）。
- **建議**：`infrastructure/AD-E07-41-P4d-test.md` §0.5 已明確設計 degradable 政策：EQ-PG（§六）與 TIEBREAK 跨引擎比對（§五 `TIEBREAK-003`）僅在 5433 可達時執行，不可達時 `describe.skip` + 明確 `SKIP_REASON`，**絕不**回退至 5432（dev DB）；§三 E2E-RUN（MSSQL-only）為唯一不可退讓之硬性 DoD。tdd-implementation 執行本輪測試前應先確認 `docker compose -f docker-compose.test.yml up -d postgres-test` 是否已啟動，若最終 P4d 完成時 EQ-PG 群組仍為 skip 狀態，應於 impl log 明確記錄原因，不視為 P4d 未完成。
- **風險等級**：中高（已有明確 degradable 設計降低「阻擋整體交付」之風險；但 AD §9 P4d DoD 字面「與 PG 版本逐欄逐列比對」若未能於任何一次 tdd-implementation 執行中真正跑過，該項 DoD 實質上仍未被驗證過，僅是測試設計層面已為其可能發生的環境限制預作準備，建議 tdd-implementation 執行前優先嘗試啟動 `postgres-test`，若持續不可達應主動回報使用者評估是否需要調整本機/CI 環境）

### R-MSSQL-P4D-04（中，AD 與任務書共同沿用之舊估算數字與真實資料不符）：真實 pipeline 節點數為 56，AD §0/§8 與任務書皆沿用「53 節點」

- **問題**：test-designer 逐一讀取 `etl-pipelines.json`「ETL for Customer Core」之 `definition.nodes`，實測 `nodeType` 分佈為 `raw_data_extract:5, derived_field:7, lookup:31, merge:4, dedup:3, type_cast:2, field_mapping:2, conditional:1, target_load:1`，合計 **56**（非 53），邊數 55。AD-E07-41 全文（§0「53 節點」、§8「53 節點端對端」）與本輪任務書描述皆沿用同一「53」數字，推測為 pipeline 早期設計版本之估算值，未隨後續節點增修同步更新。
- **影響**：純文件層面不一致，不影響任何測試邏輯正確性（本文件全數以真實 56 為準）；但若未來讀者（含 system-architect 下次修訂 AD 時）依 AD 文字「53」去核對測試設計文件之案例數或範圍完整性，可能產生不必要的困惑或誤判範圍缺漏。
- **建議**：本文件 §零 查證發現 1、§十三 `STATIC-001` 已明確記錄真實數字並設計事實鎖定守門（讀取 JSON 動態核對，非寫死字面值，未來若節點數再變動會自動反映而非又一次產生文件漂移）。建議 system-architect 於下次修訂 AD-E07-41 時，將全文「53 節點」字面更正為「56 節點」，或改用「customer_core pipeline」之描述避免寫死具體數字。
- **風險等級**：低（不影響功能正確性，純文件一致性問題；已設計動態守門避免未來再次漂移）

### R-MSSQL-P4D-05（中，P4c 已記錄之範圍缺口，P4d 明確不處理，此處交叉引用避免被誤判已解決）：`target-load-handler.ts` 服務之另外 5 條既有生產 pipeline（`fullMode`/`partition_replace`）之端對端驗證，P4d 範圍不涵蓋

- **問題**：`R-MSSQL-P4C-01` 已記錄 `target-load-handler.ts` 被 6 條 pipeline 共用，其中 5 條（`ob_arreturndf_min_cap`/`ob_calendar`/`ob_emphire`/`ob_pool_data`/`ob_pool_data_list`）依賴 P4c 已補齊之 `fullMode`/`partition_replace` 路徑，並指出「P4d（端對端測試）範圍僅限 customer_core，不會觸及這 5 條 pipeline」。本輪任務書明確將 P4d 範圍限定為「customer_core pipeline 端對端」，確認此缺口**依然存在，且本輪任務書之範圍界定本身即是此缺口延續之直接原因**（非 test-designer 本輪疏漏）。
- **影響**：這 5 條既有生產 pipeline（E03/E04 raw data landing 既有機制）於 MSSQL 上之 handler 級邏輯正確性已由 P4c §四 FULLMODE/§五 PARTITION 之單元/整合測試涵蓋，但「作為完整 DAG 端對端執行」（含這些 pipeline 各自的其餘節點，如 raw_data_extract/field_mapping 等與 target_load 協同）仍無任何自動化測試涵蓋，僅能仰賴人工於 cutover 前手動驗證或另開子切片。
- **建議**：交叉引用 `R-MSSQL-P4C-01` 之既有建議（system-architect 評估是否需要為這 5 條 pipeline 新增獨立端對端驗證子切片）。本文件不主動擴大範圍納入（任務書已明確排除，逾越 test-designer 職責邊界），僅於此處重申此缺口於 P4d 完成後依然存在，避免被誤判為「P4（P4a/b/c/d）全數完成」代表全部 6 條 pipeline 皆有端對端覆蓋。
- **風險等級**：中（缺口本身之核心邏輯已有 P4c handler 級測試把關，端對端層級缺口非立即阻擋風險；但若無 system-architect 主動裁示，此缺口可能被長期遺忘直到 cutover 後才暴露，建議列入 P4 全系列收尾時之待辦追蹤）

### R-MSSQL-P4D-06（低，AD §4.3 已裁定為非阻擋，本文件已設計偵測機制，此處記錄殘留不確定性）：tie-breaker 跨引擎（PG vs MSSQL）勝出列內容是否一致，本質上無法於測試設計階段預先斷言，需等待真實執行觀察

- **問題**：`TIEBREAK-003` 之設計本質是「探測型」案例，依 AD §4.3 裁定不預設答案；本文件已設計為兩分支皆合法通過的結構，但此案例**是否真的在真實 fixture 下觸發分歧**，唯有 tdd-implementation 實際執行後才能得知，測試設計階段無法提前判定。
- **影響**：若 5433 可達且 `TIEBREAK-003` 實際執行後發現分支 B（內容不一致），依 AD §4.3 裁定此為「已知、可解釋之低機率邊界差異，非 bug」，但仍需要 tdd-implementation 確實依測試設計要求將觀察結果記入 impl log 並回報使用者——這一步驟依賴人工紀律（比照本專案既有 `TLDEDUP-GATE-001` 等決策關卡之共通弱點：無法被自動化強制執行，僅能靠流程要求）。
- **建議**：`TIEBREAK-003` 已明確要求「不可略過不記錄」，比照既有決策關卡文件化守門慣例。若 tdd-implementation 執行後確實觀察到分支 B，建議比照本專案既有 F067 差異報告揭露慣例，將該具體案例（客戶代號、差異欄位、兩側完整列內容）整理後主動回報使用者，而非僅記入 impl log 內部文件了事。
- **風險等級**：低（AD 已明確裁定此為非阻擋之已知邊界情境；記錄用意在於提醒此類「探測結果依賴人工紀律回報」之殘留不確定性，供 QA/PM 於 P4d 完成後追蹤確認決策關卡是否確實被落實記錄）

---

## MSSQL 全面遷移 P4e 風險與待決問題（AD-E07-41，2026-07-08 新增，P4 最後一片，P4 全範圍完成）

### R-MSSQL-P4E-01（🔴 高，本輪範圍界定之刻意排除，同檔案同缺陷但非 bulk-load 直接依賴）：`RawDataService` 之 `getColumnMetadata`/`getIndexedColumns`/`getRawData` 資料查詢三方法，與 §二 ISPG-GATE 已修復之三方法同屬一個二元 gate 缺陷，但本輪未納入範圍

- **問題**：test-designer 逐檔查證確認 `raw-data.service.ts` 現行 `isPostgres: boolean` 二元 gate 缺陷，實際影響範圍遠大於 P4e 測試設計已納入的 `createRawTable`/`tableExists`/`getTableColumns` 三方法——`getColumnMetadata`（`getRawData` API 內部呼叫，非 PG 分支呼叫 `PRAGMA table_info`）、`getIndexedColumns`（非 PG 分支呼叫 `PRAGMA index_list`）、`getRawData` 資料查詢本身（非 PG 分支使用 `LIMIT ? OFFSET ?` 語法，MSSQL 不支援 `LIMIT` 且 `?` 佔位符非 T-SQL 慣例）三者同樣會在 `DB_TYPE=mssql` 下誤入 SQLite 分支並拋錯。`infrastructure/AD-E07-41-P4e-test.md` §二 ISPG-GATE 刻意將範圍限縮於「`executeExtraction()` 寫入流程之直接前置依賴」三方法，因為這三個未涵蓋的方法只服務 `getRawData()`（raw data 瀏覽 UI 之後端 API），與 bulk-load 寫入路徑無直接依賴關係，逾越 P4e 任務書「只設計 raw staging bulk-load 機制」之明確範圍界定。
- **影響**：P4e 完成後，MSSQL cutover 若同時上線 raw data 瀏覽 UI（E04 既有功能），該 API 會因這三個方法之二元 gate 缺陷而 100% 失敗（`getRawData` 幾乎必然呼叫 `getColumnMetadata`，且大表排序時可能呼叫 `getIndexedColumns`），且目前無任何測試守門攔截此缺口。
- **建議**：建議 system-architect/PM 評估是否需要另立一個小型子切片（例如「P4f」或併入 raw data 瀏覽 UI 之獨立 MSSQL 相容性任務）補齊 `getColumnMetadata`/`getIndexedColumns`/`getRawData` 三方法之 mssql 分支（型別對應與正確 T-SQL 分頁語法 `OFFSET ... FETCH NEXT ... ROWS ONLY`），並比照本文件 §二 ISPG-GATE 之陷阱佐證 + 目標行為雙軌模式設計測試。
- **風險等級**：高（功能面完全阻斷但範圍明確、修法路徑清楚，非模糊不確定風險；目前無測試覆蓋，若未主動追蹤可能被遺忘直到 cutover 後才由使用者回報功能異常）

### R-MSSQL-P4E-02（中高，範圍界定之刻意排除）：`insertBatch()` 非 full-mode（incremental）路徑之 mssql 相容性缺口——`?` 佔位符與 T-SQL 2100 參數上限

- **問題**：`extraction-execution.service.ts` 之 `canStream` 判定式要求 `task.mode === 'full'` 才會走 bulk-load 快速路徑；incremental 模式（含首次尚無 `raw_table_name` 或非全量擷取之情境）恆走既有 `insertBatch()` 迴圈。該方法現行非 PG 分支使用 `?` 佔位符（SQLite 慣例，非 T-SQL `@0,@1,...` 具名/位置參數語法）且 `maxRowsPerInsert` 計算僅為 PG 家族設計 `PG_PARAM_LIMIT=65000`，MSSQL 的 SQL 文字參數上限實際為 **2100**（遠低於 PG），若不修正批次切片邏輯，寬欄位來源（比照既有 OBPOOLDATA 122 欄教訓）極易在單次 INSERT 就超出上限拋錯。
- **影響**：incremental 模式擷取（非本輪 P4e DoD 範圍，AD §6/§9 P4e DoD 字面僅描述 full-mode COPY→bulk 替換）於 MSSQL AppDB 上會持續失敗，直到此缺口另行修復。
- **建議**：與 R-MSSQL-P4E-01 同理，建議另立子切片處理，修法方向為 `insertBatch()` 新增 mssql 分支（`@0,@1,...` 具名參數 + `MSSQL_PARAM_LIMIT=2000`〔留 buffer〕之切片邏輯，比照既有 PG 分支之 buffer 設計精神）。
- **風險等級**：中高（incremental 模式是否為 MSSQL cutover 上線初期之必要功能，需與業務確認優先權；純技術修法路徑清楚，非模糊風險）

### R-MSSQL-P4E-03（中，測試設計階段之已知資訊限制）：TYPEMAP 型別矩陣為代表性合成設計，非逐一核對 `ZZIP_BAMCUST_M`/`MLMCUSTOMER` 真實來源欄位型別

- **問題**：本專案 repo 內（`etl-pipelines.json`/`extraction-tasks.json`）僅記錄這 5 張真實來源表之 `sourceTable` 名稱與部分欄位對照，並無逐欄 `DATA_TYPE` 之靜態清單——該資訊需即時連線真實外部 MSSQL 來源查詢 `INFORMATION_SCHEMA.COLUMNS` 才能取得，test-designer 於文件撰寫階段無法靜態取得，故 `AD-E07-41-P4e-test.md` §一 TYPEMAP 之型別矩陣採比照既有 `mapToPostgresType` 涵蓋型別家族之代表性合成設計（見該文件查證發現 7）。
- **影響**：若真實來源存在矩陣未涵蓋之罕見型別（例如已淘汰之 `sql_variant`、`hierarchyid`、`geography`/`geometry` 等特殊型別，機率低但非零），`mapToMssqlType` 之 fallback（`NVARCHAR(MAX)`）雖不至於拋錯，但可能非最適合的映射選擇。
- **建議**：建議 tdd-implementation 執行 P4e 前，若可連線真實 ZZIP/MLMC 來源，優先查詢 5 張表之實際 `INFORMATION_SCHEMA.COLUMNS.DATA_TYPE` 分布，核對是否被 §一 TYPEMAP 矩陣完整涵蓋（比照 P4d 對 `etl-pipelines.json` 之查證精神），若發現矩陣未涵蓋的型別，於 impl log 記錄並補充對應分支。
- **風險等級**：中（fallback 機制已存在，不至於功能完全阻斷；僅是型別選擇最適性未經真實資料驗證，若矩陣涵蓋不足會在建表當下立即以拋錯或型別警告形式暴露，訊號明確不會靜默通過）

---

## MSSQL 全面遷移 P3a 風險與待決問題（AD-E07-42，2026-07-08 新增，P3 首片）

> 完整測試設計見 [infrastructure/AD-E07-42-P3a-test.md](infrastructure/AD-E07-42-P3a-test.md)。本節彙整 P3a（Stage 1 篩選 raw SQL 引擎移植）範圍內識別之風險；3b Stage 2~3 計分／3c 比例分派／3d CR 優先分派／3e `fn_calc_tier_level` 收尾之風險留待各自測試設計文件記錄。

### R-MSSQL-P3A-01（🔴🔴 最高，本輪查證出之保證語法錯誤，AD 完全未提及，直接推翻 AD §1.1「executor 不需重新設計」表述）：`stage1-sql-executor.ts:100` 之 `'CR' || cremp.emp_nm` 為 PG 專屬字串串接運算子，T-SQL 不支援

- **問題**：AD-E07-42 §1.1 將 `stage1-sql-executor.ts` 定性為「組裝外殼...不需要重新設計 executor 層架構」，僅要求呼叫端新增 `DB_TYPE==='mssql'` 分支呼叫既有 executor。test-designer 逐行查證該檔案之 `runStage1SqlInsert` 函式，發現其 `selectSql` 字面量本身內嵌 PG `||` 字串串接運算子（`CASE WHEN cremp.emp_id IS NOT NULL THEN 'CR' || cremp.emp_nm ELSE NULL END`，用於組裝 CR 業代顯示名稱 `cr_nm`）。T-SQL **不支援** `||` 運算子（非僅語意不同，而是非合法語法），此陳述式在 MSSQL 上會 100% 拋語法錯誤，且此站點完全未出現在 AD §2.1 之逐站點方言轉換清單中。
- **影響**：若 tdd-implementation 依 AD 字面理解「executor 只需呼叫端加分支」而未檢視 executor 自身 SQL 模板內容，P3a 之 MSSQL run 路徑會於「有 CR 業代命中」的名單上 100% 拋語法錯誤（非邊界情境，任何命中 CR 業代之名單皆會觸發），且此錯誤與「呼叫端接線是否正確」完全無關，即使 §二 DISPATCH 群組已正確接線，本站點仍會導致整個 INSERT…SELECT 陳述式失敗。
- **建議**：`infrastructure/AD-E07-42-P3a-test.md` §三 CONCAT 已設計 3 案例（原始碼靜態守門 MUST-FIX + 中文姓名旗艦 EQ + 未命中防禦）。建議 system-architect 於下次修訂 AD-E07-42 時，將此站點正式補入 §2.1 表格（風險等級應標示為「高」而非表格目前完全未提及），並重新評估 §1.1「executor 層不需重新設計」之表述是否需要修正為「executor 之 SQL 模板本身亦含 dialect-specific 內容，需平行 mssql 版本或 dialect-aware 模板切換」。
- **風險等級**：高（已有明確 MUST-FIX 靜態守門可攔截；但風險本質是「保證失敗」而非「語意可能不一致」，若 tdd-implementation 跳過閱讀本文件逐字依 AD 原文實作，會在測試階段才發現，而非架構設計階段）

### R-MSSQL-P3A-02（🔴🔴 高，AD 建議公式引數順序反轉，套用後年齡計算得負值）：AD §2.1 表格建議之 AGE 轉換公式 `DATEDIFF(YEAR,@ccWorkdt,cc.date_of_birth)` 引數順序反轉

- **問題**：AD-E07-42 §2.1 表格建議 MSSQL AGE 轉換公式為 `DATEDIFF(YEAR,@ccWorkdt,cc.date_of_birth) - CASE WHEN (MONTH(cc.date_of_birth)>MONTH(@ccWorkdt)) OR (...) THEN 1 ELSE 0 END`。test-designer 自行推導 T-SQL `DATEDIFF(datepart,startdate,enddate)` 語意（= `enddate` 之 `datepart` 分量 − `startdate` 之 `datepart` 分量），以 `startdate=@ccWorkdt`（如 2026-07-01）、`enddate=cc.date_of_birth`（如 1996-07-01）代入，結果為 `1996−2026=−30`（負值），而非預期之 `+30` 歲。正確引數順序應為 `DATEDIFF(YEAR, cc.date_of_birth, @ccWorkdt)`（對調兩引數）。AD 建議之 `CASE` 子句（「未達當年生日不計」判斷）方向本身正確，僅 `DATEDIFF` 兩引數順序需對調。
- **影響**：若 tdd-implementation 逐字套用 AD 建議公式，`stage1-customer-core-clause-mssql.ts` 之 AGE 條件（`BETWEEN :ccAgeMin AND :ccAgeMax`）會恆對負值年齡求值，除非業務刻意將 `min`/`max` 也設為負值（不可能，UI 輸入為非負年齡），否則此條件會**恆排除全部客戶**（除非剛好 min≤負值≤max，機率極低）——此為靜默功能失效（查詢執行成功、無錯誤訊息，僅結果永遠為空/近乎空），比語法錯誤更難被發現。此公式同時被 AD §2.2（Stage 2 計分之 AGE 欄位，另一獨立站點）引用「同 §2.1 轉換公式」，若本輪未修正，該符號錯誤會複製到 3b 子切片。
- **建議**：`infrastructure/AD-E07-42-P3a-test.md` §四 `AGE-MSSQL-001` 已設計 MUST-FIX 旗艦紅燈守門（已知年齡具體數值斷言，若 AD 公式未修正必為紅燈）。**強烈建議 system-architect 立即修訂 AD-E07-42 §2.1 表格**（並同步檢查 §2.2 是否需要對應修訂或加註提醒），避免 3b 子切片之 test-designer/tdd-implementation 沿用同一錯誤公式（本專案既有記憶模式：「正則轉字元類別...空字串邊界」「AD 建議之單行等價轉換公式」皆需自行推導，本例為同一模式之再次驗證，且是本文件目前發現中唯一「非邊界情境、而是主值符號整體錯誤」之案例）。
- **風險等級**：高（已有 MUST-FIX 旗艦守門可攔截於測試階段；但若測試案例被跳過或未執行〔例如僅執行 EQ 群組未執行 AGE 群組〕，此缺陷屬於靜默功能失效類型，正式環境上線後可能長期無人察覺客戶年齡篩選條件實質上恆不生效）

### R-MSSQL-P3A-03（中，不可逐字複用 P4a 既有正則轉換公式）：year-above 前導數字**擷取**與 P4a 已驗證之全字串**驗證**語意層級不同

- **問題**：P4a `type-cast-handler-mssql.ts` 已驗證的 `NOT LIKE '%[^0-9]%'` + `LEN(x)>0` 手法，解的是「驗證整個字串是否全為數字」（布林判斷）。Stage 1 year-above 之 `SUBSTRING(o.year_produ FROM '^[0-9]+')`（PG，無 `$` 錨點）要解的是「擷取字串**開頭**連續數字子字串」（例：`'1980abc'` → `'1980'`），語意層級為擷取而非驗證。AD §2.1 表格對此站點僅描述「`PATINDEX`/`LIKE` 字元類別（前導數字擷取，比照 P4a 已驗證之 `~ '^[0-9]+$'`→`NOT LIKE '%[^0-9]%'` 手法延伸）」，用詞「延伸」容易被誤讀為「可直接沿用同一公式」，但若逐字套用 P4a 之全字串驗證公式，`'1980abc'` 會被誤判為「非全數字→視為 NaN→保留」，與 JS oracle 對前導數字之「解析出 1980→排除」語意矛盾（本文件 §五 `YEARABOVE-007` 已設計對應紅燈案例）。
- **影響**：若 tdd-implementation 誤用驗證公式取代擷取公式，含「前導數字+尾隨字母」形式之 `year_produ` 值（真實資料是否存在此形式待 tdd-impl 查證，本文件無法靜態確認）會被誤判保留而非依前導數字排除，造成 year-above 特例名單之案件篩選結果偏多（應排除卻未排除）。
- **建議**：`infrastructure/AD-E07-42-P3a-test.md` §五 YEARABOVE 已逐一設計對稱 PG PORT-001~007 之 8 個案例，並特別標注 `YEARABOVE-004`（空字串陷阱，`PATINDEX` 對空字串與「全字串皆數字」字面皆回傳 0）與 `YEARABOVE-007`（前導數字+尾隨字母，驗證擷取語意）為 MUST-FIX 旗艦案例。建議 system-architect 於下次修訂時將 AD §2.1 表格此站點之描述由「延伸」改為更明確的「需自行推導擷取公式，不可直接沿用驗證公式」，避免用詞歧義。
- **風險等級**：中（已有明確測試守門；真實 `year_produ` 資料中「前導數字+尾隨字母」形式之實際出現頻率未知，待 tdd-impl 查證，若該形式在真實資料中從未出現，此風險之實際業務影響會低於測試設計階段之理論評估）

### R-MSSQL-P3A-04（中高，Harness 環境依賴，AD 未涉及）：Stage 1 raw SQL 產出裸表名僅能解析至 `dbo`，且 `dbo` 已由 baseline migration 建有與 P1b2/P4 系列共用之六張表，既有 PG spec 之「DROP+re-synchronize」模式不可原樣移植

- **問題**：test-designer 逐行查證 `1751884800000-MssqlBaselineSchema.ts`，確認 `ob_pool_data`/`ob_pool_data_list`/`ob_list_definition`/`assignment_run`/`ob_monthly_run_result`/`customer_core` 六張表皆已於 `dbo` schema 建有 CREATE TABLE。`stage1-sql-builder.ts`/`stage1-customer-core-clause.ts`/`stage1-sql-executor.ts` 產出之 SQL 全數使用裸表名（無 schema 前綴），僅能解析至連線 login 之 DEFAULT_SCHEMA（`dbo`，同 P1b2/P1b3 已確立之限制），故無法比照 `AD-E07-39-P1b1-test.md` 之獨立 `p1b1` schema 隔離策略。既有 F099/F109 PG spec 之慣例（`synchronize:true` 建立拋棄式副本表 + `afterAll` `DROP TABLE ... CASCADE`）若原樣移植至 MSSQL `dbo`，會摧毀 P1b2 parity 測試與 P4a~e ETL 測試共用依賴之持久化 baseline 結構。
- **影響**：若 tdd-implementation 未意識到此差異，直接依 PG spec 慣例撰寫 `beforeAll`/`afterAll`（`DROP TABLE`/重 `synchronize`），會在 CI 或本機併行/循序執行其餘 `.mssql.spec.ts` 套件時，破壞其餘套件對這六張表結構穩定存在之隱含假設，產生難以追查的跨檔案間歇性失敗。
- **建議**：`infrastructure/AD-E07-42-P3a-test.md` §零 0.2 已明確設計「共用既有表 + 前綴隔離寫入列 + 精準 DELETE（禁止 DROP/TRUNCATE）」策略（移植自 P4d §0.3 之 PG 側對稱建構原則），並於 §十四 `STATIC-001` 設計 MUST-FIX 靜態守門掃描此禁令。建議 tdd-implementation 執行本輪測試前，先以 `TS-MSSQL-P3A-GATE-002` 確認六表已存在（bootstrap 已完成），若否應先執行 baseline migration 而非自行建表。
- **風險等級**：中高（已有明確 Harness 設計與靜態守門降低風險；但此類「跨測試檔案共用持久化表」之協調慣例目前僅存在於本文件與 P1b1/P1b2/P1b3 之零星記錄中，尚無專案級共用文件統一說明，建議中長期建立一份跨 MSSQL 測試套件共用之 Harness 慣例索引，避免每個子切片各自重新發現同一限制）

### R-MSSQL-P3A-05（中，AD 明確授權之開放式決策點，非阻擋）：`buildCustomerCoreClause` 現行由 `buildStage1Sql`（PG 下推）與 `executeStage1Chain`（JS oracle）共用同一函式，MSSQL 上是否需要讓 `executeStage1Chain` 也 dialect-aware 化，AD 未涉及

- **問題**：`stage1-customer-core-clause.ts` 檔頭註解明載此函式「PG 下推與 chain 路徑共用同一函式」，此設計在 PG 上使兩路徑天然等價。P3a 為 `buildStage1Sql` 建構 mssql 版時，`executeStage1Chain`（`stage1-filter-chain.ts`，AD §1.1 檔案改動清單未列此檔）若未同步 dialect-aware 化，`executeStage1Chain` 在 MSSQL 連線下呼叫 customer_core 條件會嘗試執行 PG 專屬 `AGE()`/`EXTRACT()`/`::date` 語法而拋錯。由於 §二 DISPATCH 群組已將 MSSQL 環境正確接線至 mssql 下推路徑（非 `executeStage1Chain`），此問題在**生產路徑**上不會發生；但在**測試設計方法論**上，直接影響 P3a customer_core EQ 群組能否沿用 F109 PG spec 之 `chainPks()`/`estimateCount()` 雙路徑比對模式。
- **影響**：測試設計層面：若 tdd-implementation 未意識到此限制，直接複製 F109 PG spec 之 `chainPks()` 呼叫模式到 mssql spec 檔案，會在 customer_core 條件案例上遇到執行期語法錯誤（非測試邏輯錯誤，而是誤用工具）。生產路徑層面：只要 §二 DISPATCH 群組確實接線正確，此問題不影響生產行為。
- **建議**：`infrastructure/AD-E07-42-P3a-test.md` §0.3 已記錄兩種可行路徑（dialect-aware 化 `stage1-filter-chain.ts` vs 維持不變改用手算 JS oracle），§十 CCEQ 群組依預設路徑（不改動 `stage1-filter-chain.ts`，改用測試檔內手算 oracle）設計，並於 `GATE-003`/`CCEQ-GATE-001` 要求 tdd-implementation 於 impl log 記錄實際選擇。此為 AD 明確留給下游決定 HOW 層級細節之開放點，非阻擋項。
- **風險等級**：低-中（已有明確測試方法論設計降低「無法執行」之風險；純屬測試方法論選擇，不影響生產行為正確性，僅需 tdd-implementation 於 impl log 落實記錄以維持未來可維護性）

### R-MSSQL-P3A-06（低，待 tdd-impl 真庫驗證項）：`customer_core.source_customer_no` UNIQUE 約束於 MSSQL baseline migration 未查得對應索引/約束陳述式

- **問題**：test-designer grep `1751884800000-MssqlBaselineSchema.ts` 之 `customer_core` 相關陳述式，僅確認 `CREATE TABLE`/`DROP TABLE`，未見 `source_customer_no` 之 UNIQUE INDEX/CONSTRAINT 陳述式（PG baseline `1711360000000-BaselineSchema.ts` 則明確有 `customer_core_source_customer_no_key UNIQUE (source_customer_no)`）。此為工具查證之限制（該行極長，Grep 工具可能省略），**非**確認性結論，記為待查證項。
- **影響**：若 MSSQL baseline 確實遺漏此約束，I-CC-JOIN-CARD-01（JOIN 基數 ≤1:1 保證 COUNT 不因 JOIN 膨脹）於 MSSQL 上僅依賴 fixture 資料紀律（測試/種子資料不刻意製造重複 `source_customer_no`），而非資料庫層防線；若未來真實 ETL（P4d 56 節點 pipeline）之 UPSERT 邏輯出現 bug 導致重複列，MSSQL 上不會被資料庫約束攔截，而 PG 上會立即因 UNIQUE 違反而報錯（訊號不對稱）。
- **建議**：`infrastructure/AD-E07-42-P3a-test.md` §一 `GATE-004` 已設計決策關卡直接查詢 `sys.indexes`/`sys.key_constraints` 確認。若確認不存在，建議 system-architect 評估是否需要補一支收尾 migration 補齊此約束（與 P3a 範圍無關，屬 P4/baseline 收尾項）。
- **風險等級**：低（P4d 之 target-load UPSERT 邏輯已有自身去重機制把關，此約束為資料庫層第二道防線而非唯一防線；純屬待查證的環境事實缺口，非功能性風險）

## MSSQL 全面遷移 P3b 風險與待決問題（AD-E07-42，2026-07-08 新增，P3 第二片，本 AD §6.1 明文「風險最高單一區塊」）

> 完整測試設計見 [infrastructure/AD-E07-42-P3b-test.md](infrastructure/AD-E07-42-P3b-test.md)。本節彙整 P3b（Stage 2~3 計分 raw SQL 引擎移植）範圍內識別之風險；3c 比例分派／3d CR 優先分派／3e `fn_calc_tier_level` 收尾之風險留待各自測試設計文件記錄。

### R-MSSQL-P3B-01（🔴🔴 高，test-designer 全新查證出之隱蔽架構退化缺口，AD 完全未提及，同型於 P3a/P1c/P2b 已反覆出現之 DISPATCH 陷阱）：`resolveStage2to4Strategy` 現行二元-ish gate 使 `DB_TYPE='mssql'` 靜默落入 in-memory JS 執行路徑而非 SQL 下推

- **問題**：`assignment-run-pipeline.service.ts:174-180` 現行邏輯 `DB_TYPE==='postgres' → 'pushdown'；否則依 ASSIGNMENT_PIPELINE_V2 選 'v2Inmemory'/'v1Inmemory'`。`DB_TYPE='mssql'` 落入 else 分支。與 P3a/P1c/P2b 已知陷阱不同之處：本站點**不會拋錯**（`executeV2` 為 DB-agnostic 純 TypeORM repo 查詢，可在 MSSQL 上正常執行且計分結果正確），純屬「功能正確但違反 I-NOLOAD-01 架構意圖（re-hydrate 全 pool 回 heap）」之隱蔽缺口，不會被任何功能正確性測試揪出，僅能靠明確 spy 呼叫路徑之 DISPATCH 測試發現。
- **影響**：MSSQL 生產環境下若此缺口未修復，月名單分派會持續以 in-memory 全量載入方式執行（而非 SQL 下推），在大規模資料量下重現 P3 系列意圖解決之效能/記憶體問題（呼應 `project_monthly_run_inprocess_execution.md` 記錄之历史 OOM 教訓）。
- **建議**：`infrastructure/AD-E07-42-P3b-test.md` §二 DISPATCH 已設計 4 案 MUST-FIX 守門（對現行未修改程式碼刻意設計為紅燈），要求 `Stage2to4Strategy` 型別升級為三態（`pushdownPg`/`pushdownMssql`/`v1Inmemory`/`v2Inmemory` 之明確區分）。
- **風險等級**：高（不影響功能正確性，但直接違反 P3 系列最核心之架構目標 I-NOLOAD-01；且因不拋錯、不產生錯誤資料，極易在 code review 或功能測試中被忽略，只能靠專門設計的 spy 測試攔截）

### R-MSSQL-P3B-02（🔴🔴 高，AD 已提及風險存在但未點出具體語意區分，易致誤判為需要全新設計）：三處 `~ '^[0-9]+$'` 正則站點語意與 P3a year-above 站點不同，可直接複用 P4a 已驗證公式

- **問題**：AD §2.2 表格將 `SAFE_INT_CUS_SEX`/`IS_PERSONAL_GATING`/EDUCAT_BACK `numExpr` 三處標「風險：高」，但未明確指出這三處與 P3a year-above 站點（`^[0-9]+` 無錨點前導擷取）語意層級不同——本三處皆為 `^[0-9]+$`（含 `$` 錨點，全字串驗證），與 P4a `type-cast-handler-mssql.ts` 已驗證之 `getValidationRegex` 手法（`NOT LIKE '%[^0-9]%'` + `LEN(x)>0` + `TRY_CAST`）屬**同一語意層級**，理論上可直接複用而非如 P3a 般自行推導 `PATINDEX` 新公式。若 tdd-implementation 因 AD「高風險」標籤誤判為需要重新設計，會產生不必要之重工，且重新設計反而可能重新踩 P4a 已解決之空字串陷阱。
- **影響**：若誤解此區分，可能導致額外開發成本；反之若正確複用但未逐一驗證三處各自實際輸入（原始欄位 vs `COALESCE(NULLIF(...),'1')` 包裝 vs 巢狀 `CASE` 補零字串），仍可能遺漏各站點特有邊界（如 EDUCAT_BACK 之非數字補零字串 `'AB'`）。
- **建議**：`infrastructure/AD-E07-42-P3b-test.md` §三/四/五/六 REGEX-SAFESEX/GATING/EDUCAT/META 四群組已明確記錄語意區分，並針對三處各自組合輸入逐一設計邊界案例（合計 18 案）。
- **風險等級**：中高（主要為認知/效率風險，非功能正確性風險；若複用得當，三處轉換之技術難度低於 AD 標籤暗示之程度）

### R-MSSQL-P3B-03（🔴 高，test-designer 全新查證出之靜默偏差缺口，AD 提醒「須各自驗證」但未點出具體參數混淆風險）：Stage 2 AGE/CAR_YEAR 之參考日期為「今日」而非 Stage 1 之 `ccWorkdt`，複製貼上易誤植錯誤參數

- **問題**：Stage 2 計分之 AGE（PG `age(cc.date_of_birth)` 單引數，隱含 `CURRENT_DATE`）與 CAR_YEAR（`EXTRACT(YEAR FROM CURRENT_DATE)`）皆以「執行當下實際日期」為參考，JS golden oracle 對應為 `calcAgeYears(dob, new Date())`；Stage 1 篩選之 AGE 站點則明確以 `:ccWorkdt`（月名單分派工作月）為參考日。AD §2.2 表格文字提醒「須各自轉換與各自驗證，不可假設改一處兩處都對」，但未明講兩處參考日期參數本身不同。P3a 已驗證之 `DATEDIFF(YEAR, dob, @ccWorkdt) - CASE...` 公式**形狀**可複用於本站點，但若複製貼上時未將 `@ccWorkdt` 替換為 `SYSDATETIME()`/`GETDATE()`，會計算出「以月名單分派工作月為基準的年齡/車齡」而非「以執行當下實際日期為基準」，且**不會拋錯**（兩者皆是合法日期運算，僅數值系統性偏移）。
- **影響**：跨月份查驗（如月底跑上月資料）時，AGE/CAR_YEAR 計分結果會產生月份相依之系統性偏差，且無明顯錯誤徵兆，可能長期潛伏至業務端發現分數異常才被追查。
- **建議**：`infrastructure/AD-E07-42-P3b-test.md` §七 AGESCORE-META-001（MUST-FIX 旗艦守門）與 §八 CARYEAR-002 已設計「刻意以非當月工作月驗證計分結果不隨之變動」之測試手法，直接攔截此類參數混淆。
- **風險等級**：高（靜默錯誤、無崩潰徵兆，且發生條件〔複製貼上既有驗證過的公式〕相當自然，任何未特別留意此細節的實作方式都可能踩入）

### R-MSSQL-P3B-04（🔴🔴 高，test-designer 全新查證出之精度缺陷，AD 未點名此具體站點，屬 FINDING-P4D-01 同型缺陷家族新發生位置）：LOAN_RATE `CAST(o.loan_rate AS numeric)` 無精度宣告，T-SQL 預設精度會四捨五入去除小數

- **問題**：`stage2to4-sql-builder.ts:277` 之 `CAST(o.loan_rate AS numeric)`（PG，無精度宣告）。test-designer 查證 `ob_pool_data.loan_rate` 之 MSSQL baseline 型別為 `numeric(5,2)`（保留 2 位小數）。PG 未限定精度之 `numeric` 對已具型別來源值原樣保留；但 T-SQL 未指定精度之裸 `NUMERIC` 等同 `NUMERIC(18,0)`，若逐字翻譯，會將如 `12.50` 四捨五入為 `13`，使 LOAN_RATE range 計分比對之數值系統性偏移，且不拋錯（靜默數值錯誤）。此為 I-MSSQL-DECIMAL-NORMALIZE-01 揭示之 FINDING-P4D-01（P4d ETL type_cast 節點之數值精度缺陷）同型缺陷家族，僅發生位置從 ETL 節點換成計分 SQL 本身，AD 通用原則已涵蓋但未在 §2.2 表格逐站點清單中點名此具體站點。
- **影響**：LOAN_RATE 為 F103/F104 計分維度之一，若精度受損，會使部分案件之計分結果落入錯誤 score row（尤其小數邊界附近之 range 比對），影響 card_level/tier_level 進而影響分派結果。
- **建議**：`infrastructure/AD-E07-42-P3b-test.md` §十四 DECIMAL-LOANRATE-001（MUST-FIX 旗艦守門，已知具體數值斷言：`12.50` 命中 `[12.00,12.99]` 之 score row）+ §一 GATE-004（決策關卡，要求 impl log 記錄採用之精度宣告方式，建議 `NUMERIC(5,2)` 對齊來源欄位）。
- **風險等級**：高（直接影響計分正確性，且與 FINDING-P4D-01 同型，建議 system-architect 於未來 AD 修訂時，將「裸 `CAST(...AS numeric)` 逐站點掃描」納入標準檢查清單，而非僅在通用原則段落提及）

### R-MSSQL-P3B-05（中，Harness 環境依賴延伸，本輪已依任務指示設計改善方案）：P3b 新增依賴 6 張計分專屬表，延續 P3a「共用既有 dbo 表」策略但新增自建/自清機制

- **問題**：P3b 除 P3a 已依賴之 6 張共用表外，額外依賴 `ob_levelcard_version`/`ob_levelcard_column`/`ob_levelcard_score`/`ob_levelcard_level`/`ob_tier`/`ob_arreturndf_min_cap` 6 張計分專屬表（皆已查證存在於 MSSQL baseline）。P3a impl log 明文記錄「正式 CI 需先 bootstrap dbo baseline 才能執行本套件 DB 案例」為已知盲點。
- **影響**：若 P3b 沿用 P3a 相同策略（僅共用既有表、不自建），CI 環境若尚未執行過 baseline migration，P3b 套件會無法獨立執行，重演 P3a 已知盲點。
- **建議**：`infrastructure/AD-E07-42-P3b-test.md` §零 0.2 已依任務指示設計改善方案——`beforeAll` 冪等自建（零 drift DDL，逐字複製 baseline migration 陳述式）+ `afterAll` 條件式清理（本次自建之表 DROP 還原；原本已存在之共用表僅前綴 DELETE，絕不 DROP/TRUNCATE）。§二十三 HARNESS 群組已設計 5 案驗證此機制（含冪等性守門）。**待 tdd-impl 真庫驗證**：本機 CDMP_TEST dbo 平時已含全部 12 表（P1b2/P4 系列已建立），自建分支需人為製造缺表情境才能驗證（比照 P3a impl log「取得真庫證據」之暫時性驗證手法）。
- **風險等級**：中（已有明確改善設計，剩餘風險僅為「自建分支實際未在真正缺表環境下驗證過」之執行面待辦，非設計缺陷）

### R-MSSQL-P3B-06（低-中，開放式決策點，AD 未涉及，架構上留給下游決定）：`resolveColumnSource` 之 `to_jsonb` fallback 改為 TS 端 schema 檢查後，函式簽章需調整以容納非同步 IO 結果

- **問題**：現行 `resolveColumnSource(columnName, cardType)` 為同步純函式。I-MSSQL-DYNAMIC-FALLBACK-01 要求 fallback 分支於 SQL 生成前以 `INFORMATION_SCHEMA.COLUMNS` 查詢決定欄位存在性，此查詢為非同步 IO，與現行函式簽章不相容，AD 未具體規定簽章調整方式。
- **影響**：純屬 HOW 層級實作細節，不影響業務語意（幽靈欄位仍應產生 `+0`，BR-F103-08 語意不變），但若 tdd-implementation 選型不當（如逐欄查詢造成 N+1），會產生非預期效能開銷。
- **建議**：`infrastructure/AD-E07-42-P3b-test.md` §0.4 已列出至少兩種可行選項（呼叫端 `async` 預查 + 第三參數注入 / 模組層級快取單例），不預設答案，§一 GATE-002 要求 tdd-implementation 於 impl log 記錄實際選擇。§七 FALLBACK 群組測試案例設計為純黑盒行為驗證，不綁定簽章形狀。
- **風險等級**：低-中（架構授權之彈性，主要風險為「若未於 impl log 記錄選擇，未來讀者難以追溯」之文件紀律風險，非功能正確性風險）

## MSSQL 全面遷移 P5c 風險與待決問題（AD-E07-43，2026-07-08 新增，P5 全量 CI + 業務簽核第三片，接續 P5b）

> 完整測試設計見 [infrastructure/AD-E07-43-P5c-test.md](infrastructure/AD-E07-43-P5c-test.md)。本節彙整 P5c（MONTHRUN-DIFF 真實完整月名單分派跨引擎逐列比對）範圍內識別之風險；P5d（datetime2 業務裁示）/P5e（F067 式簽核報告與業務簽核本身）/P5f（部署 bootstrap）為業務/維運流程，非 test-designer 職責範圍，風險另由對應流程承接人記錄。⚠️ **本節同時是 risks-and-gaps.md 自 P3c 起累積之既有文件紀律缺口的部分補救**——`infrastructure/AD-E07-42-P3c-test.md`／`AD-E07-42-P3d-test.md`／`AD-E07-43-P5b-test.md` 三份測試設計文件目前於本檔案**皆無對應風險段落**（僅 P3a/P3b 有），建議未來一次性稽核補齊，非本輪 P5c 範圍但一併記錄供追蹤。

### R-MSSQL-P5C-01（🔴🔴 高，決策關卡，交 system-architect/業務裁定，非 test-designer 或 tdd-implementation 可自行裁定）：Tier 1（JS oracle vs MSSQL）是否足以滿足 I-MSSQL-SIGNOFF-GATE-01 條文字面「PG/MSSQL 結果一致」要求

- **問題**：AD-E07-43 §6 I-MSSQL-SIGNOFF-GATE-01 條文字面明確要求「MONTHRUN-DIFF 對至少一個完整生產規模月名單分派顯示 **PG/MSSQL** 結果一致」，但現行環境約束（`postgres-test` 5433 本機不可達、`dev PG` 5432 視為唯讀不可注入測試）使得「PG 實際執行結果」現行不可直接取得。test-designer 裁定之 Tier 1（JS oracle vs MSSQL 全鏈比對）雖有 P3a-d 逐站點 EQ 佐證其可信度（JS oracle 已被專案自身程式碼註解標註為「golden oracle，與 PG SQL 下推逐列確定性等價」），但嚴格而言 JS oracle 是「PG 版本應該產出什麼」的程式碼層級代理，不是「PG 版本實際執行產出什麼」的直接觀測，兩者是否可視為等價證據，屬於證據力道判斷，非技術查證可單方面裁定。
- **影響**：若 architect/業務最終認定 Tier 1 不足以滿足字面要求，cutover 前需額外投入 Tier 2（等待 5433 恢復可達）或 Tier 3（PG 快照資料工程，額外腳本工作量）才能完成簽核，可能影響 cutover 排程；若未經明確裁定就逕行以 Tier 1 結果簽核，可能在未來稽核時被質疑證據力道不足。
- **建議**：`infrastructure/AD-E07-43-P5c-test.md` §一 GATE-002（決策關卡）+ §六 REPORT-004（MUST-FIX）已要求最終差異報告於最顯著位置明確聲明實際涵蓋之 Tier 範圍，並列出待裁示選項，供 P5e 簽核流程之業務利害關係人於報告呈現時一併裁定，不由本文件或 tdd-implementation 逕自認定「已經夠好」。
- **風險等級**：高（直接影響 P5e 簽核是否成立、進而影響 cutover 排程，且屬於本專案既有慣例「業務簽核不可由工程團隊自行認定已足夠」之核心紅線，AD 本身亦於 §5 P5e DoD 明文強調此點）

### R-MSSQL-P5C-02（中，已知限制之新情境延伸，非本文件新發現但屬本文件首次需要在「全鏈組合」層級妥善處理其後果）：`executeStage1Chain` 內部 customer_core 片段為 PG-only SQL，限制 Tier 1 JS oracle 對含 customer_core 條件名單之直接可用性

- **問題**：P3a 已查證 `buildCustomerCoreClause`（`executeStage1Chain` 內部呼叫）含 `AGE()`/`EXTRACT()`/`::date` 等 PG-only SQL 字面，若對 MSSQL 連線之 repo 執行、且名單篩選條件包含 customer_core 維度，會拋語法錯誤。P5c 為首次需要在「完整月名單分派全鏈」情境下處理此限制之切片（P3a 當時僅需獨立驗證 Stage 1 本身、可直接繞開；P5c 需要含 customer_core 條件之名單仍完整流入 Stage 2-4/CR 比對）。
- **影響**：若 tdd-implementation 未正確理解此限制、誤將含 customer_core 條件之名單導入 `runStage1JsChain` 直接呼叫路徑，會導致腳本執行期間拋錯而非優雅處理，且可能誤判為新缺陷（而非已知限制）浪費除錯時間。
- **建議**：`infrastructure/AD-E07-43-P5c-test.md` §0.4 已設計「Stage 1 單次執行（走 MSSQL 下推）、雙寫兩個 run_id」之繞開機制，§一 GATE-004（Regression / Static Guard）要求腳本原始碼掃描確認名單分流邏輯確實存在。
- **風險等級**：中（已有明確設計因應方案，剩餘風險為「tdd-implementation 落地時是否確實遵循此分流設計」之執行面待辦，非設計缺陷本身）

### R-MSSQL-P5C-03（中，Probe，不預設答案，交 P5d 業務裁示）：`appl_date` 非午夜時間分量對「逾 2 年清空」邊界判定之影響，於完整鏈路層級仍未解決

- **問題**：P3d `DATECAST-003` 已於單站點層級記錄此為未驗證假設；P5c §四 DATECAST-BOUNDARY 群組於完整鏈路組合層級重新揭露，但同樣不預設答案、不代業務裁定可接受度。production `ob_pool_data_list.appl_date` 是否確實可能帶有非午夜時間分量，仍待 P5d（業務/維運協助查詢真實樣本）確認。
- **影響**：若 production 確實存在非午夜時間分量、且 JS oracle 與 MSSQL 對此邊界判定產生分歧，可能使「逾 2 年清空」規則於邊界案件產生跨引擎不一致結果，影響 CR 業代指派正確性（低機率但非零，取決於 production 實際資料分布）。
- **建議**：`infrastructure/AD-E07-43-P5c-test.md` §四 DATECAST-BOUNDARY（3 案例）+ §六 REPORT-005 已設計獨立記錄段落，明確標註「待 P5d 業務裁示」而非併入一般差異表，避免與真正需要修復之缺陷混淆。此風險之最終解決依賴 AD §4「需使用者/業務裁示事項」#1（P5d）而非本文件範圍。
- **風險等級**：中（已有明確揭露機制，最終風險接受度取決於 production 實際資料分布與業務對「日粒度 vs 秒粒度」判定之容忍度，非 test-designer 可獨立評估）

### R-MSSQL-P5C-04（低，記錄性，AD 文件內部落差）：AD-E07-43 §3.1 與 §5 對 MONTHRUN-DIFF 比對欄位計數之字面落差（10 欄 vs 「9 個關鍵欄位」）

- **問題**：AD §3.1（方法敘述）列出 10 個比對欄位（含 `cr_nm`），但 §5 P5c DoD 條文字面稱「9 個關鍵欄位」且逐一列舉時漏列 `cr_nm`。
- **影響**：極低——`cr_nm` 為 `cr_id` 之衍生展示欄，納入比對成本極低，不會產生誤判風險；純屬文件精確度問題。
- **建議**：`infrastructure/AD-E07-43-P5c-test.md` §一 GATE-003 已裁定採兩者聯集（10 欄）為設計範圍。建議 system-architect 下次修訂 AD-E07-43 時同步此落差。
- **風險等級**：低（不影響測試設計完整性或正確性，僅為文件精確度之待清理項）

### R-MSSQL-P5C-05（中-高，環境約束，本專案 MSSQL 遷移系列已重複發生之已知限制）：`postgres-test`（5433）持續不可達，限制本文件 Tier 2/3 之真實執行

- **問題**：本專案 MSSQL 遷移系列自 P4a 起即反覆記錄「`postgres-test`（5433）本機不可達、`dev PG`（5432）視為唯讀不可注入測試」之環境限制（見 `AD-E07-41-P4a-impl.md` `EXTRACT-RESOLVE DUAL-DB` 偏差段落），P5c 為此限制影響範圍最大之切片——因為 I-MSSQL-SIGNOFF-GATE-01 明確要求「PG/MSSQL」比對，此環境限制直接決定本文件只能以 Tier 1（JS oracle）作為現行唯一可執行路徑（見 R-MSSQL-P5C-01）。
- **影響**：若此環境限制於 cutover 前始終未解決（5433 未恢復可達、亦未投入 Tier 3 資料工程），P5e 業務簽核將只能基於 Tier 1 證據進行，此為 R-MSSQL-P5C-01 之根本成因。
- **建議**：`infrastructure/AD-E07-43-P5c-test.md` §一 GATE-001 已設計 `pgPortReachable()` 探測案例，§七 PG-ENHANCE 群組已設計 degradable 機制（5433 恢復可達時可立即啟用 Tier 2，無需重新設計）。建議另立小型維運任務評估 `postgres-test` 容器於本機環境不可達之根本原因是否可修復（非本文件範圍，但直接影響本文件證據力道上限）。
- **風險等級**：中-高（非本文件可獨立解決，但直接決定本文件所能提供之最高證據等級；建議記入 P5e 簽核流程之風險登記，供業務利害關係人評估是否可接受）

## MSSQL 全面遷移 P5 收尾顯示層 follow-up 風險與待決問題（AD-E07-43，2026-07-09 新增，P5h/P5i 明文記錄之 follow-up 正式解凍）

> 完整測試設計見 [infrastructure/AD-E07-43-P5-followup-display-test.md](infrastructure/AD-E07-43-P5-followup-display-test.md)。本節彙整兩項獨立顯示層 follow-up（`ob_monthly_run_result.cr_nm` varchar→nvarchar；`assignment-run-report.service.ts::formatApplDate` 匯出 SQL 端格式化）之風險。⚠️ **命名更正記錄**：任務指示原稱本切片為「P4-followup」，test-designer 逐行查證兩項來源皆明文記錄於 `AD-E07-43-P5i-impl.md`／`AD-E07-43-P5h-impl.md`（P5 階段），非 P4，已更正檔名為 `AD-E07-43-P5-followup-display-test.md`，與既有 `AD-E07-41-P4-followup-rawdata-test.md`（不同階段、不同主題）之命名慣例保持一致但不混淆。

### R-MSSQL-P5FU-01（🔴🔴 高，test-designer 本輪真庫新查證，改變 AD/impl log 原始風險定性）：`cr_nm` varchar→nvarchar 並非單純顯示截斷風險，而是 Stage 1 月名單分派批次寫入之潛在可用性風險

- **問題**：`cr_nm` 之唯一寫入站點（`stage1-sql-executor(.ts/-mssql.ts)`）為單一 set-based `INSERT INTO ob_monthly_run_result ... SELECT ...` 陳述式（非逐列 cursor）。真庫探針證實 SQL Server 對 `varchar(N)` 容量溢位之 INSERT 採**明確拋錯**（`String or binary data would be truncated`），非靜默截斷。若任一列之 `'CR'+emp_nm` 超過 50 bytes，會使**整批 Stage 1 INSERT 失敗**（該名單整批案件寫入失敗），而非僅該列顯示錯誤或該列被跳過——此為比 P5i 原始 framing（「中文顯示欄位截斷」）更嚴重的可用性風險等級。
- **影響**：若 MSSQL cutover 後某月遇到超長 CR 業代姓名（現行系統無長度前端驗證機制），可能導致該名單整批 Stage 1 寫入失敗、月名單分派中斷，需人工排查方能定位根因（錯誤訊息不會直接指向「業代姓名過長」，需追查至 SQL 層級錯誤）。
- **建議**：`infrastructure/AD-E07-43-P5-followup-display-test.md` §四 CRNM-WRITEPATH 群組（WRITEPATH-001/002）已設計透過真實生產寫入路徑（非孤立探針表）驗證修法前後對照，並要求 impl log 明確記錄「整批失敗」現象供 architect 知悉。修法（nvarchar 化）本身即可完全消除此風險（25 字元→實質不可能觸頂的容量）。
- **風險等級**：高（機率極低但影響面為整批月名單分派中斷，且修復成本低——僅需採用既有 `nvarcharColumnType` helper，無需新架構）；已有明確修法方向，非開放性問題

### R-MSSQL-P5FU-02（低，記錄性，佐證修法優先度非高危）：`cr_nm` 現行實際觸發機率極低，已用真實生產資料驗證

- **問題**：PG `cdmp_dev`（production-representative，2026-07-09 唯讀查詢）實測 `ob_pool_data_list.cr_nm` 現有最長值僅 **5 字元**（`'CR'+3 中文字`），距 50-byte（25 中文字）容量上限尚遠；`ob_monthly_run_result.cr_nm` 現有 26,695 筆非空值列，確認此為真實高頻使用路徑但資料形態穩定短小。
- **影響**：極低——現行業代姓名長度分佈與容量上限有充分安全邊際，R-MSSQL-P5FU-01 之風險屬「防禦性修復未來風險」而非「現行已發生或迫近之事故」。
- **建議**：`infrastructure/AD-E07-43-P5-followup-display-test.md` §三 CRNM-PRODSCALE-001 已記錄此數字。建議修法仍應完成（成本低、對齊 P5i 已建立之全域 nvarchar 慣例、消除未來風險），但排程優先度可低於真正 cutover-blocker 項目，與任務標籤「P2-TechDebt（非阻擋 cutover）」一致。
- **風險等級**：低（不影響修法必要性判斷，僅供優先度排序參考）

### R-MSSQL-P5FU-03（🔴🔴 高，test-designer 本輪真庫新查證，量化既有 P5h follow-up 之實際曝險面）：`appl_date` 匯出跨引擎 getter 偏移之危險帶並非邊緣案例，production 資料 15.4% 落入危險帶

- **問題**：P5h impl log 原將此 follow-up 描述為「跨引擎無單一正解、匯出顯示層、非阻擋」，未量化實際曝險面。test-designer 本輪對 PG `cdmp_dev`（生產資料代表性樣本，MSSQL 尚無業務資料）之 `ob_pool_data.appl_date`（1,679,489 列，100% 非 NULL）小時分佈實測：wall-clock **≥16:00**（P5h code comment 描述之危險帶）者共 **258,461 列（15.4%）**——並非罕見邊界案例，而是近六分之一真實生產資料。cutover 後若不修，這些案件之 MSSQL 匯出「進件日」欄將系統性 +1 日。
- **影響**：若 MSSQL cutover 後此 follow-up 未同步修復，F064/F108 匯出功能將對約 15.4% 案件產生錯誤的「進件日」顯示值（+1 日），可能影響業務對帳、稽核與月結報表之正確性判讀，且屬於「系統性偏移」（非隨機錯誤）不易被使用者以肉眼發現規律。
- **建議**：`infrastructure/AD-E07-43-P5-followup-display-test.md` §六 APLFMT-BOUNDARY 已用真 MSSQL 逐秒驗證精確邊界（15:59:59 正確／16:00:00 起錯誤）並確認 `CONVERT`/`FORMAT` SQL 端格式化方案於全部樣本（含邊界）皆正確；§七 APLFMT-EXPORT 已設計端對端匯出驗證。建議 architect/業務重新評估此 follow-up 之排程優先度——雖然本身不影響引擎計分/分派/簽核路徑（P5h 原始判定「非阻擋 cutover」之理由本身仍然成立），但對「MSSQL cutover 後匯出資料正確性」之實際使用者體感影響遠高於原始 framing，建議列為 cutover 後**儘速**（而非「有空再做」）排程項目。
- **風險等級**：高（量化後之曝險面顯著，但修法方案已明確、驗證已完成、無需額外設計工作，純屬排程優先度之業務判斷）

### R-MSSQL-P5FU-04（中，test-designer 本輪新查證，既有測試資產隱性約束）：既有 `f064-export-23col.spec.ts` sliceFn 靜態測試對 `appl_date` 修法程式碼位置有隱性約束

- **問題**：`TS-F064-APLDATE-002` 等既有測試以原始碼文字切片（`sliceFn`，非執行）比對 `buildExportQuery()` 方法體是否含 `o.appl_date` 子字串。若 tdd-implementation 將 dialect-aware 格式化邏輯抽為外部 helper 函式（而非在方法體內 inline 組裝字面常數），會使既有靜態測試因抓不到字面文字而誤判回歸，即使實際 SQL 邏輯完全正確。
- **影響**：若未注意此隱性約束，可能導致 tdd-implementation 誤以為既有測試發現了新缺陷而額外除錯，或反向地為了讓測試通過而被迫採用較不理想的程式碼組織方式。
- **建議**：`infrastructure/AD-E07-43-P5-followup-display-test.md` §一 GATE-001 已明確要求 inline 組裝為預設方向，並提供「若選擇外部 helper 則同步更新測試斷言方式」之替代路徑，非強制唯一解。
- **風險等級**：中（已有明確設計因應方案，純屬 tdd-implementation 落地時需留意之既有測試耦合關係，非設計缺陷）

---

## F112 類別型篩選欄位可選值自動建議測試風險與待決問題（AD-E07-47，2026-07-12 新增）

> 完整測試設計見 [features/F112-test.md](features/F112-test.md)（US-178，81 場景：後端 59 + 前端 22）。本節彙整 test-designer 逐行比對 F112 spec v1.0、AD-E07-47 v1.0 與實際原始碼（`director.guard.ts`／`director-or-section-chief.guard.ts`／`options-tab.tsx`）後識別之落差與殘留風險。

### R-F112-01（🔴🔴 高，test-designer 本輪逐行查證原始碼，糾正 spec/AD 敘述性文字）：section_chief 與無角色使用者呼叫新端點之拒絕錯誤碼並非 spec/AD 文字籠統提及的 `AUTH_FORBIDDEN`，而是兩種不同的既有碼

- **問題**：F112 spec AC-17 與 AD-E07-47 皆以敘述性文字提及「403 `AUTH_FORBIDDEN`」，但 test-designer 本輪直接查證 `apps/api/src/common/guards/director.guard.ts:45,60` 與 `director-or-section-chief.guard.ts:43,62` 原始碼，發現：(a) 處長（`businessRole='section_chief'`）通過 class 級 `DirectorOrSectionChiefGuard` 後在 method 級 `DirectorGuard` 被攔截，實際拋出 `E07_REQUIRES_DIRECTOR`；(b) 無任何業務角色的一般使用者在 class 級 `DirectorOrSectionChiefGuard` 即被攔截，實際拋出 `E07_ROLE_NOT_ASSIGNED`——兩者錯誤碼不同、攔截層級也不同，皆非 `AUTH_FORBIDDEN`（該碼於本專案 E07 controller 家族現況已查無使用）。
- **影響**：若 tdd-implementation 或前端消費邏輯依 spec/AD 文字誤植斷言 `AUTH_FORBIDDEN`，測試會與實際 guard 行為不符（測試永遠紅燈或誤用寬鬆斷言掩蓋錯誤），前端錯誤文案分流邏輯（依 `error` 代碼字串顯示對應訊息）亦可能對兩種拒絕情境顯示相同（甚至錯誤）的提示文字，無法區分「你沒有業務角色，請聯絡 admin」與「此操作需部長權限」兩種語意完全不同的使用者引導。
- **建議**：`features/F112-test.md` GUARD 群組（GUARD-003/004/008/009）已明確斷言精確錯誤碼字串（非僅斷言 HTTP 403），並已在文件「Glossary — spec/AD 落差鎖定」表中鎖定此差異。建議 spec-writer 於下一輪 F112 spec 維護時同步修正 AC-17 之敘述文字為精確碼名。
- **風險等級**：高（若未鎖定，下游測試/前端實作極易依 spec 字面誤植錯誤碼；已有明確查證結果與測試斷言方式因應，非開放性問題）

### R-F112-02（中，AD 已裁定但下游文件尚未同步）：`error-handling.md` 與 F112 spec 原文尚未同步 AD-E07-47 之 500/504 與 `after_value` 裁定

- **問題**：AD-E07-47 §3.6 已將 `DISTINCT_VALUES_QUERY_TIMEOUT` 由 spec 建議之 504 改判為 500，並在 §3.8 澄清稽核內容應寫入既有 `after_value` 欄位（非 spec/BR-13 文字所寫之 `details`）；§11 已將此列為 spec-writer 待辦，但截至本測試設計完成時（2026-07-12）尚未同步。
- **影響**：若 tdd-implementation 僅參照 F112 spec 原文字面而非 AD-E07-47 或本測試設計文件，可能誤植 HTTP 504（`GatewayTimeoutException`，本專案全域無此使用前例）或誤在 `AssignmentAuditLog` entity 新增不必要的 `details` 欄位。
- **建議**：`features/F112-test.md` 已在「Glossary — spec/AD 落差鎖定」表明確採用 AD 裁定值，TIMEOUT-002／AUDIT-003 兩案例為對應之 regression guard。建議 tdd-implementation 落地時第一步即依 AD §9 檔案異動清單新增 `error-codes.ts` 4 個常數（`DISTINCT_VALUES_QUERY_TIMEOUT` 明確標註 500），作為後續測試前提；spec-writer 排入下一輪 F112 spec 維護時一併更正 §5.1/§9/§12.3。
- **風險等級**：中（已有明確裁定值與測試斷言因應，純屬文件同步落後，非設計層級缺口）

### R-F112-03（中，test-designer 本輪查證既有程式碼慣例後發現之實作陷阱）：Entry 2 新按鈕「處長不渲染」要求與既有相鄰按鈕「disabled 但可見」模式不一致

- **問題**：test-designer 查證 `apps/web/src/pages/assignment/_components/options-tab.tsx:87,469` 既有「新增可選值」按鈕採 `disabled={!canWrite}`（DOM 中該按鈕元素對處長仍然存在，僅呈現 disabled 狀態）。但 F112 spec §7.3 對新增之「從實際資料帶入可選值」按鈕明文要求「處長**不渲染**」（DOM 中應完全不存在該元素）。兩者為同一元件檔案內、視覺上緊鄰的兩個按鈕，卻要求不同的權限收斂模式。
- **影響**：tdd-implementation 若依鄰近程式碼慣例直接複製既有 `disabled` pattern 實作新按鈕，會通過「肉眼檢查处長看不到按鈕文字被 disabled 灰階」的粗略驗收，但無法通過以 `queryByTestId(...) === null` 為斷言方式的嚴格測試，且與 spec 文字要求的語意（完全不暴露此操作入口給處長）不符。
- **建議**：`features/F112-test.md` FE2-003 已明確標註斷言方式為「元素不存在於 DOM」而非「元素 disabled」，並在「Glossary」表與本文件皆記錄此落差。建議 tdd-implementation 實作時對這兩個按鈕採不同的條件渲染邏輯（既有按鈕維持 `disabled` 不變、新按鈕改用條件式 `{canWrite && <button .../>}` 或等價寫法），不可統一複製既有 pattern。
- **風險等級**：中（已有明確測試斷言方式因應，純屬容易被忽略的鄰近程式碼慣例陷阱，非設計缺陷）

### R-F112-04（低，AD 已明確標註為已知限制，非本次新增風險）：`DISTINCT_VALUES_TIMEOUT_MS=15000` 未經真實 MSSQL `customer_core` 大表實測，且 `Promise.race` 不真正取消 DB 端查詢

- **問題**：AD-E07-47 §10.2 明文此逾時預設值延續 spec 原始（已過時）15s 假設，未針對 `customer_core.occupation_desc`（55 種 distinct 值散佈於約 360 萬列、無索引）做過真實 MSSQL 計時驗證；§10.1 另指出 `Promise.race` 僅讓 HTTP 回應提前逾時，並不會取消資料庫端已送出之查詢（orphaned query 會繼續執行至完成或撞上全域 1 小時 driver timeout）。
- **影響**：若真實 `customer_core` 大型類別欄位之 DISTINCT 查詢在生產環境經常逼近或超過 15s 預算，使用者會頻繁看到逾時錯誤（即使資料本身合法）；orphaned query 若長期累積可能對 DB 連線池造成壓力（AD 已列為未來效能監控項）。
- **建議**：`features/F112-test.md` 「殘留風險」§A/§E 與總結之「刻意排除範圍」已明確記錄此為單元測試層級無法驗證之範疇（需要真實 DB 連線與查詢監控），並建議 tdd-implementation 落地時於 dev CDMP 對 `customer_core.occupation_desc` 手動計時一次（AD §11 待裁決項），確認 15s 預算是否寬裕；若經常貼近逾時邊界，後續應為該欄位新增單欄索引或調整 `POOLDATA_DISTINCT_VALUES_TIMEOUT_MS` 環境變數。
- **風險等級**：低（v1 不索引不阻擋上線，AD 已預留 env 覆寫與未來索引路徑；非測試設計缺口，屬產品上線後之營運觀測項）

---

## F117 部門比例設定頁僅提供「有在職處長」之部門設定測試風險與待決問題（AD-E07-48，2026-08-04 新增）

> 完整測試設計見 [features/F117-test.md](features/F117-test.md)（US-180，31 場景：後端 Unit 12 + Integration 6 + 前端 Component 8 + E2E Fidelity 5）。F117 spec 本身之業務裁決（D-1~D-6）已於 2026-08-04 人工審閱閘全數核可，本節記錄的是**測試基礎設施層級**（非業務規則層級）之殘留缺口，均不阻擋 TDD 進入實作。

### R-F117-01（中，測試基礎設施缺口，非業務規則缺口）：Playwright E2E fidelity 環境缺少 `business_role='director'` / `'section_chief'` 之 dev 種子測試帳號

- **問題**：`apps/api/src/database/seeds/seed.ts`（本機/CI dev bootstrap 種子）目前僅提供 4 個帳號（`admin@cdmp.test` / `disabled@cdmp.test` / `user@cdmp.test` / `manager@cdmp.test`），其中 `manager@cdmp.test` 僅設 `is_sales_manager=true`（legacy 旗標），**無任何帳號設定 `business_role='director'` 或 `'section_chief'`**。`apps/api/src/database/seeds/data/users-real.json`（`prod-data-seed`）雖含真實 director/section_chief 帳號，但為真實員工姓名/Email 且密碼雜湊明文未知，不應作為 E2E 測試憑證使用。
- **影響**：`e2e/tests/fidelity-f117-dept-ratio.spec.ts` 若採真實瀏覽器登入流程，缺少可用的 director/section_chief 憑證。**已採取的因應**：(a) 依 F079 BR-7「`admin` OR `business_role='director'`」之等價語意，E2E 中以既有 `admin@cdmp.test` 帳號涵蓋所有「部長可寫」情境（AC-1~8、AC-10），此非權宜替代而是規格明文之等價路徑；(b) `section_chief` 唯讀情境改以前端 Component 測試（`dept-ratio-config-page.test.tsx`，`mockedGetBusinessRole.mockReturnValue('section_chief')`）覆蓋，不依賴真實登入；後端 403 攔截已由 `TS-F117-INT-004`（in-memory SQLite + `buildSectionChief()` fixture，真實 HTTP round-trip）覆蓋，此路徑**不受本缺口影響**。故本缺口實際未遺漏任何 AC 的可執行覆蓋，僅是「真實瀏覽器 UI 呈現 section_chief 唯讀畫面」此一項未被 Playwright 層覆蓋（該畫面渲染邏輯已由前端 Component 測試覆蓋）。
- **建議**：若未來需要真實瀏覽器覆蓋 section_chief 唯讀畫面，建議由 product-analyst / QA 決定是否於 `seed.ts` 新增 1 組 `business_role='section_chief'` 之 dev-only 測試帳號（**production 程式碼變更，non-test-generator 範圍**，須經 tdd-implementation 或後續維護輪次處理，本輪不代為新增）。
- **風險等級**：中（不阻擋 TDD 進入實作；AC 覆蓋率未實際受損，僅為 E2E 層之「真實登入」深度略淺於理論最大值）

### R-F117-02（中，測試資料策略之刻意設計選擇，非缺陷）：E2E fidelity 測試對 GET/PUT `/api/v1/assignment/ratios/dept/**` 採 `page.route()` 攔截而非真實 DB round-trip

- **問題**：本機/CI 環境無法保證存在一份真實、穩定的 `stage='dept_ratio'` 名單（含孤兒部門情境所需的 `ob_dept_pct` 既有列 + `ob_emphire` 處長缺席組合），且 dev MSSQL 為外部共用資料庫（見專案記憶 `feedback_mssql_e2e_tests_wipe_dev_cdmp_tables`），不宜由 E2E 測試自行寫入/清空業務資料表製造 fixture。
- **影響**：`e2e/tests/fidelity-f117-dept-ratio.spec.ts` 對「前端如何渲染三分類 / 空狀態 / 已隱藏資訊列」之斷言，資料來源為 `page.route()` 依 prototype 29a 之 6 個 demo 場景固定供應的 mock response，而非真實後端運算結果。真實後端運算正確性（BR-1~BR-9）已由 **TS-F117-BE-\*（mock repo unit）+ TS-F117-INT-\*（in-memory SQLite 真實 HTTP+Guard+DB round-trip）** 覆蓋，故業務邏輯正確性不依賴 E2E 層；E2E 層之獨有價值（建置/路由/proxy/Sidebar 導覽層級 fidelity）不受此設計影響。
- **建議**：若日後建立穩定的 E07 dev fixture 資料集（例如透過一次性 fixture-provisioning script 建立固定 `list_no` 供 CI 使用），可將部分 E2E 案例（如 TS-F117-E2E-001）改為真實 GET round-trip 以進一步驗證前後端契約一致性；此為技術債，非本輪阻塞項。
- **風險等級**：中（不阻擋 TDD 進入實作；業務邏輯正確性已由 Unit + Integration 兩層真實覆蓋，E2E 層僅犧牲「前後端真實串接」此一額外保證，未犧牲「前端渲染忠實度」本身的驗證力）

### R-F117-03（低，命名對齊提醒，非阻擋）：Sum Banner 之 test-id 沿用既有 F079 命名（`dept-ratio-sum-banner`），與 prototype 29a 新標註之 `data-testid="ratio-sum-banner"` 字面不同

- **問題**：`prototypes/29a-dept-ratio-config.html` 為 F117 UI ground truth，其 `#sumBanner` 元素標註 `data-testid="ratio-sum-banner"`；但既有 `apps/web/src/pages/assignment/_components/__tests__/dept-ratio-form.test.tsx`（F079，已通過）已以 `dept-ratio-sum-banner` 作為該元素之 test-id 並持續沿用。兩者指向同一元件、同一互動行為（僅 F117 擴充其加總組成顯示），並非兩個不同元素。
- **影響**：若 tdd-implementation 逐字比對 prototype 的 `data-testid` 屬性字串並重新命名既有元件，會造成不必要的破壞性變更（且與既有 F079 測試脫鉤，需連帶修改該測試——而該測試檔案之維護者為 test-generator，非 tdd-implementation）。
- **建議**：本輪 `F117-test.md` §三已明確採用既有 `dept-ratio-sum-banner` 命名，不要求重新命名。tdd-implementation 落地時延續既有 test-id，不需比對 prototype 逐字元素 ID。若日後 ui-ux-designer 認為 prototype 命名需要與實作對齊，應走正式的 prototype/測試調整流程（由 test-generator 統一更新），而非由實作端片面決定命名。
- **風險等級**：低（已有明確決策與測試斷言因應，純屬 prototype 與既有實作命名之歷史差異，非設計缺陷）

### R-F117-04（中，spec/contract 內部矛盾，架構層待 System Architect 回頭調和）：`RATIO_DEPT_DIRECTOR_REQUIRED` 錯誤回應信封形狀，`error-handling.md` §「標準錯誤回應格式」與 `contracts/F117-dept-ratio.contract.ts`（巢狀 `{error:{code,message,details}}`）與全 repo 既有 e2e 慣例（扁平 `{error:'CODE',message}`，22 個既有 `*.e2e-spec.ts` 檔、262 處 `res.body.error` 斷言，含 F117 自身沿用之 `f081-f085-f089-rollback.e2e-spec.ts` 範本與 F079 既有 `RATIO_SUM_NOT_100`/`RATIO_OUT_OF_RANGE` 之 unit 斷言 `personnel-ratio.service.spec.ts:167`）互相矛盾

- **問題**：`error-handling.md`（v1.19，已核可）之「標準錯誤回應格式」章節（第 41~59 行）與同輪新增之 `docs/specs/contracts/F117-dept-ratio.contract.ts`（`RatioDeptDirectorRequiredError` 型別）皆將 `RATIO_DEPT_DIRECTOR_REQUIRED` 之回應信封定義為巢狀物件 `{ error: { code, message, details } }`。但本專案全部既有 e2e 測試（含 F117 自身在 §二 明文沿用之 bootstrap 範本 `f081-f085-f089-rollback.e2e-spec.ts`）一致採用扁平信封 `{ error: 'CODE_STRING', message }`（`res.body.error` 直接 `toBe('CODE')`），且 F079 既有錯誤碼（`RATIO_SUM_NOT_100` / `RATIO_OUT_OF_RANGE`，同一 `assignment-ratio-errors` 錯誤碼表）之既有 unit 測試 `personnel-ratio.service.spec.ts:167` 亦是 `e.response.error` 直接等於扁平字串。`error-handling.md` 全文（含 v1.0~v1.19 逐輪修訂紀錄）未曾提及此落差，判斷應為長期存在、未被實作端遵循之抱負性（aspirational）文件敘述，而非本輪刻意翻新之設計決策；`F117-dept-ratio.contract.ts` 之巢狀範例應是沿引 `error-handling.md` 該敘述性範例時一併複製了此落差，而非重新查證共用 `HttpExceptionFilter` 實際轉發行為後之刻意決定（該 filter 為全站共用元件，變更會是 F117 §1 明言排除在外的「repo-wide breaking change」）。
- **本輪裁決（test-generator，2026-08-04，回應 tdd-implementation 對 `TS-F117-INT-003` 之爭議）**：`apps/api/test/f117-dept-ratio-director-filter.e2e-spec.ts` 之 `TS-F117-INT-003` 已改採**扁平**信封（`expect(res.body.error).toBe('RATIO_DEPT_DIRECTOR_REQUIRED')`），與全 repo e2e 慣例、F079 既有錯誤碼慣例、F117 §1「不變更 F079 既有錯誤語意」之範圍聲明一致。裁決理由：(a) 巢狀信封若要落地，共用 `HttpExceptionFilter` 需對此單一錯誤碼特殊處理或全站信封改版，兩者皆超出 F117 疊加限縮之範圍；(b) `error-handling.md`／`contract.ts` 之巢狀敘述與 22 個既有 e2e 檔案之實測慣例矛盾時，未經驗證的抱負性文件不應凌駕已驗證、一致、大量覆蓋之既有測試慣例；(c) 若日後系統性導入巢狀信封為全站標準，屬架構層決策（`http-exception.filter.ts` 變更），非 F117 範圍，亦非 test-generator 可單方裁定，需 System Architect 主導並回頭同步全部既有 e2e 斷言。
- **待辦**：建議 System Architect 於下一輪架構維護排程檢視 `error-handling.md` §「標準錯誤回應格式」是否仍為有效目標（若是，需規劃全站遷移；若否，應改寫該章節為實際已生效之扁平格式，並同步修正 `F117-dept-ratio.contract.ts`），避免下一個新錯誤碼的 spec 作者重蹈同一落差。
- **風險等級**：中（不阻擋本輪 TDD 進入實作；已於本輪測試檔案內裁定並修正，`TS-F117-BE-010` 之既有寬鬆斷言 `e.response?.error ?? e.response?.error?.code ?? e.message).toContain(...)` 與扁平信封相容，兩測試現已可同時綠燈；殘留風險僅為 `error-handling.md`／contract 文件本身尚未回頭同步）

### R-F117-05（已修正，測試基礎設施缺口，非業務規則缺口）：Stryker mutation gate 之 `vitest.configFile` 誤指向全域 unit config，導致 dry run 完全無法產出分數

- **問題**：`apps/api/stryker.conf.json` 原將 `vitest.configFile` 指向 `vitest.config.ts`（全域 unit config，`include: ['src/**/*.spec.ts', 'test/**/*.spec.ts']`）。此設定造成兩個獨立缺陷：(a) Stryker 的 initial dry run 會執行 include 集合內**全部**測試，其中 `src/database/__tests__/mssql-p1b1.mssql.spec.ts` 之 `TS-MSSQL-P1B1-DEFAULT-002` 為 HEAD baseline 即紅（UTC+8 時差既有缺陷，經 `npx vitest run --config vitest.config.ts src/database/__tests__/mssql-p1b1.mssql.spec.ts` 實測重現，`expected 28799606 to be less than 300000`），與 F117 完全無關；Stryker 要求 dry run 全數通過才能產出突變分數，此一既有紅測試使整條 mutation gate 完全無法運作（非分數偏低，而是無分數）；(b) `test/**/*.spec.ts` 這個 glob 依字面比對不會匹配本專案 e2e/integration 測試慣用的 `*.e2e-spec.ts` 命名（全 `apps/api/test/` 下 29+ 個既有檔案皆用此慣例，另有專用之 `vitest.e2e.config.ts` 以 `include: ['test/**/*.e2e-spec.ts']` 執行），因此 `test/f117-dept-ratio-director-filter.e2e-spec.ts` 從未真正參與 mutation run——而該檔案是唯一能殺死 `computeActiveDirectorMap()` 內 TypeORM QueryBuilder SQL 字串突變（`'TRIM(e.dept_code)'`、`'處長'`、orderBy 方向）的測試，mock repo 的 unit test 在結構上無法偵測這類突變。
- **裁決**（test-generator，2026-08-04，回應 tdd-implementation dispute #1）：兩項皆為 test-generator 自身 ring 授權範圍內之設定缺陷，production 側無對應可解之改動。新增 `apps/api/vitest.mutation.config.ts`，include 僅限 F117 觸及之兩檔（`src/modules/assignment-stage/__tests__/dept-ratio.service.spec.ts` + `test/f117-dept-ratio-director-filter.e2e-spec.ts`），並改 `stryker.conf.json` 之 `vitest.configFile` 指向此檔。已實測 `npx vitest run --config vitest.mutation.config.ts` 僅匹配上述兩檔，2 files / 26 tests 全綠，dry run 可正常產出分數。
> **📍 後續（2026-08-05）**：本節所述之 `stryker.conf.json` / `vitest.mutation.config.ts` 已於 R-F118-08 拆分為 `stryker.dept-ratio.conf.json` + `stryker.assignment-list.conf.json`（及對應之兩份 vitest config）並刪除。本節保留為當時裁決之歷史紀錄。

- **是否影響 F117 §10「後端測試須同時涵蓋 SQLite unit 與 MSSQL spec 兩軌」**：不影響。AD-E07-48 §9 已裁定 F117 無 PG/MSSQL-only 依賴，「兩軌」由既有 `emphire-active.util` 之既有兩軌 dialect 測試涵蓋，F117 本身無需新增 dialect-only 測試分支；縮限 Stryker include 範圍不改變任何測試檔案之內容或既有覆蓋率，僅修正 mutation gate 自身可否產出分數。
- **風險等級**：已修正（不阻擋 TDD 實作；`mssql-p1b1.mssql.spec.ts` 之既有紅測試本身仍待該檔維護者另行修復，與本次裁決範圍無關）

### R-F117-06（已修正，測試基礎設施缺陷）：`e2e/tests/fidelity-f117-dept-ratio.spec.ts` 之 project 範圍與載入閘 locator 缺陷

- **問題 A**：本檔未做 Playwright project 限制。`npm run test:e2e`（`playwright test`，無 `--project` 過濾）會在 `playwright.config.ts` 的 `admin` 與 `user` 兩個 project 下各跑一次全部 5 個 scenario。`user` persona 依 F079 AC-8 / F117 AC-9 本就無 E07 入口（403 `AUTH_FORBIDDEN`、不渲染入口），該路徑已由 `apps/api/test/f117-dept-ratio-director-filter.e2e-spec.ts` 的 `TS-F117-INT-004` 以真實 HTTP+Guard round-trip 覆蓋，非本檔（前端渲染 fidelity）待驗證對象；不加守衛時，本檔在 `user` project 下必然全紅，等同斷言「無權限 persona 應看見部長專用 UI」，與 AC-9 矛盾。
- **問題 B**：共用 helper `gotoDeptRatioPage()` 原以 `page.getByTestId('dept-ratio-form').or(page.getByTestId('no-active-director-empty-state'))` 作為頁面就緒等待閘。AC-7 末句／prototype demo⑥（`empty_orphan` 場景，`TS-F117-E2E-004`）明訂空狀態與孤兒鎖定列可並存於同一畫面，此時兩個 testid 會同時匹配到元素；`.or()` 為聯集 locator，兩者皆存在時 resolve 到 2 個元素，對 `toBeVisible()` 這類要求單一元素的斷言會觸發 Playwright strict mode violation（`resolved to 2 elements`），且此為 locator 機制本身、與斷言內容無關，設 `display:none` 亦無效。
- **裁決**（test-generator，2026-08-04，回應 tdd-implementation dispute #2/#3/#4）：兩者皆為本檔（test-generator 專屬授權範圍）之實作瑕疵，不觸及任何斷言本體。修正：(a) 於 `test.describe` 內加 `test.beforeEach` + `test.skip(testInfo.project.name !== 'admin', ...)`，讓本檔於 `user` project 下正確 skip（而非 fail）；(b) helper 之聯集 locator 改為 `.or(...).first()`——聯集中只要有一元素已渲染即視為就緒，兩者並存時任取其一必為 visible，不影響、不弱化任一測試之獨立斷言。已實測 `E2E_BASE_URL=http://localhost:5174 npx playwright test tests/fidelity-f117-dept-ratio.spec.ts`（不帶 `--project`，對照 `npm run test:e2e` 之無過濾行為）：`admin` project 5/5 全綠（含先前因 strict mode violation 而紅的 `TS-F117-E2E-004`）、`user` project 5/5 皆為 `skipped`（非 `failed`）。
- **風險等級**：已修正

---

## F118 從上月複製名單顯示「已複製過」提示測試風險與待決問題（AD-E07-48，2026-08-04 新增）

> 完整測試設計見 [features/F118-test.md](features/F118-test.md)（US-181，42 場景：後端 Unit/Integration 11 + Route/RBAC 9 + E2E 4 + 前端 Component 9 + Page 整合 5 + E2E Fidelity 4）。F118 spec 本身之業務裁決（D-1~D-8）已於 2026-08-04 人工審閱閘全數核可（含 OQ-F118-B2/B3 兩項阻塞事項），本節記錄的是**測試基礎設施層級**（非業務規則層級）之殘留缺口與設計裁量，均不阻擋 TDD 進入實作。

### R-F118-01（低，AC-6 之測試邊界說明，非缺口）：「不引入快取」無獨立可測之負向案例

- **問題**：F118 AC-6/BR-6 明訂「Modal 每次開啟重新查詢」（不引入快取）。此為**設計層級不變式**——`checkCopyDuplicates(prevYm, currentYm)` 方法簽章本身即為純函式式查詢（無任何快取層之注入點、無 memoization），若實作真的引入快取，會是一個**新增**的程式碼路徑而非「移除既有防護後才會出現的缺陷」，故無法比照一般負向測試（「移除防護 → 斷言防護不存在」）設計反向案例。
- **裁決**：TS-F118-BE-001 等每次呼叫皆為獨立、無共享狀態之 `beforeEach` 清空 DB 重建情境，已隱含驗證「每次呼叫皆為即時查詢」（若有跨呼叫快取，BE-006「本月等價名單 status 改 disabled 後 alreadyCopied 應變為 false」等測試會因快取到舊結果而失敗）。不另立獨立 AC-6 案例，於總表註記為「由查詢設計本身保證」。
- **風險等級**：低，資訊性記錄。

### R-F118-02（中，測試資料策略之刻意設計選擇，非缺陷）：E2E Fidelity 測試對 GET `/assignment/lists/copy-duplicate-check` 採 `page.route()` 攔截而非真實 DB round-trip

- **問題**：與 R-F117-02 同型。無穩定存在於 dev DB 的「上月候選 + 本月等價名單」配對可供 Playwright 對照，亦無已知穩定 `director`/`section_chief` 測試帳號（見 R-F117-01，同一缺口，未在本輪重複記錄）。
- **決策**：`e2e/tests/fidelity-f118-copy-duplicate.spec.ts` 以 `page.route()` 攔截 `GET **/assignment/lists**`（候選）與 `GET **/copy-duplicate-check**`（判定）供應固定回應，同時對真實運行中的前端執行導覽/點擊/斷言 DOM，故仍能捕捉建置/路由/proxy 層漂移；後端業務規則（BR-1~BR-9）之真實正確性由 §一~三之後端測試（真實 SQLite / 真實 HTTP+Guard+DB）三層真實覆蓋，不依賴本檔。已以 `npx playwright test --list` 靜態驗證 4 案例可正確解析列舉（本輪authoring 環境無可用 `npm run web:dev` live stack 執行，同 cdmp-project-facts 記憶）。
- **建議**：與 R-F117-02 相同，技術債非本輪阻塞項。

### R-F118-03（中，既有程式碼缺陷之回歸測試，非 F118 新增缺陷）：`findActiveConditionDuplicate` 現行查詢無 `ORDER BY`，多筆歷史等價名單時 `conflictListNo` 非決定性

- **問題**：`AD-E07-48 §2 事實 4 / §5.3` 已明文記錄此既有小缺口——`findActiveConditionDuplicate` 之候選查詢無顯式排序，多筆同簽章候選時選取結果依 DB 隱式順序。TS-F118-BE-011 以「刻意先插入 `list_no` 較大者、後插入較小者」之歷史異常資料重現此缺陷，**已實測**（2026-08-04）：`npx vitest run src/modules/assignment-list/__tests__/f118-copy-duplicate-check.spec.ts` 顯示該案例目前回傳 `conflictListNo='OB202605999'`（後插入的較小者被期望值，實際回傳先插入的較大者，即 SQLite 隱式 rowid 順序），與期望之 `'OB202605001'`（`list_no` 字典序最小者）不符——這是**紅燈**，但紅得「不是因為方法不存在」而是「因為既有行為與 AD 裁定的目標行為不同」，性質與其餘 10 個因 `checkCopyDuplicates` 不存在而 TypeError 的案例不同，特此記錄避免被誤判為斷言寫錯。
- **決策**：此為 AD-E07-48 §5.3 明訂之修復對象（`findActiveConditionDuplicate` 補 `ORDER BY l.list_no ASC` 一行），非 test-generator 越界修復生產碼；`tdd-implementation` 實作 F118 時應連帶完成此修正（Implementation Checklist 已列為必要項）。
- **風險等級**：中（不阻擋 TDD 進入實作；此為既有已上線程式碼之唯一修改點，AD §10.3 已明確要求連帶回歸測試，本項即為該測試）。

### R-F118-04（已解決，2026-08-04 dispute #2 裁決）：ESLint 複雜度 gate 原本無法區分「既有 14 項 pre-existing 違規」與「F118 新增違規」，任何正確實作皆會恆紅

- **問題**（原始記錄）：`apps/api/eslint.ring.config.cjs` 追加對 `assignment-list.service.ts`/`.controller.ts` 之 `files` 區塊後，**已實測**（2026-08-04）`npx eslint -c eslint.ring.config.cjs src/modules/assignment-list/assignment-list.service.ts src/modules/assignment-list/assignment-list.controller.ts` 回報 14 個 pre-existing 違規：`previewHitCount`（complexity 13）、`deriveBackwardCompatColumns`（14）、`normalizeConditionPayload`（16）、`listLists`（複雜度 22 + 149 行）、`createList`（複雜度 11 + 122 行）、`updateList`（複雜度 21 + 133 行）、`calculateInactiveOptionWarnings`（13）、`findActiveConditionDuplicate`（複雜度 11，F118 於此方法新增 1 行 `ORDER BY`，經實測不改變其複雜度計數）、`getFullSnapshot`（複雜度 37 + 118 行）。全數為既有、F118 開工前即存在之技術債。**原始裁決僅止於「如實記錄」，未處理 gate 腳本本身作為 CI exit-code 閘門時，14 項既有違規會使 `npm run gate:complexity:f118` 對任何實作（不論是否新增違規）恆回傳非 0——此為一個機器無法通過的假閘門，違反「機器可判、對正確實作可通過」的 ring 前提**。
- **裁決（implementer dispute #2，2026-08-04）**：實作方提出爭議並實測佐證——`git show HEAD:...assignment-list.service.ts`（F118 開工前）套用同一 config 產出**完全相同**之 14 項違規（僅行號因新增程式碼位移而不同，訊息文字逐字相同），且 `checkCopyDuplicates` 本身未被任何規則命中、`max-lines`（1650）未被突破。裁定**採納**：測試機器改為 `apps/api/scripts/gate-complexity-diff.cjs` + `apps/api/eslint-baseline.f118.json`（由 HEAD 產出之 14 項違規基準線，比對鍵為 `(file basename, ruleId, message)`，訊息文字含複雜度/行數數值，故基準線函式之數值若被改壞會重新被判定為新違規），`gate:complexity:f118` 改呼叫此腳本。**未放寬任何門檻數值**——`eslint.ring.config.cjs` 本身完全未變更，僅新增「新舊違規區分」這層機器可判邏輯。已實測驗證：(a) 對現行實作（含 F118 變更）跑出 `PASS（0 new violations；14 個已知基準線違規已忽略）`；(b) 暫時注入一個刻意複雜度過高的新函式驗證 gate 正確回報「1 個新違規」並失敗，驗證後即還原。
- **建議**：14 項既有違規之清理仍為獨立技術債，建議日後另立重構任務（例如拆分 `getFullSnapshot`/`listLists`/`updateList`），不在 F118 範圍內處理；`eslint-baseline.f118.json` 應隨這類重構同步更新（移除已修復項目），避免基準線隨時間長期偏離現況。
- **風險等級**：已解決，機器可判、對正確實作可通過。

### R-F118-05（低，Stryker 檔案級 mutate 粒度之已知限制，非缺陷）

> **📍 後續（2026-08-05）**：本節所述之單一 `stryker.conf.json` 已由 R-F118-08 拆分為兩份標的各自設門檻並刪除；本節保留為歷史紀錄。
：`assignment-list.service.ts` 整檔納入 mutate 範圍，而非僅新增之 `checkCopyDuplicates`

- **問題**：Stryker 的 `mutate` 設定為檔案 glob 粒度，無法僅指定「檔案內某個方法」；test-generator 亦不得編輯 production 檔加註 `// Stryker disable next-line` 排除既有無關程式碼（越界修改生產碼）。因此 `stryker.conf.json` 追加 `assignment-list.service.ts` 後，Stryker 會對整個 1580 行檔案產生突變，而非僅 `checkCopyDuplicates` 新增之 ~50-70 行。
- **裁決**：若僅將本輪新增的 `f118-copy-duplicate-check.spec.ts` 納入 `vitest.mutation.config.ts` 之 dry-run include，該檔其餘既有邏輯（`createList`/`updateList`/`normalizeConditionPayload` 等）之突變會因涵蓋它們的既有測試不在 include 內而被判定 `NoCoverage`（視同存活突變），拖累出一個「看似低但其實失真」的分數。改為將該模組**全部既有 19 個 SQLite unit spec**（`src/modules/assignment-list/__tests__/*.spec.ts`，排除 `.mssql.spec.ts`）一併納入 include——**已實測**（2026-08-04）`npx vitest run --config vitest.mutation.config.ts`（F117 兩檔 + F118 19+1 檔合併）：F117 部分 2 files/26 tests 綠燈；F118 部分因 `checkCopyDuplicates`/路由尚未實作而 2 files（`f118-copy-duplicate-check.spec.ts` 11 + `assignment-list.controller.spec.ts` 新增 `TC-F118` 區塊 9）共 20 tests 紅燈（預期中的紅，其餘既有 18 檔 356 tests 全綠，無回歸）；待 F118 實作完成、這 20 個測試轉綠後，Stryker dry run 即可正常產出分數。
- **是否影響 F118 §10「後端測試須同時涵蓋 SQLite unit 與 MSSQL spec 兩軌」**：不影響。AD-E07-48 §9 已裁定 F118 無 PG/MSSQL-only 依賴，本 feature 之邏輯全數可於 SQLite 覆蓋，不需新增 dialect-only 測試分支。
- **風險等級**：已由 R-F118-08 之拆分處置解決（見下）。

### R-F118-07（已解決，2026-08-05）：跨 workspace regression guard 於 Stryker 沙箱內 ENOENT，導致整條 mutation gate 無分數

- **問題**：`assignment-list.service.spec.ts` 之 `TS-F050-K01b` / `K01c`（依 `feedback_grep_negative_lookahead` 建立之 fs + regex dead-code 防迴歸守衛）以 `path.resolve(__dirname, '../../../../../web/src/pages/assignment/*.tsx')` 讀取 **apps/web** 之檔案。Stryker 僅將 `apps/api` 複製進 `.stryker-tmp/` 沙箱執行 dry run，該相對路徑於沙箱內解析為不存在的 `.stryker-tmp/web/...` → `ENOENT` → dry run 失敗 → **整條 mutation gate 完全無法產出分數**（非分數偏低）。此為既有測試設計缺陷，因 F118 將 `assignment-list.service.ts` 納入 `mutate` 而首次引爆。
- **裁決**：改為自 `__dirname` 逐層上溯，尋找實際存在 `apps/web/src` 的 repo root（沙箱內會一路上溯出 `.stryker-tmp` 找到真實 repo root，一般執行則於同一位置命中），最多上溯 12 層後拋出明確錯誤。**斷言內容一字未改**，僅修正路徑解析。已實測該 spec 39 tests 全綠，且 Stryker dry run 可正常完成。
- **風險等級**：已解決。凡日後新增跨 workspace 讀檔之守衛測試，皆須採同一 repo-root 錨定方式，不可用固定層數的相對路徑。

### R-F118-08（已解決，2026-08-05 人工裁決）：單一 Stryker run 合併計分，門檻數學上不可能達標

- **問題**：原 `stryker.conf.json` 於單次 run 同時 mutate `dept-ratio.service.ts`（515 行，F117 新碼佔比高）與 `assignment-list.service.ts`（1682 行，F118 新碼僅約 60 行），以單一 `break: 70` 對**聚合分數**把關。實測聚合 64.87%，且**數學上不可能達標**：門檻需殺掉 777/1110 個突變，實得 661，缺口 116；而 F118 新增區段全部突變僅 53 個（存活 18 + RuntimeError 4），即使測到完美也只能補 22 個，**仍差 94 個須靠既有 legacy 碼補**。gate 因此恆紅，淪為噪音而非約束。
- **裁決**（使用者，2026-08-05）：**拆成兩次 run，各自設門檻**。
  - `stryker.dept-ratio.conf.json` + `vitest.mutation.dept-ratio.config.ts` → mutate `dept-ratio.service.ts`，`break: 70`（**實測 75.36% 通過**，耗時 3m43s）。
  - `stryker.assignment-list.conf.json` + `vitest.mutation.assignment-list.config.ts` → mutate `assignment-list.service.ts`，`break: 61` 作為 **ratchet（只防退步）**，反映「1682 行既有大檔之技術債非 F118 造成、亦非 F118 可於本輪償還」之事實。**實測 63.35%**（503 killed / 174 survived / 117 no-coverage / 109 error；covered-score 74.30%）；另有合併設定下之同檔實測 62.19%（尚未含 BE-012~015），兩次差約 1.2pp 主因 error 分類浮動（91 vs 109），故取低約 2pp 之 61，避免被 run 間浮動誤殺。
  - npm scripts：`test:mutation:dept-ratio` / `test:mutation:assignment-list`，`test:mutation` 依序跑兩支。
- **為何不採其他選項**：(a) 維持單一門檻 → gate 恆紅、失去訊號；(c) 把 `assignment-list.service.ts` 移出 `mutate` → 等於完全不驗 F118 新碼，誠實度最低。
- **後續**：待 `checkCopyDuplicates` 等抽為獨立 service（檔案變小、新碼佔比提高）後，應同步調高 `assignment-list` 標的之 `break`。ratchet 值不得在未改善測試的情況下調降。
- **⚠️ 已知不穩定（Windows）**：`assignment-list` 標的之 Stryker dry run 偶發原生崩潰 `exit code 3221225477`（0xC0000005 ACCESS_VIOLATION），推測為 better-sqlite3 於沙箱內大量建立/銷毀 in-memory DataSource 所致；實測 4 次中失敗 3 次、成功 1 次，**同一份設定重跑即可通過**。伴隨出現之 `[vite] Failed to load source map ... stryker-setup.js.map` 僅為警告、非死因（曾嘗試以 swc `sourceMaps:false` 消除，對崩潰無效，已還原）。`dept-ratio` 標的僅 2 個 spec 檔，未觀察到此現象。**CI 採用本 gate 時須加重試機制**。
- **風險等級**：已解決（門檻政策）；不穩定性另記於上，屬環境層問題。

### R-F118-09（已解決，2026-08-05）：mutation testing 暴露 F118 新碼之實質測試缺口（AC-9 / BR-4 / AC-10）

- **問題**：首輪 Stryker 對 F118 新增區段（`buildConditionSignatureIndex` + `checkCopyDuplicates`，行 1392-1480）產生 53 個突變，**存活 18 個**（分數 58.49% total / 63.27% covered）。逐一檢視後確認**非雜訊，而是有 AC 但無有效測試**：
  - 上月候選之 `condition_payload !== null && !== undefined` 過濾被改為恆真 → 測試仍全綠，代表 **AC-9**（舊格式名單須排除於候選）無有效驗證。
  - 兩處 `order: { list_no: 'ASC' }` 被移除 → 測試仍全綠，代表 **BR-4** 決定性在 `checkCopyDuplicates` 自身路徑未驗（既有 TS-F118-BE-011 驗的是 `findActiveConditionDuplicate`）。
  - `if (sig === '') continue` 被改為不跳過 → 測試仍全綠，代表 **AC-10** 空簽章不得進索引未驗。
  - `if (!index.has(key))` 先到先贏改為後到覆蓋 → 測試仍全綠。
- **裁決**：新增 4 則測試 TS-F118-BE-012 ~ BE-015（AC-9 舊格式排除 / BR-4 多筆等價取 `list_no` 最小者 / AC-10 空簽章不進索引 / 本月舊格式名單之 legacy fallback 仍參與比對）。**並以手動施加突變驗證測試有效性**（非僅「測試存在」）：將候選過濾改為恆真 → BE-012 失敗；移除本月查詢之 `ORDER BY` → BE-013 失敗；還原後 15 tests 全綠。
- **風險等級**：已解決。此筆為 mutation gate 發揮實質作用之案例——單看 unit / e2e 全綠會誤判為「已充分測試」。

### R-F118-06（已解決，2026-08-04 dispute #3 裁決）：後端 Coverage gate `--coverage.include` 涵蓋整個 1680 行 legacy service，但原僅跑 2 個 spec 檔，數學上不可能達標

- **問題**：`gate:coverage:f118` 原設定 `--coverage.include` 為整個 `assignment-list.service.ts`/`.controller.ts`，門檻 80/80/75，但僅執行 `f118-copy-duplicate-check.spec.ts` + `assignment-list.controller.spec.ts` 兩檔——後者 mock 掉整個 service（對 service 覆蓋率貢獻趨近 0），前者只驅動 `createList` + `checkCopyDuplicates`，`listLists`/`updateList`/`disableList`/`getFullSnapshot`/`previewHitCount` 等既有邏輯完全未被觸及。**已實測**（implementer dispute 佐證 + test-generator 覆核）：以此設定跑出 service stmts 9.1% / funcs 0%，遠低於門檻；即便換另一組同樣以 `createList` 為主的既有 spec 亦僅達 stmts 46.1% / funcs 56.52%。
- **裁決**：**採納**。此與 `vitest.mutation.config.ts`（見 R-F118-05）已採用之解法同一道理——單一新 spec 檔案量測「整檔」覆蓋率在數學上必然失真。改為將 `gate:coverage:f118` 之測試檔清單擴大為該模組**全部既有 20 個 SQLite unit spec**（`src/modules/assignment-list/__tests__/*.spec.ts`，排除唯一的 `.mssql.spec.ts`），`--coverage.include` 維持鎖定 `assignment-list.service.ts` + `.controller.ts` 兩檔（未擴大範圍、未調降門檻）。**已實測**（2026-08-04，F118 已實作情境）：20 檔 350 tests 全綠，覆蓋率 stmts 93.19% / branch 79.25% / funcs 97.05% / lines 93.19%，三項門檻（80/80/75）皆通過。
- **風險等級**：已解決。

### R-F118-07（已解決，2026-08-04 dispute #4 裁決）：前端 Coverage gate 對 `src/api/assignment-list.ts` 之函式覆蓋率門檻在測試檔案結構下不可達

- **問題**：`gate:coverage:f118`（apps/web）原 `--coverage.include` 同時涵蓋 `copy-from-prev-month-modal.tsx` 與整個 `src/api/assignment-list.ts`（9 個匯出函式，橫跨 F048/F050/F051/F052/F077/F118 多個 feature），但兩個受測檔（`list-create-draft-page.test.tsx` 對 `@/api/assignment-list` 做 `vi.mock()` 自動 mock、`copy-from-prev-month-modal.test.tsx` 僅 type-only import）皆不會真正執行該模組任何函式本體。**已實測**：`assignment-list.ts` stmts 1.51% / funcs 0%；modal 檔本身單獨已達 100%/93.33%/100%/100%；聚合後 funcs 52.63% < 80% 門檻 → ERROR。若要達標須為 `listLists`/`createList`/`updateList`/`disableList`/`deleteList`/`getFullSnapshot`/`getCurrentWorkYm` 等 7 個與 F118 無關之既有函式另補契約測試——超出 F118 範圍（BR-1：判定邏輯全數在後端，前端 client 僅為 3 行 axios wrapper）。
- **裁決**：**採納**。(1) 新增 `apps/web/src/api/__tests__/assignment-list-copy-duplicate-check.test.ts`——沿用既有 `sampling-preview-clients.test.ts` 之慣例（僅 mock `../client`，`checkCopyDuplicates` 函式本體真實執行），驗證 GET URL / params 形狀（`{ prevYm, currentYm }`，AC-5）與 response passthrough，補上 F118 新增 API client 函式原本缺少的直接單元測試。(2) `gate:coverage:f118` 移除 `--coverage.include=src/api/assignment-list.ts`（該檔案為多 feature 共用之大檔，非 F118 專屬變更面，比照後端 dispute #2/#3 之「不得把既有大檔整檔強行納入單一 feature 門檻」原則），改為僅對 `copy-from-prev-month-modal.tsx` 設定覆蓋率門檻（其本身已是 F118 新增/修改之真正變更面），並將新增之 client 契約測試加入 gate 執行清單（實際跑但不對其設檔案級覆蓋率門檻）。**已實測**：3 檔 81 tests 全綠，`copy-from-prev-month-modal.tsx` stmts/branch/funcs/lines = 100/93.33/100/100，全數通過門檻。
- **風險等級**：已解決。

## F116 v1.1 樞紐分析頁籤 UX 精修測試風險與待決問題（AD-E07-49，2026-08-13 新增）

> 完整測試設計見 [features/F116-test.md](features/F116-test.md)（US-182，**37 個新場景**：後端
> Unit/Integration 21 + 前端 Component 16）。F116 v1.1 spec / AD-E07-49 之業務裁決已於 2026-08-13
> 人工審閱閘核可。以下記錄本輪測試基礎設施層級之刻意範圍簡化與設計裁量，均不阻擋 TDD 進入實作。

### R-F116-01（範圍簡化，使用者明確指示，非缺口）：本輪僅產出 vitest 束縛環

- **決策**：team-lead 於 2026-08-13 明確指示「test-generator 本次只做 vitest / jest 測試撰寫」，
  故本輪**不**建立 Playwright E2E fidelity 測試、**不**設定 Stryker mutation 門檻、**不**設定
  dependency-cruiser / ESLint 複雜度 / coverage gate script、**不**呼叫 `ring-setup` skill。標準
  test-generator 角色定義（束縛環四要素）本應涵蓋此四項，本項記錄係為避免此簡化被日後讀者誤判為
  「test-generator 疏漏」。
- **風險等級**：低（使用者決策，非技術缺口）。**若日後需要完整束縛環**：可比照 F117/F118 之
  `ring-setup` 既有落地（`e2e/`、`apps/api/stryker.*.conf.json`、`.dependency-cruiser.cjs`、
  `eslint.ring.config.cjs`）直接擴充涵蓋範圍，無需重新 bootstrap 工具鏈。

### R-F116-02（低，已驗證解法，記錄供未來同型場景參考）：SQLite 無法直接重現 `ob_emphire` 重複 `emp_id` 之 join fan-out 情境

- **問題**：I-F116-EMPHIRE-DEDUP-01（TS-F116-018）要求測試「`ob_emphire` 同 `emp_id` 兩列時，
  `getPivot` 之 `COUNT(*)` 不得被重複計入」，但 `synchronize:true` 建出的 SQLite 表對 `emp_id` 有
  真實 PK/UNIQUE 索引，`repo.save()`/`repo.insert()` 皆會在重複插入時拋錯或（`insert()` 之
  multi-row VALUES 會展開整個 entity 欄位集合）因表結構精簡而報 `no such column`。
- **解法（已驗證，見 F116-test.md §1.2 TS-F116-018 技術筆記）**：獨立一份 `:memory:` DB → `DataSource
  .query('DROP TABLE ob_emphire')` + 無 PK 之 `CREATE TABLE`（僅含查詢實際用到的 5 欄）→ 以 **raw
  SQL `INSERT`**（非任何 TypeORM repo 方法，完全繞過 entity metadata）寫入重複列。已實測此手法對
  現行（v1.0）未去重查詢正確重現缺陷（`grandTotal` 回傳 6 而非真實 3），證明手法本身有效、非測試
  誤判。
- **風險等級**：低，已解決；記錄手法供其他 feature 之類似「模擬違反 PK 約束之髒資料」測試需求參考。

### R-F116-03（低，設計裁量，非缺口）：前端測試 test-id 由 test-generator 定義

- **問題**：prototype `35-snapshot-detail.html` 之 `#panel-pivot` 使用 `data-pv-*` 系列屬性（如
  `data-pv-cell="total"`、`data-pv-row="dept"`），但既有 v1.0 React 元件已建立**另一套**
  `data-testid` 命名慣例（`pivot-table`/`pivot-dept-{name}`/`pivot-mode-pct` 等），二者非同一套。
- **決策**：延續既有 React 元件之 `data-testid` 慣例（而非改採 prototype 原生 `data-pv-*` 詞彙），
  新增 `pivot-emp-{emplid}`/`pivot-total-row`/`pivot-cell-total`/`pivot-cell-list-{listNo}`/
  `pivot-header-*`/`pivot-dim-*`/`pivot-workday-*`/`pivot-newcomer-badge`（完整清單見
  F116-test.md「本文件新定義之 test-id」節），理由：避免同一元件混用兩套選擇器慣例造成後續維護
  混淆；`data-testid` 為既有 v1.0 測試已建立之唯一選擇器管道。
- **風險等級**：低，資訊性記錄（比照 F118 R-F118 系列「新定義 test-id」之既有慣例）。

### R-F116-04（低，測試邊界說明，非缺口）：I-F116-CALENDAR-SHARE-01 未獨立測試 `computeWorkingDayRatios` 複用本身

- **問題**：AD-E07-49 §7 之 I-F116-CALENDAR-SHARE-01 要求 `workingDays` 必須透過既有
  `computeWorkingDayRatios`（`CalendarSource='weekday'`）取得，禁止另立第二套週末/假日判斷邏輯。
  本輪未直接斷言「`getPivot` 呼叫了 `computeWorkingDayRatios`」（該函式已由 `stage0-estimate.service
  .spec.ts` 獨立驗證其行為，重新驗證屬重複測試），而是以 TS-F116-020 之月界邊界資料（混合工作日/
  例假日/跨月日）間接驗證 `workingDays` 數值正確性——若實作另立第二套判準（例如純週一至週五、未排
  除國定假日），該案例會因 07-02 被誤判為工作日（若改用「純週一至週五」判準，07-02 為週四仍算工作
  日，數值不會偏離）而不易被此間接測試偵測到所有可能的錯誤變體。
- **決策**：暫不視為阻擋項——I-F116-CALENDAR-SHARE-01 之核心風險（誤用 `Date` 物件導致 UTC+8 邊界
  漏算，T-3）已由 TS-F116-020 之月界資料直接覆蓋；「換一套判準邏輯」風險相對低，因 AD 已明文要求
  複用既有 exported 函式（架構層級裁定，非行為層級可測項）。若日後需要更嚴格驗證，可補一則 spy
  `computeWorkingDayRatios` 呼叫次數/參數之測試。
- **風險等級**：低，記錄供未來加強參考。
