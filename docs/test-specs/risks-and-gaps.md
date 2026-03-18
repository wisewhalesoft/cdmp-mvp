---
type: test-design-risks
last_updated: 2026-03-18
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

## 更新紀錄

| 日期 | 變更內容 | 負責人 |
|------|---------|--------|
| 2026-03-12 | 初版建立，彙整 16 個 Feature 測試設計過程中的風險與缺口 | Test Designer Agent |
| 2026-03-18 | 新增 E04 資料擷取模組 6 項風險（E04-RISK-001 至 E04-RISK-006），均已獲核准解決方案 | Test Designer Agent |
| 2026-03-18 | 新增 raw data 落地需求 6 項風險（RAW-RISK-001 至 RAW-RISK-006）；RAW-RISK-004/005/006 為高風險，需於實作前確認 | Test Designer Agent |
| 2026-03-18 | 新增連鎖下拉選單需求 4 項風險（SCHEMA-RISK-001 至 SCHEMA-RISK-004）；SCHEMA-RISK-001/002 為中風險，001 影響 CI 穩定性，002 影響前端顯示設計 | Test Designer Agent |
